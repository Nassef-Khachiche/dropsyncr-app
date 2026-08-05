import prisma from '../../config/database.js';
import {
  getShippingRateForCountry,
  loadShippingRateMap,
} from '../shippingRateController.js';
import { getVatRate, isEuCountry, normalizeCountryCode } from '../../utils/vatRates.js';
import { loadAdSpend } from '../adSpendController.js';
import { allocateFixedCosts, loadFixedCostPerMonth } from '../fixedCostController.js';
import {
  COMMISSION_RATE,
  ORDER_SELECT,
  STATUS_SUPPORT,
  handleError,
  isCancelled,
  resolveQuantity,
  resolveRequestScope,
  resolveUnitPrice,
  round2,
  stripVat,
  toNetRevenue,
  toVatAmount,
} from './shared.js';

/**
 * Finance-analytics. Nu alleen Daily Summary; de overige finance-tabs volgen.
 */

/**
 * Welke maanden en dagen er überhaupt orders hebben.
 *
 * De frontend laat eerst een maand kiezen en daarbinnen een dag — een platte
 * lijst van alle dagen zou onwerkbaar lang worden.
 */
export const getDailySummaryPeriods = async (req, res) => {
  try {
    const { installationId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }

    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    // Alleen de datums, geen bedragen — dit is puur om de keuzelijsten te vullen.
    const rows = await prisma.order.findMany({
      where: { installationId: scope.installationId },
      select: { orderDate: true },
      orderBy: { orderDate: 'desc' },
    });

    const monthMap = new Map();
    for (const row of rows) {
      const day = row.orderDate.toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      if (!monthMap.has(month)) monthMap.set(month, new Set());
      monthMap.get(month).add(day);
    }

    const months = Array.from(monthMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, days]) => ({
        month,
        days: Array.from(days).sort((a, b) => b.localeCompare(a)),
      }));

    res.json({ months });
  } catch (error) {
    handleError(res, 'Daily summary periods', error);
  }
};

/**
 * Financieel dagoverzicht: omzet, btw, kosten en marge van één dag, plus de
 * losse orders van die dag.
 */
export const getDailySummary = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const day = String(req.query.day || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({ error: 'Geef een dag op als YYYY-MM-DD' });
    }

    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);

    const orders = await prisma.order.findMany({
      where: {
        installationId: scope.installationId,
        orderDate: { gte: dayStart, lte: dayEnd },
        ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
        ...(scope.countries.length > 0 ? { country: { in: scope.countries } } : {}),
      },
      select: { ...ORDER_SELECT, orderNumber: true, customerName: true },
      orderBy: { orderDate: 'asc' },
    });

    if (orders.length === 0) {
      return res.json({
        day,
        totals: {
          revenue: 0, vat: 0, cogs: 0, shippingCosts: 0, commission: 0,
          grossProfit: 0, netProfit: 0, netMarginPct: 0,
          orderCount: 0, cancelCount: 0, itemCount: 0,
        },
        orders: [],
        byStore: [],
        statusesAvailable: STATUS_SUPPORT,
      });
    }

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

    // Kosten per order opbouwen, zodat we ze zowel per order als in het totaal
    // kunnen tonen.
    const costsByOrder = new Map();
    const itemsByOrder = new Map();

    for (const item of items) {
      itemsByOrder.set(item.orderId, (itemsByOrder.get(item.orderId) || 0) + resolveQuantity(item));
    }

    for (const order of orders) {
      costsByOrder.set(order.id, {
        cogs: 0, shipping: 0, commission: 0, purchased: false, purchasableLines: 0, purchasedLines: 0,
      });
    }

    const orderById = new Map(orders.map((order) => [order.id, order]));
    const orderLineValue = new Map();
    for (const item of items) {
      const value = resolveUnitPrice(item) * resolveQuantity(item);
      orderLineValue.set(item.orderId, (orderLineValue.get(item.orderId) || 0) + value);
    }

    for (const item of items) {
      const order = orderById.get(item.orderId);
      const bucket = costsByOrder.get(item.orderId);
      if (!order || !bucket || isCancelled(order)) continue;

      const quantity = resolveQuantity(item);
      const grossLineValue = resolveUnitPrice(item) * quantity;
      const purchaseOrder = item.purchaseOrder?.status === 'ordered' ? item.purchaseOrder : null;

      if (order.fulfillmentType === 'dropship') bucket.purchasableLines += 1;

      if (purchaseOrder) {
        bucket.purchasedLines += 1;
        bucket.cogs += Number(purchaseOrder.buyPriceNet) || 0;
        bucket.shipping += Number(purchaseOrder.shippingCost) || 0;
        bucket.commission += Number(purchaseOrder.commissionAmount) || 0;
        continue;
      }

      if (order.fulfillmentType !== 'dropship') {
        bucket.cogs += (Number(item.product?.purchasePrice) || 0) * quantity;
        const orderTotal = orderLineValue.get(item.orderId) || 0;
        const share = orderTotal > 0 ? grossLineValue / orderTotal : 0;
        bucket.shipping += getShippingRateForCountry(shippingRateMap, order.country) * share;
      }

      bucket.commission += grossLineValue * COMMISSION_RATE;
    }

    // Advertentiekosten van deze dag. Niet toe te rekenen aan losse orders,
    // dus die tellen alleen mee in het dagtotaal.
    const adSpendDay = await loadAdSpend(scope.installationId, dayStart, dayEnd, scope.stores);

    const totals = {
      revenue: 0, vat: 0, cogs: 0, shippingCosts: 0, commission: 0,
      orderCount: 0, cancelCount: 0, itemCount: 0,
    };

    const storeMap = new Map();

    const orderRows = orders.map((order) => {
      const bucket = costsByOrder.get(order.id);
      const cancelled = isCancelled(order);
      const revenue = cancelled ? 0 : round2(toNetRevenue(order));
      const vat = cancelled ? 0 : round2(toVatAmount(order));
      const cogs = round2(bucket.cogs);
      const shipping = round2(bucket.shipping);
      const commission = round2(bucket.commission);

      // Brutowinst: omzet minus inkoop. Commissie en verzendkosten komen er in
      // de nettowinst nog vanaf.
      const grossProfit = round2(revenue - cogs);
      const netProfit = round2(grossProfit - shipping - commission);

      if (cancelled) {
        totals.cancelCount += 1;
      } else {
        totals.revenue += revenue;
        totals.vat += vat;
        totals.cogs += cogs;
        totals.shippingCosts += shipping;
        totals.commission += commission;
        totals.itemCount += itemsByOrder.get(order.id) || 0;
      }
      totals.orderCount += 1;

      const store = order.storeName || '-';
      if (!storeMap.has(store)) storeMap.set(store, { store, revenue: 0, orders: 0 });
      if (!cancelled) {
        const storeBucket = storeMap.get(store);
        storeBucket.revenue += revenue;
        storeBucket.orders += 1;
      }

      const isDropship = order.fulfillmentType === 'dropship';

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        storeName: order.storeName,
        country: order.country,
        status: order.status,
        cancelled,
        // DS of FFM, zodat de inkoper in één oogopslag ziet wat het is.
        orderType: isDropship ? 'DS' : 'FFM',
        // Alleen dropshiporders moeten besteld worden; voorraad ligt er al.
        purchaseStatus: !isDropship
          ? 'stock'
          : bucket.purchasedLines === 0
            ? 'not_ordered'
            : bucket.purchasedLines >= bucket.purchasableLines
              ? 'ordered'
              : 'partial',
        items: itemsByOrder.get(order.id) || 0,
        revenue,
        vat,
        cogs,
        shippingCost: shipping,
        commission,
        grossProfit,
        netProfit,
        marginPct: revenue > 0 ? netProfit / revenue : 0,
      };
    });

    const fixedCostsDay = await allocateFixedCosts(scope.installationId, dayStart, dayEnd);

    const grossProfit = round2(totals.revenue - totals.cogs);
    const netProfit = round2(
      grossProfit - totals.shippingCosts - totals.commission - adSpendDay.total - fixedCostsDay,
    );

    const byStore = Array.from(storeMap.values())
      .map((entry) => ({ ...entry, revenue: round2(entry.revenue) }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({
      day,
      totals: {
        revenue: round2(totals.revenue),
        vat: round2(totals.vat),
        cogs: round2(totals.cogs),
        shippingCosts: round2(totals.shippingCosts),
        commission: round2(totals.commission),
        adSpend: adSpendDay.total,
        fixedCosts: fixedCostsDay,
        grossProfit,
        netProfit,
        netMarginPct: totals.revenue > 0 ? netProfit / totals.revenue : 0,
        orderCount: totals.orderCount,
        cancelCount: totals.cancelCount,
        itemCount: totals.itemCount,
        avgOrderValue: totals.orderCount - totals.cancelCount > 0
          ? round2(totals.revenue / (totals.orderCount - totals.cancelCount))
          : 0,
      },
      orders: orderRows,
      byStore,
      statusesAvailable: STATUS_SUPPORT,
    });
  } catch (error) {
    handleError(res, 'Daily summary', error);
  }
};

/**
 * Maandelijkse P&L over een heel jaar.
 *
 * Werkt op jaarbasis en negeert daarom de periode uit de filterbalk; store- en
 * landfilters gelden wel. Advertenties en vaste kosten bestaan nog niet als
 * databron en blijven 0 tot die tabs er zijn.
 */
export const getMonthlySummary = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getUTCFullYear();

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    // Welke jaren er data hebben, voor de jaarkeuze in de frontend.
    const oldest = await prisma.order.findFirst({
      where: { installationId: scope.installationId },
      select: { orderDate: true },
      orderBy: { orderDate: 'asc' },
    });

    const firstYear = oldest ? oldest.orderDate.getUTCFullYear() : now.getUTCFullYear();
    const availableYears = [];
    for (let candidate = now.getUTCFullYear(); candidate >= firstYear; candidate -= 1) {
      availableYears.push(candidate);
    }

    const orders = await prisma.order.findMany({
      where: {
        installationId: scope.installationId,
        orderDate: { gte: yearStart, lte: yearEnd },
        ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
        ...(scope.countries.length > 0 ? { country: { in: scope.countries } } : {}),
      },
      select: ORDER_SELECT,
    });

    const emptyMonth = (month) => ({
      month,
      revenue: 0,
      cogs: 0,
      shippingCosts: 0,
      commission: 0,
      adSpend: 0,
      fixedCosts: 0,
      orderCount: 0,
      cancelCount: 0,
    });

    const monthMap = new Map(
      Array.from({ length: 12 }, (_, index) => [index + 1, emptyMonth(index + 1)]),
    );

    for (const order of orders) {
      const bucket = monthMap.get(order.orderDate.getUTCMonth() + 1);
      bucket.orderCount += 1;
      if (isCancelled(order)) {
        bucket.cancelCount += 1;
        continue;
      }
      bucket.revenue += toNetRevenue(order);
    }

    if (orders.length > 0) {
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

      // Regelwaarde per order, om verzendkosten van voorraadorders te verdelen.
      const orderLineValue = new Map();
      for (const item of items) {
        const value = resolveUnitPrice(item) * resolveQuantity(item);
        orderLineValue.set(item.orderId, (orderLineValue.get(item.orderId) || 0) + value);
      }

      for (const item of items) {
        const order = orderById.get(item.orderId);
        if (!order || isCancelled(order)) continue;

        const bucket = monthMap.get(order.orderDate.getUTCMonth() + 1);
        const quantity = resolveQuantity(item);
        const grossLineValue = resolveUnitPrice(item) * quantity;
        const purchaseOrder = item.purchaseOrder?.status === 'ordered' ? item.purchaseOrder : null;

        if (purchaseOrder) {
          bucket.cogs += Number(purchaseOrder.buyPriceNet) || 0;
          bucket.shippingCosts += Number(purchaseOrder.shippingCost) || 0;
          bucket.commission += Number(purchaseOrder.commissionAmount) || 0;
          continue;
        }

        if (order.fulfillmentType !== 'dropship') {
          bucket.cogs += (Number(item.product?.purchasePrice) || 0) * quantity;
          const orderTotal = orderLineValue.get(item.orderId) || 0;
          const share = orderTotal > 0 ? grossLineValue / orderTotal : 0;
          bucket.shippingCosts += getShippingRateForCountry(shippingRateMap, order.country) * share;
        }

        bucket.commission += grossLineValue * COMMISSION_RATE;
      }
    }

    // Advertentiekosten per maand erbij.
    const adSpend = await loadAdSpend(scope.installationId, yearStart, yearEnd, scope.stores);
    for (const row of adSpend.rows) {
      const bucket = monthMap.get(row.date.getUTCMonth() + 1);
      if (bucket) bucket.adSpend += Number(row.amount) || 0;
    }

   // Vaste kosten drukken elke maand even zwaar.
    const fixedPerMonth = await loadFixedCostPerMonth(scope.installationId);
    for (const bucket of monthMap.values()) {
      if (bucket.orderCount > 0) bucket.fixedCosts = fixedPerMonth;
    }

    const months = Array.from(monthMap.values()).map((entry) => {
      const revenue = round2(entry.revenue);
      const cogs = round2(entry.cogs);
      const shippingCosts = round2(entry.shippingCosts);
      const commission = round2(entry.commission);
      const netProfit = round2(revenue - cogs - shippingCosts - commission - entry.adSpend - entry.fixedCosts);

      return {
        month: entry.month,
        revenue,
        cogs,
        shippingCosts,
        commission,
        adSpend: round2(entry.adSpend),
        fixedCosts: round2(entry.fixedCosts),
        netProfit,
        netMarginPct: revenue > 0 ? netProfit / revenue : 0,
        orderCount: entry.orderCount,
        activeOrders: entry.orderCount - entry.cancelCount,
        cancelCount: entry.cancelCount,
        cancelPct: entry.orderCount > 0 ? entry.cancelCount / entry.orderCount : 0,
      };
    });

    const sum = (field) => round2(months.reduce((total, entry) => total + entry[field], 0));
    const totalRevenue = sum('revenue');
    const totalProfit = sum('netProfit');

    res.json({
      year,
      availableYears,
      months,
      totals: {
        revenue: totalRevenue,
        cogs: sum('cogs'),
        shippingCosts: sum('shippingCosts'),
        commission: sum('commission'),
        adSpend: sum('adSpend'),
        fixedCosts: sum('fixedCosts'),
        netProfit: totalProfit,
        netMarginPct: totalRevenue > 0 ? totalProfit / totalRevenue : 0,
        activeOrders: months.reduce((total, entry) => total + entry.activeOrders, 0),
        cancelCount: months.reduce((total, entry) => total + entry.cancelCount, 0),
      },
      statusesAvailable: STATUS_SUPPORT,
    });
  } catch (error) {
    handleError(res, 'Monthly summary', error);
  }
};

/**
 * Btw-overzicht per kwartaal, uitgesplitst per land.
 *
 * Bedoeld als basis voor de aangifte, dus altijd per kwartaal en niet over een
 * vrije periode. EU en niet-EU staan los van elkaar: buiten de EU geldt geen
 * Europese btw, dus die omzet hoort niet in hetzelfde totaal.
 */
export const getVatOverview = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getUTCFullYear();
    const quarter = Math.min(4, Math.max(1,
      parseInt(req.query.quarter, 10) || Math.floor(now.getUTCMonth() / 3) + 1,
    ));

    const startMonth = (quarter - 1) * 3;
    const from = new Date(Date.UTC(year, startMonth, 1));
    const to = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999));

    // Welke kwartalen er data hebben, voor de keuzelijst.
    const oldest = await prisma.order.findFirst({
      where: { installationId: scope.installationId },
      select: { orderDate: true },
      orderBy: { orderDate: 'asc' },
    });

    const availablePeriods = [];
    if (oldest) {
      const firstYear = oldest.orderDate.getUTCFullYear();
      const firstQuarter = Math.floor(oldest.orderDate.getUTCMonth() / 3) + 1;
      const currentYear = now.getUTCFullYear();
      const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;

      for (let y = currentYear; y >= firstYear; y -= 1) {
        const highest = y === currentYear ? currentQuarter : 4;
        const lowest = y === firstYear ? firstQuarter : 1;
        for (let q = highest; q >= lowest; q -= 1) {
          availablePeriods.push({ year: y, quarter: q });
        }
      }
    } else {
      availablePeriods.push({ year, quarter });
    }

    const orders = await prisma.order.findMany({
      where: {
        installationId: scope.installationId,
        orderDate: { gte: from, lte: to },
        ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
        ...(scope.countries.length > 0 ? { country: { in: scope.countries } } : {}),
      },
      select: ORDER_SELECT,
    });

    const countryMap = new Map();

    for (const order of orders) {
      if (isCancelled(order)) continue;

      const country = normalizeCountryCode(order.country) || '-';
      if (!countryMap.has(country)) {
        countryMap.set(country, {
          country,
          isEu: isEuCountry(order.country),
          vatRate: getVatRate(order.country),
          grossRevenue: 0,
          netRevenue: 0,
          vatAmount: 0,
          orderCount: 0,
        });
      }

      const bucket = countryMap.get(country);
      bucket.grossRevenue += Number(order.orderValue) || 0;
      bucket.netRevenue += toNetRevenue(order);
      bucket.vatAmount += toVatAmount(order);
      bucket.orderCount += 1;
    }

    const allCountries = Array.from(countryMap.values())
      .map((entry) => ({
        country: entry.country,
        isEu: entry.isEu,
        vatRate: entry.vatRate,
        grossRevenue: round2(entry.grossRevenue),
        netRevenue: round2(entry.netRevenue),
        vatAmount: round2(entry.vatAmount),
        orderCount: entry.orderCount,
      }))
      .sort((a, b) => b.vatAmount - a.vatAmount || b.netRevenue - a.netRevenue);

    const summarizeGroup = (list) => ({
      countries: list,
      totals: {
        grossRevenue: round2(list.reduce((sum, entry) => sum + entry.grossRevenue, 0)),
        netRevenue: round2(list.reduce((sum, entry) => sum + entry.netRevenue, 0)),
        vatAmount: round2(list.reduce((sum, entry) => sum + entry.vatAmount, 0)),
        orderCount: list.reduce((sum, entry) => sum + entry.orderCount, 0),
        countryCount: list.length,
      },
    });

    const eu = summarizeGroup(allCountries.filter((entry) => entry.isEu));
    const nonEu = summarizeGroup(allCountries.filter((entry) => !entry.isEu));

    res.json({
      period: {
        year,
        quarter,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
      availablePeriods,
      eu,
      nonEu,
      totals: {
        netRevenue: round2(eu.totals.netRevenue + nonEu.totals.netRevenue),
        vatAmount: round2(eu.totals.vatAmount + nonEu.totals.vatAmount),
        orderCount: eu.totals.orderCount + nonEu.totals.orderCount,
      },
    });
  } catch (error) {
    handleError(res, 'VAT overview', error);
  }
};

/**
 * Advertentiekosten en rendement over de gekozen periode.
 *
 * Toont twee soorten ROAS naast elkaar: de waarde die het platform zelf
 * rapporteert, en de waarde die volgt uit onze eigen omzet. Die twee lopen
 * uiteen omdat platforms met toegeschreven omzet rekenen.
 */
export const getAdSpendAnalytics = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const { rows, total, byStore, byDay } = await loadAdSpend(
      scope.installationId, scope.from, scope.to, scope.stores,
    );

    const orders = await prisma.order.findMany({
      where: {
        installationId: scope.installationId,
        orderDate: { gte: scope.from, lte: scope.to },
        ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
        ...(scope.countries.length > 0 ? { country: { in: scope.countries } } : {}),
      },
      select: ORDER_SELECT,
    });

    // Omzet per store en per dag, om het rendement af te kunnen zetten.
    let totalRevenue = 0;
    const revenueByStore = new Map();
    const revenueByDay = new Map();

    for (const order of orders) {
      if (isCancelled(order)) continue;
      const revenue = toNetRevenue(order);
      totalRevenue += revenue;

      const store = order.storeName || '-';
      revenueByStore.set(store, (revenueByStore.get(store) || 0) + revenue);

      const day = order.orderDate.toISOString().slice(0, 10);
      revenueByDay.set(day, (revenueByDay.get(day) || 0) + revenue);
    }

    totalRevenue = round2(totalRevenue);

    // Gemiddelde gerapporteerde ROAS, gewogen naar spend.
    const withRoas = rows.filter((row) => row.reportedRoas != null && Number(row.amount) > 0);
    const roasWeight = withRoas.reduce((sum, row) => sum + Number(row.amount), 0);
    const reportedRoas = roasWeight > 0
      ? Math.round((withRoas.reduce((sum, row) => sum + Number(row.amount) * Number(row.reportedRoas), 0) / roasWeight) * 100) / 100
      : null;

    const channels = Array.from(byStore.entries())
      .map(([storeName, spend]) => {
        const revenue = round2(revenueByStore.get(storeName) || 0);
        const storeRows = rows.filter((row) => row.storeName === storeName && row.reportedRoas != null && Number(row.amount) > 0);
        const storeWeight = storeRows.reduce((sum, row) => sum + Number(row.amount), 0);

        return {
          storeName,
          spend,
          revenue,
          calculatedRoas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
          reportedRoas: storeWeight > 0
            ? Math.round((storeRows.reduce((sum, row) => sum + Number(row.amount) * Number(row.reportedRoas), 0) / storeWeight) * 100) / 100
            : null,
          adRatio: revenue > 0 ? spend / revenue : null,
          share: total > 0 ? spend / total : 0,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    // Dagreeks over de hele periode, zodat de grafiek geen gaten heeft.
    const daily = [];
    const cursor = new Date(scope.from);
    while (cursor <= scope.to) {
      const day = cursor.toISOString().slice(0, 10);
      const spend = byDay.get(day) || 0;
      const revenue = round2(revenueByDay.get(day) || 0);
      daily.push({
        date: day,
        spend,
        revenue,
        roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    res.json({
      totals: {
        spend: total,
        revenue: totalRevenue,
        calculatedRoas: total > 0 ? Math.round((totalRevenue / total) * 100) / 100 : null,
        reportedRoas,
        adRatio: totalRevenue > 0 ? total / totalRevenue : 0,
        entryCount: rows.length,
      },
      channels,
      daily,
    });
  } catch (error) {
    handleError(res, 'Ad spend analytics', error);
  }
};