import prisma from '../../config/database.js';
import {
  getShippingRateForCountry,
  loadShippingRateMap,
} from '../shippingRateController.js';
import { loadAdSpend } from '../adSpendController.js';
import { allocateFixedCosts } from '../fixedCostController.js';
import {
  COMMISSION_RATE,
  ORDER_SELECT,
  STATUS_SUPPORT,
  buildOrderWhere,
  handleError,
  isCancelled,
  resolveQuantity,
  resolveRequestScope,
  resolveUnitPrice,
  round2,
  stripVat,
  summarize,
  toIsoDay,
  toNetRevenue,
  trend,
} from './shared.js';

/**
 * Analytics Overview — het totaaloverzicht van omzet, kosten en marge.
 */

/**
 * Filteropties voor de globale filterbalk. Los van de gekozen periode, zodat
 * de opties niet verdwijnen zodra je filtert.
 */
export const getAnalyticsFilters = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const [storeRows, countryRows] = await Promise.all([
      prisma.order.findMany({
        where: { installationId: scope.installationId },
        select: { storeName: true },
        distinct: ['storeName'],
        orderBy: { storeName: 'asc' },
      }),
      prisma.order.findMany({
        where: { installationId: scope.installationId },
        select: { country: true },
        distinct: ['country'],
        orderBy: { country: 'asc' },
      }),
    ]);

    res.json({
      stores: storeRows.map((row) => row.storeName).filter(Boolean),
      countries: countryRows.map((row) => row.country).filter(Boolean),
    });
  } catch (error) {
    handleError(res, 'Filters', error);
  }
};

export const getAnalyticsOverview = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const [currentOrders, previousOrders] = await Promise.all([
      prisma.order.findMany({
        where: buildOrderWhere({ ...scope }),
        select: ORDER_SELECT,
        orderBy: { orderDate: 'asc' },
      }),
      prisma.order.findMany({
        where: buildOrderWhere({ ...scope, from: scope.previous.from, to: scope.previous.to }),
        select: ORDER_SELECT,
        orderBy: { orderDate: 'asc' },
      }),
    ]);

    const current = summarize(currentOrders);
    const prior = summarize(previousOrders);

    // Omzet per dag.
    const dailyMap = new Map();
    for (const order of currentOrders) {
      const day = toIsoDay(order.orderDate);
      if (!dailyMap.has(day)) dailyMap.set(day, { date: day, revenue: 0, orders: 0, cancelled: 0 });
      const bucket = dailyMap.get(day);
      if (isCancelled(order)) {
        bucket.cancelled += 1;
      } else {
        bucket.revenue += toNetRevenue(order);
        bucket.orders += 1;
      }
    }
    const daily = Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({ ...entry, revenue: round2(entry.revenue) }));

    // Omzet per store.
    const storeMap = new Map();
    for (const order of currentOrders) {
      const key = order.storeName || '-';
      if (!storeMap.has(key)) storeMap.set(key, { store: key, revenue: 0, orders: 0, cancelled: 0 });
      const bucket = storeMap.get(key);
      if (isCancelled(order)) {
        bucket.cancelled += 1;
      } else {
        bucket.revenue += toNetRevenue(order);
        bucket.orders += 1;
      }
    }
    const byStore = Array.from(storeMap.values())
      .map((entry) => ({
        ...entry,
        revenue: round2(entry.revenue),
        cancelPct:
          entry.orders + entry.cancelled > 0
            ? entry.cancelled / (entry.orders + entry.cancelled)
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const activeOrderIds = currentOrders.filter((order) => !isCancelled(order)).map((order) => order.id);

    // Alle regels van de actieve orders. Deze set voedt zowel de top producten
    // als de inkoopkosten van voorraadorders.
    const items =
      activeOrderIds.length > 0
        ? await prisma.orderItem.findMany({
            where: { orderId: { in: activeOrderIds } },
            select: {
              ean: true,
              sku: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              price: true,
              product: { select: { purchasePrice: true } },
              purchaseOrder: { select: { id: true } },
              order: { select: { country: true, fulfillmentType: true } },
            },
          })
        : [];

    // Top producten — omzet komt hier uit de losse orderitems, niet uit orderValue.
    const productMap = new Map();
    for (const item of items) {
      const key = String(item.ean || item.sku || item.productName || '').trim() || 'onbekend';
      if (!productMap.has(key)) {
        productMap.set(key, {
          key,
          ean: item.ean,
          sku: item.sku,
          productName: item.productName,
          revenue: 0,
          units: 0,
        });
      }
      const bucket = productMap.get(key);
      const quantity = resolveQuantity(item);
      bucket.revenue += stripVat(resolveUnitPrice(item) * quantity, item.order?.country);
      bucket.units += quantity;
    }

    const topProducts = Array.from(productMap.values())
      .map((entry) => ({ ...entry, revenue: round2(entry.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    /*
     * Kosten. De inkoop komt uit twee bronnen:
     *
     *  - Dropship: de verwerkte inkooporders, waar de inkoper de werkelijk
     *    betaalde prijs heeft ingevuld.
     *  - Voorraad: die orders hebben geen inkooporder, dus nemen we de
     *    inkoopprijs zoals die op het product staat.
     *
     * Advertenties en vaste kosten bestaan nog niet als databron en blijven 0
     * tot die tabs er zijn.
     */
    const purchaseOrders =
      activeOrderIds.length > 0
        ? await prisma.purchaseOrder.findMany({
            where: { orderId: { in: activeOrderIds }, status: 'ordered' },
            select: { buyPriceNet: true, shippingCost: true, commissionAmount: true },
          })
        : [];

    const sumField = (field) =>
      round2(purchaseOrders.reduce((total, po) => total + (Number(po[field]) || 0), 0));

    /*
     * Voorraadorders hebben geen inkooporder, dus die kosten leiden we zelf af:
     *
     *  - inkoop uit `Product.purchasePrice` (staat al exclusief btw)
     *  - commissie als vast percentage van de brutoverkoopprijs
     *  - verzendkosten per order uit de ingestelde tarieven per land
     */
    const isStockItem = (item) =>
      !item.purchaseOrder && item.order?.fulfillmentType !== 'dropship';

    let stockCogs = 0;
    let stockCommission = 0;

    for (const item of items) {
      if (!isStockItem(item)) continue;

      const quantity = resolveQuantity(item);
      const purchasePrice = Number(item.product?.purchasePrice) || 0;

      if (purchasePrice > 0) stockCogs += purchasePrice * quantity;
      stockCommission += resolveUnitPrice(item) * quantity * COMMISSION_RATE;
    }

    // Verzendkosten gelden per order, niet per regel.
    const shippingRateMap = await loadShippingRateMap(scope.installationId);
    let stockShipping = 0;

    for (const order of currentOrders) {
      if (isCancelled(order)) continue;
      if (order.fulfillmentType === 'dropship') continue;
      stockShipping += getShippingRateForCountry(shippingRateMap, order.country);
    }

    const adSpend = await loadAdSpend(scope.installationId, scope.from, scope.to, scope.stores);

    const costs = {
      cogs: round2(sumField('buyPriceNet') + stockCogs),
      shippingCosts: round2(sumField('shippingCost') + stockShipping),
      commission: round2(sumField('commissionAmount') + stockCommission),
      adSpend: adSpend.total,
      fixedCosts: await allocateFixedCosts(scope.installationId, scope.from, scope.to),
    };

    const totalCosts = Object.values(costs).reduce((total, value) => total + value, 0);
    const netProfit = round2(current.netRevenue - totalCosts);
    const netMarginPct = current.netRevenue > 0 ? netProfit / current.netRevenue : 0;

    res.json({
      range: {
        from: toIsoDay(scope.from),
        to: toIsoDay(scope.to),
        previousFrom: toIsoDay(scope.previous.from),
        previousTo: toIsoDay(scope.previous.to),
      },
      kpi: {
        netRevenue: current.netRevenue,
        netProfit,
        netMarginPct,
        activeOrders: current.activeCount,
        cancelPct: current.cancelPct,
        avgOrderValue: current.avgOrderValue,
      },
      trends: {
        netRevenue: trend(current.netRevenue, prior.netRevenue),
        activeOrders: trend(current.activeCount, prior.activeCount),
        cancelPct: trend(current.cancelPct, prior.cancelPct),
        avgOrderValue: trend(current.avgOrderValue, prior.avgOrderValue),
      },
      costs,
      daily,
      byStore,
      topProducts,
      statusesAvailable: STATUS_SUPPORT,
    });
  } catch (error) {
    handleError(res, 'Overview', error);
  }
};