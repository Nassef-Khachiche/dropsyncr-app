import prisma from '../../config/database.js';
import {
  getShippingRateForCountry,
  loadShippingRateMap,
} from '../shippingRateController.js';
import { loadTargetMap } from '../revenueTargetController.js';
import { loadAdSpend } from '../adSpendController.js';
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
  toNetRevenue,
} from './shared.js';

/**
 * Sales-analytics. Nu alleen Product Analytics; de overige sales-tabs komen
 * hier later bij.
 */

/**
 * Prestaties per product over de gekozen periode.
 *
 * Producten worden gegroepeerd op EAN. Ontbreekt die, dan valt hij terug op
 * SKU en anders op de productnaam — bij marketplaces is niet elk veld gevuld.
 *
 * Kosten per regel, in dezelfde opzet als het overzicht:
 *  - dropship: de werkelijke bedragen uit de verwerkte inkooporder
 *  - voorraad: inkoopprijs van het product, commissie als percentage van de
 *    verkoopprijs en een deel van de verzendkosten van die order
 */
export const getProductAnalytics = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const orders = await prisma.order.findMany({
      where: buildOrderWhere({ ...scope }),
      select: ORDER_SELECT,
    });

    if (orders.length === 0) {
      return res.json({ products: [], totals: { products: 0, units: 0, revenue: 0 } });
    }

    const orderById = new Map(orders.map((order) => [order.id, order]));
    const activeOrderIds = orders.filter((order) => !isCancelled(order)).map((order) => order.id);
    const cancelledOrderIds = orders.filter((order) => isCancelled(order)).map((order) => order.id);

    const items = await prisma.orderItem.findMany({
      where: { orderId: { in: orders.map((order) => order.id) } },
      select: {
        orderId: true,
        ean: true,
        sku: true,
        productName: true,
        quantity: true,
        unitPrice: true,
        price: true,
        product: { select: { purchasePrice: true, brand: true, sku: true, ean: true } },
        purchaseOrder: {
          select: { buyPriceNet: true, shippingCost: true, commissionAmount: true, status: true },
        },
      },
    });

    const shippingRateMap = await loadShippingRateMap(scope.installationId);

    // Regelwaarde per order, zodat we de verzendkosten van een voorraadorder
    // naar rato over de regels kunnen verdelen.
    const orderLineValue = new Map();
    for (const item of items) {
      const value = resolveUnitPrice(item) * resolveQuantity(item);
      orderLineValue.set(item.orderId, (orderLineValue.get(item.orderId) || 0) + value);
    }

    const productMap = new Map();

    const bucketFor = (item) => {
      const ean = String(item.ean || item.product?.ean || '').trim();
      const sku = String(item.sku || item.product?.sku || '').trim();
      const key = ean || sku || String(item.productName || '').trim() || 'onbekend';

      if (!productMap.has(key)) {
        productMap.set(key, {
          key,
          ean: ean || null,
          sku: sku || null,
          productName: item.productName,
          brand: item.product?.brand || null,
          units: 0,
          revenue: 0,
          purchaseCost: 0,
          shippingCost: 0,
          commission: 0,
          orderCount: 0,
          cancelCount: 0,
          returnUnits: 0,
        });
      }
      return productMap.get(key);
    };

    for (const item of items) {
      const order = orderById.get(item.orderId);
      const bucket = bucketFor(item);
      bucket.orderCount += 1;

      if (isCancelled(order)) {
        bucket.cancelCount += 1;
        continue;
      }

      const quantity = resolveQuantity(item);
      const grossLineValue = resolveUnitPrice(item) * quantity;

      bucket.units += quantity;
      bucket.revenue += stripVat(grossLineValue, order?.country);

      const purchaseOrder = item.purchaseOrder?.status === 'ordered' ? item.purchaseOrder : null;

      if (purchaseOrder) {
        bucket.purchaseCost += Number(purchaseOrder.buyPriceNet) || 0;
        bucket.shippingCost += Number(purchaseOrder.shippingCost) || 0;
        bucket.commission += Number(purchaseOrder.commissionAmount) || 0;
        continue;
      }

      // Geen inkooporder: voorraadregel, of een dropshipregel die nog niet
      // verwerkt is. Voor die laatste kennen we de inkoopprijs niet.
      if (order?.fulfillmentType !== 'dropship') {
        bucket.purchaseCost += (Number(item.product?.purchasePrice) || 0) * quantity;

        const orderTotal = orderLineValue.get(item.orderId) || 0;
        const share = orderTotal > 0 ? grossLineValue / orderTotal : 0;
        bucket.shippingCost += getShippingRateForCountry(shippingRateMap, order?.country) * share;
      }

      bucket.commission += grossLineValue * COMMISSION_RATE;
    }

    // Retouren op EAN binnen dezelfde periode. Retouren hangen niet aan de
    // order, dus we matchen op productcode.
    const returns = await prisma.returnItem.findMany({
      where: {
        ean: { not: null },
        return: {
          installationId: scope.installationId,
          registrationDate: { gte: scope.from, lte: scope.to },
        },
      },
      select: { ean: true, quantity: true },
    });

    for (const returnItem of returns) {
      const key = String(returnItem.ean || '').trim();
      if (!key) continue;
      const bucket = productMap.get(key);
      if (!bucket) continue;
      bucket.returnUnits += Math.max(1, parseInt(returnItem.quantity, 10) || 1);
    }

    const products = Array.from(productMap.values())
      .map((entry) => {
        const revenue = round2(entry.revenue);
        const margin = round2(revenue - entry.purchaseCost - entry.shippingCost - entry.commission);
        const soldAndReturned = entry.units + entry.returnUnits;

        return {
          key: entry.key,
          ean: entry.ean,
          sku: entry.sku,
          productName: entry.productName,
          brand: entry.brand,
          units: entry.units,
          revenue,
          purchaseCost: round2(entry.purchaseCost),
          shippingCost: round2(entry.shippingCost),
          commission: round2(entry.commission),
          margin,
          marginPct: revenue > 0 ? margin / revenue : 0,
          avgPrice: entry.units > 0 ? round2(revenue / entry.units) : 0,
          cancelPct: entry.orderCount > 0 ? entry.cancelCount / entry.orderCount : 0,
          returnUnits: entry.returnUnits,
          returnPct: soldAndReturned > 0 ? entry.returnUnits / soldAndReturned : 0,
        };
      })
      .filter((entry) => entry.units > 0 || entry.cancelPct > 0)
      .sort((a, b) => b.revenue - a.revenue);

    res.json({
      products,
      totals: {
        products: products.length,
        units: products.reduce((sum, entry) => sum + entry.units, 0),
        revenue: round2(products.reduce((sum, entry) => sum + entry.revenue, 0)),
      },
      statusesAvailable: STATUS_SUPPORT,
      // Ter info voor de frontend: hoeveel orders er in de periode zaten.
      orderCounts: { total: orders.length, active: activeOrderIds.length, cancelled: cancelledOrderIds.length },
    });
  } catch (error) {
    handleError(res, 'Product analytics', error);
  }
};

/**
 * Omzettrend per store over tijd.
 *
 * De periode wordt gegroepeerd per ISO-week of per kalendermaand. Alleen
 * actieve orders tellen mee in de grafiek; de tabel toont daarnaast ook de
 * annuleringen zodat je ziet waar het misgaat.
 */
export const getStoreTrends = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const granularity = req.query.granularity === 'month' ? 'month' : 'week';

    const orders = await prisma.order.findMany({
      where: buildOrderWhere({ ...scope }),
      select: ORDER_SELECT,
      orderBy: { orderDate: 'asc' },
    });

    if (orders.length === 0) {
      return res.json({ granularity, stores: [], series: [], summary: [] });
    }

    // Tijdvak-sleutel. De week loopt van maandag tot en met zondag.
    const periodKey = (date) => {
      if (granularity === 'month') return date.toISOString().slice(0, 7);

      const monday = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      ));
      const weekday = (monday.getUTCDay() + 6) % 7;
      monday.setUTCDate(monday.getUTCDate() - weekday);

      // ISO-weeknummer: de donderdag van deze week bepaalt het jaar.
      const thursday = new Date(monday);
      thursday.setUTCDate(thursday.getUTCDate() + 3);
      const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
      const firstMonday = new Date(firstThursday);
      firstMonday.setUTCDate(firstMonday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7));

      const week = Math.round((monday - firstMonday) / (7 * 24 * 60 * 60 * 1000)) + 1;
      return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    };

    const periodMap = new Map();
    const summaryMap = new Map();

    for (const order of orders) {
      const store = order.storeName || '-';

      if (!summaryMap.has(store)) {
        summaryMap.set(store, { store, revenue: 0, orders: 0, cancelled: 0 });
      }
      const summary = summaryMap.get(store);

      if (isCancelled(order)) {
        summary.cancelled += 1;
        continue;
      }

      const revenue = toNetRevenue(order);
      summary.revenue += revenue;
      summary.orders += 1;

      const period = periodKey(order.orderDate);
      if (!periodMap.has(period)) periodMap.set(period, new Map());
      const bucket = periodMap.get(period);
      bucket.set(store, (bucket.get(store) || 0) + revenue);
    }

    const summary = Array.from(summaryMap.values())
      .map((entry) => {
        const total = entry.orders + entry.cancelled;
        return {
          store: entry.store,
          revenue: round2(entry.revenue),
          orders: entry.orders,
          cancelled: entry.cancelled,
          cancelPct: total > 0 ? entry.cancelled / total : 0,
          avgOrderValue: entry.orders > 0 ? round2(entry.revenue / entry.orders) : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // Stores op omzet gesorteerd, zodat de frontend de grootste als eerste toont.
    const stores = summary.map((entry) => entry.store);

    const series = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, bucket]) => {
        const values = {};
        for (const store of stores) {
          values[store] = round2(bucket.get(store) || 0);
        }
        return { period, values };
      });

    res.json({ granularity, stores, series, summary, statusesAvailable: STATUS_SUPPORT });
  } catch (error) {
    handleError(res, 'Store trends', error);
  }
};

/**
 * Winstgevendheid per verkoopkanaal.
 *
 * Gegroepeerd op `storeName`: op de order staat niet los welk integratie-
 * platform het is, dus de storenaam is de enige bruikbare kanaalaanduiding.
 * Store Trends kijkt naar het verloop over tijd, deze tab naar de marge.
 *
 * Kosten volgen dezelfde opzet als elders: dropshipregels gebruiken de
 * werkelijke bedragen uit de inkooporder, voorraadregels de inkoopprijs van
 * het product plus een naar rato verdeeld deel van de verzendkosten.
 */
export const getChannelProfitability = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const orders = await prisma.order.findMany({
      where: buildOrderWhere({ ...scope }),
      select: ORDER_SELECT,
    });

    if (orders.length === 0) {
      return res.json({ channels: [] });
    }

    const orderById = new Map(orders.map((order) => [order.id, order]));

    const items = await prisma.orderItem.findMany({
      where: { orderId: { in: orders.map((order) => order.id) } },
      select: {
        orderId: true,
        quantity: true,
        unitPrice: true,
        price: true,
        product: { select: { purchasePrice: true } },
        purchaseOrder: {
          select: { buyPriceNet: true, shippingCost: true, commissionAmount: true, status: true },
        },
      },
    });

    const shippingRateMap = await loadShippingRateMap(scope.installationId);

    // Regelwaarde per order, om de verzendkosten van voorraadorders te verdelen.
    const orderLineValue = new Map();
    for (const item of items) {
      const value = resolveUnitPrice(item) * resolveQuantity(item);
      orderLineValue.set(item.orderId, (orderLineValue.get(item.orderId) || 0) + value);
    }

    const channelMap = new Map();

    const bucketFor = (storeName) => {
      const key = String(storeName || '-').trim() || '-';
      if (!channelMap.has(key)) {
        channelMap.set(key, {
          channel: key,
          revenue: 0,
          cogs: 0,
          commission: 0,
          adSpend: 0,
          orderCount: 0,
          cancelCount: 0,
          countries: new Set(),
        });
      }
      return channelMap.get(key);
    };

    for (const order of orders) {
      const bucket = bucketFor(order.storeName);
      bucket.orderCount += 1;
      if (order.country) bucket.countries.add(order.country);

      if (isCancelled(order)) {
        bucket.cancelCount += 1;
        continue;
      }

      bucket.revenue += toNetRevenue(order);
    }

    for (const item of items) {
      const order = orderById.get(item.orderId);
      if (!order || isCancelled(order)) continue;

      const bucket = bucketFor(order.storeName);
      const quantity = resolveQuantity(item);
      const grossLineValue = resolveUnitPrice(item) * quantity;

      const purchaseOrder = item.purchaseOrder?.status === 'ordered' ? item.purchaseOrder : null;

      if (purchaseOrder) {
        bucket.cogs += (Number(purchaseOrder.buyPriceNet) || 0) + (Number(purchaseOrder.shippingCost) || 0);
        bucket.commission += Number(purchaseOrder.commissionAmount) || 0;
        continue;
      }

      if (order.fulfillmentType !== 'dropship') {
        bucket.cogs += (Number(item.product?.purchasePrice) || 0) * quantity;

        const orderTotal = orderLineValue.get(item.orderId) || 0;
        const share = orderTotal > 0 ? grossLineValue / orderTotal : 0;
        bucket.cogs += getShippingRateForCountry(shippingRateMap, order.country) * share;
      }

      bucket.commission += grossLineValue * COMMISSION_RATE;
    }

    // Advertentiekosten per channel erbij; die maken de ROAS pas berekenbaar.
    const adSpend = await loadAdSpend(scope.installationId, scope.from, scope.to, scope.stores);
    for (const [storeName, amount] of adSpend.byStore.entries()) {
      const bucket = bucketFor(storeName);
      bucket.adSpend += amount;
    }

    const channels = Array.from(channelMap.values())
      .map((entry) => {
        const revenue = round2(entry.revenue);
        const cogs = round2(entry.cogs);
        const commission = round2(entry.commission);
        const adSpend = round2(entry.adSpend);

        const grossProfit = round2(revenue - cogs);
        const netProfit = round2(grossProfit - commission - adSpend);
        const activeOrders = entry.orderCount - entry.cancelCount;

        return {
          channel: entry.channel,
          revenue,
          cogs,
          commission,
          adSpend,
          grossProfit,
          netProfit,
          grossMarginPct: revenue > 0 ? grossProfit / revenue : 0,
          netMarginPct: revenue > 0 ? netProfit / revenue : 0,
          orderCount: entry.orderCount,
          activeOrders,
          cancelPct: entry.orderCount > 0 ? entry.cancelCount / entry.orderCount : 0,
          avgOrderValue: activeOrders > 0 ? round2(revenue / activeOrders) : 0,
          // Advertenties worden nog niet bijgehouden, dus ROAS is niet te berekenen.
          roas: adSpend > 0 ? round2(revenue / adSpend) : null,
          countryCount: entry.countries.size,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    res.json({ channels, statusesAvailable: STATUS_SUPPORT });
  } catch (error) {
    handleError(res, 'Channel profitability', error);
  }
};

/**
 * Targets versus realisatie per maand, plus een eenvoudige prognose.
 *
 * Deze tab werkt op jaarbasis en negeert daarom de gekozen periode uit de
 * filterbalk; store- en landfilters gelden wel gewoon.
 */
export const getTargetsForecast = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getUTCFullYear();

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const orders = await prisma.order.findMany({
      where: buildOrderWhere({ ...scope, from: yearStart, to: yearEnd }),
      select: ORDER_SELECT,
    });

    const targetMap = await loadTargetMap(scope.installationId, year);

    // Werkelijke omzet per maand.
    const actualByMonth = new Map();
    for (const order of orders) {
      if (isCancelled(order)) continue;
      const month = order.orderDate.getUTCMonth() + 1;
      const bucket = actualByMonth.get(month) || { revenue: 0, orders: 0 };
      bucket.revenue += toNetRevenue(order);
      bucket.orders += 1;
      actualByMonth.set(month, bucket);
    }

    const isCurrentYear = year === now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const actual = actualByMonth.get(month) || { revenue: 0, orders: 0 };
      const target = targetMap.get(month) || 0;
      const revenue = round2(actual.revenue);

      return {
        month,
        target: round2(target),
        actual: revenue,
        orders: actual.orders,
        gap: round2(target - revenue),
        achievedPct: target > 0 ? revenue / target : null,
        // Een maand die nog loopt of nog moet komen beoordelen we niet.
        isFuture: isCurrentYear && month > currentMonth,
        isCurrent: isCurrentYear && month === currentMonth,
      };
    });

    const totalTarget = round2(months.reduce((sum, entry) => sum + entry.target, 0));
    const totalActual = round2(months.reduce((sum, entry) => sum + entry.actual, 0));

    /*
     * Prognose voor de lopende maand: de omzet tot nu toe doorgetrokken naar
     * het einde van de maand. Voor de maand daarna nemen we het gemiddelde van
     * de laatste drie afgeronde maanden — geen groeifactor, gewoon de trend.
     */
    let currentForecast = null;
    let nextForecast = null;

    if (isCurrentYear) {
      const daysInMonth = new Date(Date.UTC(year, currentMonth, 0)).getUTCDate();
      const daysPassed = now.getUTCDate();
      const currentActual = actualByMonth.get(currentMonth)?.revenue || 0;

      currentForecast = {
        month: currentMonth,
        actual: round2(currentActual),
        forecast: daysPassed > 0 ? round2((currentActual / daysPassed) * daysInMonth) : 0,
        target: round2(targetMap.get(currentMonth) || 0),
        daysPassed,
        daysInMonth,
      };

      const completed = [];
      for (let offset = 1; offset <= 3; offset += 1) {
        const month = currentMonth - offset;
        if (month < 1) break;
        completed.push(actualByMonth.get(month)?.revenue || 0);
      }

      if (completed.length > 0) {
        const average = completed.reduce((sum, value) => sum + value, 0) / completed.length;
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        nextForecast = {
          month: nextMonth,
          forecast: round2(average),
          basedOnMonths: completed.length,
          target: round2(targetMap.get(nextMonth) || 0),
        };
      }
    }

    res.json({
      year,
      months,
      totals: {
        target: totalTarget,
        actual: totalActual,
        gap: round2(totalTarget - totalActual),
        achievedPct: totalTarget > 0 ? totalActual / totalTarget : null,
      },
      currentForecast,
      nextForecast,
      hasTargets: targetMap.size > 0,
    });
  } catch (error) {
    handleError(res, 'Targets forecast', error);
  }
};