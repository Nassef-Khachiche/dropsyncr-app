import prisma from '../../config/database.js';
import { loadAdSpend } from '../adSpendController.js';
import { loadShippingRateMap } from '../shippingRateController.js';
import { normalizeCountryCode } from '../../utils/vatRates.js';
import {
  COMMISSION_RATE,
  ORDER_SELECT,
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
 * Signals: automatische signalering van dingen die aandacht vragen.
 *
 * Twee soorten. Operationele signalen kijken naar wat er nú openstaat en
 * negeren de gekozen periode — een order die vandaag te laat is, is te laat,
 * ongeacht welke maand je bovenin hebt staan. Analytische signalen (marge,
 * annuleringen, retouren) rekenen wél over de gekozen periode.
 */

// Drempels op één plek, zodat ze makkelijk bij te stellen zijn.
export const SIGNAL_THRESHOLDS = {
  deadlineWarningDays: 2,
  staleNotOrderedDays: 3,
  cancelRateCritical: 0.30,
  cancelRateWarning: 0.20,
  minOrdersForRate: 10,
  thinMarginPct: 0.05,
  minRevenueForMargin: 250,
  returnRateWarning: 0.10,
  minUnitsForReturnRate: 5,
  roasWarning: 2,
  minSpendForRoas: 100,
  adRatioWarning: 0.10,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from, to) => Math.floor((to - from) / DAY_MS);

export const getSignals = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const now = new Date();
    const signals = [];

    const push = (signal) => signals.push(signal);

    const storeFilter = scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {};
    const countryFilter = scope.countries.length > 0 ? { country: { in: scope.countries } } : {};

    /* ---------------------------------------------------------------
     * Operationeel: alles wat nu nog openstaat.
     * ------------------------------------------------------------- */

    const openOrders = await prisma.order.findMany({
      where: {
        installationId: scope.installationId,
        orderStatusCode: { in: ['OPEN', 'GEPICKT'] },
        ...storeFilter,
        ...countryFilter,
      },
      select: {
        ...ORDER_SELECT,
        orderNumber: true,
        customerName: true,
        orderItems: {
          select: {
            id: true,
            purchaseOrder: { select: { status: true, processedAt: true } },
          },
        },
      },
    });

    const overdue = [];
    const deadlineSoonUnordered = [];
    const staleNotOrdered = [];

    for (const order of openOrders) {
      const isDropship = order.fulfillmentType === 'dropship';

      if (order.deliveryDate && order.deliveryDate < now) {
        overdue.push(order);
      }

      if (!isDropship) continue;

      const lines = order.orderItems || [];
      const orderedLines = lines.filter((item) => item.purchaseOrder?.status === 'ordered');
      const notOrderedLines = lines.filter((item) => item.purchaseOrder?.status === 'not_ordered');

      // Nog niet besteld terwijl de deadline eraan komt.
      if (orderedLines.length === 0 && order.deliveryDate) {
        const daysLeft = daysBetween(now, order.deliveryDate);
        if (daysLeft <= SIGNAL_THRESHOLDS.deadlineWarningDays && daysLeft >= 0) {
          deadlineSoonUnordered.push({ order, daysLeft });
        }
      }

      // Op niet-besteld gezet en daarna blijven liggen.
      for (const item of notOrderedLines) {
        const processedAt = item.purchaseOrder?.processedAt;
        if (!processedAt) continue;
        if (daysBetween(processedAt, now) >= SIGNAL_THRESHOLDS.staleNotOrderedDays) {
          staleNotOrdered.push(order);
          break;
        }
      }
    }

    if (deadlineSoonUnordered.length > 0) {
      const soonest = Math.min(...deadlineSoonUnordered.map((entry) => entry.daysLeft));
      push({
        id: 'ds-unordered-deadline',
        severity: 'critical',
        category: 'purchasing',
        titleKey: 'signalUnorderedDeadlineTitle',
        detailKey: 'signalUnorderedDeadlineDetail',
        params: { count: deadlineSoonUnordered.length, days: soonest },
        value: String(deadlineSoonUnordered.length),
        actionView: 'purchasing',
      });
    }

    if (overdue.length > 0) {
      push({
        id: 'overdue-orders',
        severity: 'critical',
        category: 'fulfilment',
        titleKey: 'signalOverdueTitle',
        detailKey: 'signalOverdueDetail',
        params: { count: overdue.length },
        value: String(overdue.length),
        actionView: 'orders',
      });
    }

    if (staleNotOrdered.length > 0) {
      push({
        id: 'stale-not-ordered',
        severity: 'warning',
        category: 'purchasing',
        titleKey: 'signalStaleNotOrderedTitle',
        detailKey: 'signalStaleNotOrderedDetail',
        params: { count: staleNotOrdered.length, days: SIGNAL_THRESHOLDS.staleNotOrderedDays },
        value: String(staleNotOrdered.length),
        actionView: 'purchasing',
      });
    }

    /* ---------------------------------------------------------------
     * Analytisch: over de gekozen periode.
     * ------------------------------------------------------------- */

    const orders = await prisma.order.findMany({
      where: {
        installationId: scope.installationId,
        orderDate: { gte: scope.from, lte: scope.to },
        ...storeFilter,
        ...countryFilter,
      },
      select: ORDER_SELECT,
    });

    // Annuleringsratio per store.
    const storeStats = new Map();
    for (const order of orders) {
      const store = order.storeName || '-';
      if (!storeStats.has(store)) storeStats.set(store, { total: 0, cancelled: 0, revenue: 0 });
      const bucket = storeStats.get(store);
      bucket.total += 1;
      if (isCancelled(order)) bucket.cancelled += 1;
      else bucket.revenue += toNetRevenue(order);
    }

    for (const [store, stats] of storeStats.entries()) {
      if (stats.total < SIGNAL_THRESHOLDS.minOrdersForRate) continue;
      const rate = stats.cancelled / stats.total;
      if (rate < SIGNAL_THRESHOLDS.cancelRateWarning) continue;

      push({
        id: `cancel-rate-${store}`,
        severity: rate >= SIGNAL_THRESHOLDS.cancelRateCritical ? 'critical' : 'warning',
        category: 'quality',
        titleKey: 'signalCancelRateTitle',
        detailKey: 'signalCancelRateDetail',
        params: { store, cancelled: stats.cancelled, total: stats.total },
        value: `${(rate * 100).toFixed(1)}%`,
        actionView: 'store-trends',
      });
    }

    // Marge per product over de actieve orders.
    const activeOrders = orders.filter((order) => !isCancelled(order));
    const activeOrderIds = activeOrders.map((order) => order.id);
    const orderById = new Map(activeOrders.map((order) => [order.id, order]));

    let missingCostUnits = 0;
    let missingCostRevenue = 0;

    if (activeOrderIds.length > 0) {
      const items = await prisma.orderItem.findMany({
        where: { orderId: { in: activeOrderIds } },
        select: {
          orderId: true,
          ean: true,
          sku: true,
          productName: true,
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

      const productStats = new Map();

      for (const item of items) {
        const order = orderById.get(item.orderId);
        if (!order) continue;

        const key = String(item.ean || item.sku || item.productName || '').trim() || 'onbekend';
        if (!productStats.has(key)) {
          productStats.set(key, {
            key,
            name: item.productName,
            sku: item.sku,
            revenue: 0,
            cost: 0,
            units: 0,
            knownCost: true,
          });
        }

        const bucket = productStats.get(key);
        const quantity = resolveQuantity(item);
        const grossLine = resolveUnitPrice(item) * quantity;

        bucket.revenue += stripVat(grossLine, order.country);
        bucket.units += quantity;

        const purchaseOrder = item.purchaseOrder?.status === 'ordered' ? item.purchaseOrder : null;

        if (purchaseOrder) {
          bucket.cost += (Number(purchaseOrder.buyPriceNet) || 0)
            + (Number(purchaseOrder.shippingCost) || 0)
            + (Number(purchaseOrder.commissionAmount) || 0);
          continue;
        }

        const purchasePrice = Number(item.product?.purchasePrice) || 0;

        // Zonder inkoopprijs én zonder inkooporder weten we de kostprijs niet.
        if (purchasePrice <= 0) {
          bucket.knownCost = false;
          missingCostUnits += quantity;
          missingCostRevenue += stripVat(grossLine, order.country);
        } else {
          bucket.cost += purchasePrice * quantity;
        }

        bucket.cost += grossLine * COMMISSION_RATE;

        if (order.fulfillmentType !== 'dropship') {
          const rate = shippingRateMap.get(normalizeCountryCode(order.country));
          if (Number.isFinite(rate)) bucket.cost += rate;
        }
      }

      for (const product of productStats.values()) {
        if (!product.knownCost) continue;
        if (product.revenue < SIGNAL_THRESHOLDS.minRevenueForMargin) continue;

        const margin = product.revenue - product.cost;
        const marginPct = product.revenue > 0 ? margin / product.revenue : 0;

        if (marginPct < 0) {
          push({
            id: `negative-margin-${product.key}`,
            severity: 'critical',
            category: 'margin',
            titleKey: 'signalNegativeMarginTitle',
            detailKey: 'signalNegativeMarginDetail',
            params: {
              product: product.name,
              revenue: round2(product.revenue),
              loss: round2(Math.abs(margin)),
            },
            value: `${(marginPct * 100).toFixed(1)}%`,
            actionView: 'product-analytics',
          });
        } else if (marginPct < SIGNAL_THRESHOLDS.thinMarginPct) {
          push({
            id: `thin-margin-${product.key}`,
            severity: 'warning',
            category: 'margin',
            titleKey: 'signalThinMarginTitle',
            detailKey: 'signalThinMarginDetail',
            params: { product: product.name, revenue: round2(product.revenue) },
            value: `${(marginPct * 100).toFixed(1)}%`,
            actionView: 'product-analytics',
          });
        }
      }

      if (missingCostUnits > 0) {
        push({
          id: 'missing-purchase-price',
          severity: 'warning',
          category: 'margin',
          titleKey: 'signalMissingCostTitle',
          detailKey: 'signalMissingCostDetail',
          params: { units: missingCostUnits, revenue: round2(missingCostRevenue) },
          value: String(missingCostUnits),
          actionView: 'product-management',
        });
      }

      // Retourpercentage per product.
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

      const returnUnits = new Map();
      for (const returnItem of returns) {
        const key = String(returnItem.ean || '').trim();
        if (!key) continue;
        returnUnits.set(key, (returnUnits.get(key) || 0) + Math.max(1, parseInt(returnItem.quantity, 10) || 1));
      }

      for (const [key, units] of returnUnits.entries()) {
        const product = productStats.get(key);
        if (!product || product.units < SIGNAL_THRESHOLDS.minUnitsForReturnRate) continue;

        const rate = units / (product.units + units);
        if (rate < SIGNAL_THRESHOLDS.returnRateWarning) continue;

        push({
          id: `return-rate-${key}`,
          severity: 'warning',
          category: 'quality',
          titleKey: 'signalReturnRateTitle',
          detailKey: 'signalReturnRateDetail',
          params: { product: product.name, returned: units, sold: product.units },
          value: `${(rate * 100).toFixed(1)}%`,
          actionView: 'product-analytics',
        });
      }
    }

    // Landen zonder ingesteld verzendtarief.
    const shippingRateMap = await loadShippingRateMap(scope.installationId);
    const missingRateCountries = new Set();

    for (const order of activeOrders) {
      if (order.fulfillmentType === 'dropship') continue;
      const code = normalizeCountryCode(order.country);
      if (!code) continue;
      if (!shippingRateMap.has(code)) missingRateCountries.add(code);
    }

    if (missingRateCountries.size > 0) {
      push({
        id: 'missing-shipping-rates',
        severity: 'info',
        category: 'setup',
        titleKey: 'signalMissingShippingRateTitle',
        detailKey: 'signalMissingShippingRateDetail',
        params: { countries: Array.from(missingRateCountries).sort().join(', ') },
        value: String(missingRateCountries.size),
        actionView: 'settings',
      });
    }

    // Advertentierendement.
    const adSpend = await loadAdSpend(scope.installationId, scope.from, scope.to, scope.stores);
    const totalRevenue = activeOrders.reduce((sum, order) => sum + toNetRevenue(order), 0);

    for (const [store, spend] of adSpend.byStore.entries()) {
      if (spend < SIGNAL_THRESHOLDS.minSpendForRoas) continue;
      const storeRevenue = storeStats.get(store)?.revenue || 0;
      const roas = spend > 0 ? storeRevenue / spend : 0;
      if (roas >= SIGNAL_THRESHOLDS.roasWarning) continue;

      push({
        id: `low-roas-${store}`,
        severity: 'warning',
        category: 'marketing',
        titleKey: 'signalLowRoasTitle',
        detailKey: 'signalLowRoasDetail',
        params: { store, spend: round2(spend), revenue: round2(storeRevenue) },
        value: `${roas.toFixed(2)}x`,
        actionView: 'ad-spend',
      });
    }

    if (adSpend.total > 0 && totalRevenue > 0) {
      const ratio = adSpend.total / totalRevenue;
      if (ratio > SIGNAL_THRESHOLDS.adRatioWarning) {
        push({
          id: 'high-ad-ratio',
          severity: 'info',
          category: 'marketing',
          titleKey: 'signalHighAdRatioTitle',
          detailKey: 'signalHighAdRatioDetail',
          params: { spend: round2(adSpend.total), revenue: round2(totalRevenue) },
          value: `${(ratio * 100).toFixed(1)}%`,
          actionView: 'ad-spend',
        });
      }
    }

    const rank = { critical: 0, warning: 1, info: 2 };
    signals.sort((a, b) => rank[a.severity] - rank[b.severity]);

    res.json({
      signals,
      counts: {
        critical: signals.filter((signal) => signal.severity === 'critical').length,
        warning: signals.filter((signal) => signal.severity === 'warning').length,
        info: signals.filter((signal) => signal.severity === 'info').length,
        total: signals.length,
      },
      thresholds: SIGNAL_THRESHOLDS,
    });
  } catch (error) {
    handleError(res, 'Signals', error);
  }
};

/**
 * Cancel Analysis: waar orders worden geannuleerd, per store en per product.
 *
 * De redenenweergave uit de Figma zit er bewust niet in: er wordt nergens een
 * annuleringsreden op de order vastgelegd.
 */
export const getCancelAnalysis = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const orders = await prisma.order.findMany({
      where: {
        installationId: scope.installationId,
        orderDate: { gte: scope.from, lte: scope.to },
        ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
        ...(scope.countries.length > 0 ? { country: { in: scope.countries } } : {}),
      },
      select: ORDER_SELECT,
    });

    if (orders.length === 0) {
      return res.json({
        kpis: { totalOrders: 0, cancelCount: 0, cancelPct: 0, lostRevenue: 0, avgCancelValue: 0 },
        byStore: [],
        byProduct: [],
      });
    }

    const cancelledOrders = orders.filter((order) => isCancelled(order));

    // Gemiste omzet: wat de geannuleerde orders hadden opgeleverd.
    const lostRevenue = round2(
      cancelledOrders.reduce((sum, order) => sum + toNetRevenue(order), 0),
    );

    const storeMap = new Map();
    for (const order of orders) {
      const store = order.storeName || '-';
      if (!storeMap.has(store)) {
        storeMap.set(store, { store, total: 0, cancelled: 0, lostRevenue: 0 });
      }
      const bucket = storeMap.get(store);
      bucket.total += 1;
      if (isCancelled(order)) {
        bucket.cancelled += 1;
        bucket.lostRevenue += toNetRevenue(order);
      }
    }

    const byStore = Array.from(storeMap.values())
      .map((entry) => ({
        ...entry,
        lostRevenue: round2(entry.lostRevenue),
        cancelPct: entry.total > 0 ? entry.cancelled / entry.total : 0,
      }))
      .sort((a, b) => b.cancelPct - a.cancelPct);

    const orderById = new Map(orders.map((order) => [order.id, order]));

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
      },
    });

    const productMap = new Map();

    for (const item of items) {
      const order = orderById.get(item.orderId);
      if (!order) continue;

      const key = String(item.ean || item.sku || item.productName || '').trim() || 'onbekend';
      if (!productMap.has(key)) {
        productMap.set(key, {
          key,
          ean: item.ean,
          sku: item.sku,
          productName: item.productName,
          total: 0,
          cancelled: 0,
          lostRevenue: 0,
        });
      }

      const bucket = productMap.get(key);
      bucket.total += 1;

      if (!isCancelled(order)) continue;

      bucket.cancelled += 1;
      bucket.lostRevenue += stripVat(resolveUnitPrice(item) * resolveQuantity(item), order.country);
    }

    const byProduct = Array.from(productMap.values())
      .filter((entry) => entry.cancelled > 0)
      .map((entry) => ({
        ...entry,
        lostRevenue: round2(entry.lostRevenue),
        cancelPct: entry.total > 0 ? entry.cancelled / entry.total : 0,
      }))
      .sort((a, b) => b.cancelPct - a.cancelPct || b.cancelled - a.cancelled)
      .slice(0, 20);

    const cancelCount = cancelledOrders.length;

    res.json({
      kpis: {
        totalOrders: orders.length,
        cancelCount,
        cancelPct: orders.length > 0 ? cancelCount / orders.length : 0,
        lostRevenue,
        avgCancelValue: cancelCount > 0 ? round2(lostRevenue / cancelCount) : 0,
      },
      byStore,
      byProduct,
    });
  } catch (error) {
    handleError(res, 'Cancel analysis', error);
  }
};

/**
 * Returns Analytics, per store.
 *
 * Retourwaarde komt uit de regels van de retour (`ReturnItem.price` maal
 * aantal). Een terugbetaald bedrag en retourverzendkosten worden nergens
 * vastgelegd, dus die kunnen we niet tonen.
 *
 * Het retourpercentage zet de retouren van een periode af tegen de orders uit
 * diezelfde periode. Een retour hoort meestal bij een oudere order, dus dit is
 * een verhoudingscijfer en geen exacte koppeling.
 */
export const getReturnsAnalytics = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const [returns, orders] = await Promise.all([
      prisma.return.findMany({
        where: {
          installationId: scope.installationId,
          registrationDate: { gte: scope.from, lte: scope.to },
          ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
        },
        select: {
          id: true,
          storeName: true,
          status: true,
          processedAt: true,
          registrationDate: true,
          items: { select: { quantity: true, price: true } },
        },
      }),
      prisma.order.findMany({
        where: {
          installationId: scope.installationId,
          orderDate: { gte: scope.from, lte: scope.to },
          ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
          ...(scope.countries.length > 0 ? { country: { in: scope.countries } } : {}),
        },
        select: { storeName: true, orderStatusCode: true, status: true },
      }),
    ]);

    // Actieve orders per store, als noemer voor het retourpercentage.
    const ordersByStore = new Map();
    let totalActiveOrders = 0;

    for (const order of orders) {
      if (isCancelled(order)) continue;
      const store = order.storeName || '-';
      ordersByStore.set(store, (ordersByStore.get(store) || 0) + 1);
      totalActiveOrders += 1;
    }

    const valueOf = (returnRecord) =>
      (returnRecord.items || []).reduce(
        (sum, item) => sum + (Number(item.price) || 0) * Math.max(1, parseInt(item.quantity, 10) || 1),
        0,
      );

    const storeMap = new Map();
    let totalValue = 0;
    let totalUnits = 0;
    let processedCount = 0;

    for (const returnRecord of returns) {
      const store = returnRecord.storeName || '-';
      if (!storeMap.has(store)) {
        storeMap.set(store, { store, returns: 0, units: 0, value: 0, processed: 0 });
      }

      const bucket = storeMap.get(store);
      const value = valueOf(returnRecord);
      const units = (returnRecord.items || []).reduce(
        (sum, item) => sum + Math.max(1, parseInt(item.quantity, 10) || 1), 0,
      );

      bucket.returns += 1;
      bucket.units += units;
      bucket.value += value;
      if (returnRecord.processedAt) {
        bucket.processed += 1;
        processedCount += 1;
      }

      totalValue += value;
      totalUnits += units;
    }

    const byStore = Array.from(storeMap.values())
      .map((entry) => {
        const orderCount = ordersByStore.get(entry.store) || 0;
        return {
          store: entry.store,
          returns: entry.returns,
          units: entry.units,
          value: round2(entry.value),
          processed: entry.processed,
          orderCount,
          returnRate: orderCount > 0 ? entry.returns / orderCount : null,
          avgValue: entry.returns > 0 ? round2(entry.value / entry.returns) : 0,
        };
      })
      .sort((a, b) => b.returns - a.returns);

    // Verloop over tijd, gegroepeerd per maand.
    const monthMap = new Map();
    for (const returnRecord of returns) {
      const month = returnRecord.registrationDate.toISOString().slice(0, 7);
      if (!monthMap.has(month)) monthMap.set(month, { month, returns: 0, value: 0 });
      const bucket = monthMap.get(month);
      bucket.returns += 1;
      bucket.value += valueOf(returnRecord);
    }

    const timeline = Array.from(monthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((entry) => ({ ...entry, value: round2(entry.value) }));

    res.json({
      kpis: {
        totalReturns: returns.length,
        totalUnits,
        totalValue: round2(totalValue),
        avgValue: returns.length > 0 ? round2(totalValue / returns.length) : 0,
        returnRate: totalActiveOrders > 0 ? returns.length / totalActiveOrders : 0,
        processedCount,
        openCount: returns.length - processedCount,
      },
      byStore,
      timeline,
    });
  } catch (error) {
    handleError(res, 'Returns analytics', error);
  }
};