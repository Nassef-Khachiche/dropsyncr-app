import prisma from '../../config/database.js';
import { getVatRate, isEuCountry, normalizeCountryCode } from '../../utils/vatRates.js';
import { loadShippingRateMap, getShippingRateForCountry } from '../shippingRateController.js';
import { loadFixedCostPerMonth } from '../fixedCostController.js';
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
  toVatAmount,
} from './shared.js';

/**
 * Exports. Elke export levert kolomkoppen plus rijen als JSON; de frontend
 * maakt daar het Excel-bestand van. Getallen gaan als echte getallen mee,
 * zodat je er in Excel meteen mee kunt rekenen.
 */

const num = (value) => round2(value);

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');

const orderWhereFor = (scope) => ({
  installationId: scope.installationId,
  orderDate: { gte: scope.from, lte: scope.to },
  ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
  ...(scope.countries.length > 0 ? { country: { in: scope.countries } } : {}),
});

/* ── De losse exports ──────────────────────────────────────────────────── */

const exportOrders = async (scope) => {
  const orders = await prisma.order.findMany({
    where: orderWhereFor(scope),
    select: {
      ...ORDER_SELECT,
      orderNumber: true,
      customerName: true,
      customerEmail: true,
      itemCount: true,
      supplierTracking: true,
      tracking: { select: { trackingCode: true } },
    },
    orderBy: { orderDate: 'asc' },
  });

  const headers = [
    'Ordernummer', 'Orderdatum', 'Leverdatum', 'Store', 'Platform', 'Land',
    'Klant', 'E-mail', 'Type', 'Status', 'Statuscode', 'Aantal items',
    'Orderbedrag incl btw', 'Btw', 'Omzet excl btw', 'Btw-tarief %', 'Trackingcode',
  ];

  const rows = orders.map((order) => [
    order.orderNumber,
    day(order.orderDate),
    day(order.deliveryDate),
    order.storeName,
    order.platform,
    order.country,
    order.customerName,
    order.customerEmail || '',
    order.fulfillmentType === 'dropship' ? 'DS' : 'FFM',
    order.status,
    order.orderStatusCode,
    order.itemCount,
    num(order.orderValue),
    isCancelled(order) ? 0 : num(toVatAmount(order)),
    isCancelled(order) ? 0 : num(toNetRevenue(order)),
    num(getVatRate(order.country) * 100),
    order.tracking?.trackingCode || order.supplierTracking || '',
  ]);

  return { headers, rows, name: 'Orders' };
};

const exportOrderItems = async (scope) => {
  const orders = await prisma.order.findMany({
    where: orderWhereFor(scope),
    select: { ...ORDER_SELECT, orderNumber: true },
  });

  const orderById = new Map(orders.map((order) => [order.id, order]));

  const items = orders.length > 0
    ? await prisma.orderItem.findMany({
        where: { orderId: { in: orders.map((order) => order.id) } },
        select: {
          orderId: true,
          ean: true,
          sku: true,
          productName: true,
          quantity: true,
          price: true,
          unitPrice: true,
          product: { select: { brand: true, purchasePrice: true } },
        },
      })
    : [];

  const headers = [
    'Ordernummer', 'Orderdatum', 'Store', 'Land', 'Status',
    'EAN', 'SKU', 'Product', 'Merk', 'Aantal',
    'Stuksprijs incl btw', 'Regelbedrag incl btw', 'Regelbedrag excl btw', 'Inkoopprijs',
  ];

  const rows = items.map((item) => {
    const order = orderById.get(item.orderId);
    const quantity = resolveQuantity(item);
    const unitPrice = resolveUnitPrice(item);
    const grossLine = unitPrice * quantity;

    return [
      order?.orderNumber || '',
      day(order?.orderDate),
      order?.storeName || '',
      order?.country || '',
      order?.status || '',
      item.ean || '',
      item.sku || '',
      item.productName,
      item.product?.brand || '',
      quantity,
      num(unitPrice),
      num(grossLine),
      num(stripVat(grossLine, order?.country)),
      item.product?.purchasePrice != null ? num(item.product.purchasePrice) : '',
    ];
  });

  return { headers, rows, name: 'Orderregels' };
};

const exportProducts = async (scope) => {
  const orders = await prisma.order.findMany({
    where: orderWhereFor(scope),
    select: ORDER_SELECT,
  });

  const orderById = new Map(orders.map((order) => [order.id, order]));

  const items = orders.length > 0
    ? await prisma.orderItem.findMany({
        where: { orderId: { in: orders.map((order) => order.id) } },
        select: {
          orderId: true,
          ean: true,
          sku: true,
          productName: true,
          quantity: true,
          price: true,
          unitPrice: true,
          product: { select: { brand: true, purchasePrice: true } },
          purchaseOrder: {
            select: { buyPriceNet: true, shippingCost: true, commissionAmount: true, status: true },
          },
        },
      })
    : [];

  const shippingRateMap = await loadShippingRateMap(scope.installationId);
  const map = new Map();

  for (const item of items) {
    const order = orderById.get(item.orderId);
    if (!order) continue;

    const key = String(item.ean || item.sku || item.productName || '').trim() || 'onbekend';
    if (!map.has(key)) {
      map.set(key, {
        ean: item.ean,
        sku: item.sku,
        name: item.productName,
        brand: item.product?.brand || '',
        units: 0, revenue: 0, cost: 0, lines: 0, cancelled: 0,
      });
    }

    const bucket = map.get(key);
    bucket.lines += 1;

    if (isCancelled(order)) {
      bucket.cancelled += 1;
      continue;
    }

    const quantity = resolveQuantity(item);
    const grossLine = resolveUnitPrice(item) * quantity;

    bucket.units += quantity;
    bucket.revenue += stripVat(grossLine, order.country);

    const purchaseOrder = item.purchaseOrder?.status === 'ordered' ? item.purchaseOrder : null;

    if (purchaseOrder) {
      bucket.cost += (Number(purchaseOrder.buyPriceNet) || 0)
        + (Number(purchaseOrder.shippingCost) || 0)
        + (Number(purchaseOrder.commissionAmount) || 0);
    } else {
      bucket.cost += (Number(item.product?.purchasePrice) || 0) * quantity;
      bucket.cost += grossLine * COMMISSION_RATE;
      if (order.fulfillmentType !== 'dropship') {
        bucket.cost += getShippingRateForCountry(shippingRateMap, order.country);
      }
    }
  }

  // Retouren per EAN binnen dezelfde periode.
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
  for (const item of returns) {
    const key = String(item.ean || '').trim();
    if (!key) continue;
    returnUnits.set(key, (returnUnits.get(key) || 0) + Math.max(1, parseInt(item.quantity, 10) || 1));
  }

  const headers = [
    'EAN', 'SKU', 'Product', 'Merk', 'Stuks verkocht', 'Omzet excl btw',
    'Kosten', 'Marge', 'Marge %', 'Gem. prijs', 'Orderregels', 'Geannuleerd',
    'Annuleringsratio %', 'Stuks retour', 'Retourpercentage %',
  ];

  const rows = Array.from(map.entries())
    .map(([key, entry]) => {
      const margin = entry.revenue - entry.cost;
      const returned = returnUnits.get(key) || 0;
      return [
        entry.ean || '',
        entry.sku || '',
        entry.name,
        entry.brand,
        entry.units,
        num(entry.revenue),
        num(entry.cost),
        num(margin),
        entry.revenue > 0 ? num((margin / entry.revenue) * 100) : '',
        entry.units > 0 ? num(entry.revenue / entry.units) : '',
        entry.lines,
        entry.cancelled,
        entry.lines > 0 ? num((entry.cancelled / entry.lines) * 100) : '',
        returned,
        entry.units + returned > 0 ? num((returned / (entry.units + returned)) * 100) : '',
      ];
    })
    .sort((a, b) => Number(b[5]) - Number(a[5]));

  return { headers, rows, name: 'Productprestaties' };
};

const exportPurchaseOrders = async (scope) => {
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      installationId: scope.installationId,
      order: orderWhereFor(scope),
    },
    select: {
      status: true,
      supplierOrderId: true,
      supplierTracking: true,
      buyPrice: true,
      buyPriceNet: true,
      shippingCost: true,
      sellPrice: true,
      vatAmount: true,
      commissionAmount: true,
      netProfit: true,
      notOrderedReason: true,
      note: true,
      processedAt: true,
      supplier: { select: { name: true } },
      order: { select: { orderNumber: true, orderDate: true, storeName: true, country: true } },
      orderItem: { select: { ean: true, sku: true, productName: true, quantity: true } },
    },
    orderBy: { processedAt: 'desc' },
  });

  const headers = [
    'Ordernummer', 'Orderdatum', 'Store', 'Land', 'EAN', 'SKU', 'Product', 'Aantal',
    'Status', 'Leverancier', 'Leverancier order-ID', 'Leverancier tracking',
    'Inkoopprijs', 'Inkoop netto', 'Verzendkosten', 'Verkoopprijs', 'Btw',
    'Commissie', 'Nettowinst', 'Reden niet besteld', 'Notitie', 'Verwerkt op',
  ];

  const rows = purchaseOrders.map((entry) => [
    entry.order?.orderNumber || '',
    day(entry.order?.orderDate),
    entry.order?.storeName || '',
    entry.order?.country || '',
    entry.orderItem?.ean || '',
    entry.orderItem?.sku || '',
    entry.orderItem?.productName || '',
    entry.orderItem?.quantity ?? '',
    entry.status,
    entry.supplier?.name || '',
    entry.supplierOrderId || '',
    entry.supplierTracking || '',
    entry.buyPrice != null ? num(entry.buyPrice) : '',
    entry.buyPriceNet != null ? num(entry.buyPriceNet) : '',
    entry.shippingCost != null ? num(entry.shippingCost) : '',
    entry.sellPrice != null ? num(entry.sellPrice) : '',
    entry.vatAmount != null ? num(entry.vatAmount) : '',
    entry.commissionAmount != null ? num(entry.commissionAmount) : '',
    entry.netProfit != null ? num(entry.netProfit) : '',
    entry.notOrderedReason || '',
    entry.note || '',
    day(entry.processedAt),
  ]);

  return { headers, rows, name: 'Inkooporders' };
};

const exportVat = async (scope) => {
  const orders = await prisma.order.findMany({
    where: orderWhereFor(scope),
    select: ORDER_SELECT,
  });

  const map = new Map();

  for (const order of orders) {
    if (isCancelled(order)) continue;

    const country = normalizeCountryCode(order.country) || '-';
    if (!map.has(country)) {
      map.set(country, {
        country,
        isEu: isEuCountry(order.country),
        rate: getVatRate(order.country),
        gross: 0, net: 0, vat: 0, orders: 0,
      });
    }

    const bucket = map.get(country);
    bucket.gross += Number(order.orderValue) || 0;
    bucket.net += toNetRevenue(order);
    bucket.vat += toVatAmount(order);
    bucket.orders += 1;
  }

  const headers = [
    'Land', 'EU', 'Btw-tarief %', 'Omzet incl btw', 'Omzet excl btw', 'Btw-bedrag', 'Orders',
  ];

  const rows = Array.from(map.values())
    .sort((a, b) => b.vat - a.vat)
    .map((entry) => [
      entry.country,
      entry.isEu ? 'Ja' : 'Nee',
      num(entry.rate * 100),
      num(entry.gross),
      num(entry.net),
      num(entry.vat),
      entry.orders,
    ]);

  return { headers, rows, name: 'Btw per land' };
};

const exportMonthlyPnl = async (scope) => {
  const orders = await prisma.order.findMany({
    where: orderWhereFor(scope),
    select: ORDER_SELECT,
  });

  const orderById = new Map(orders.map((order) => [order.id, order]));

  const items = orders.length > 0
    ? await prisma.orderItem.findMany({
        where: { orderId: { in: orders.map((order) => order.id) } },
        select: {
          orderId: true, quantity: true, unitPrice: true, price: true,
          product: { select: { purchasePrice: true } },
          purchaseOrder: {
            select: { buyPriceNet: true, shippingCost: true, commissionAmount: true, status: true },
          },
        },
      })
    : [];

  const shippingRateMap = await loadShippingRateMap(scope.installationId);
  const fixedPerMonth = await loadFixedCostPerMonth(scope.installationId);

  const adSpendRows = await prisma.adSpend.findMany({
    where: {
      installationId: scope.installationId,
      date: { gte: scope.from, lte: scope.to },
      ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
    },
    select: { date: true, amount: true },
  });

  const monthKey = (date) => date.toISOString().slice(0, 7);
  const map = new Map();

  const bucketFor = (key) => {
    if (!map.has(key)) {
      map.set(key, {
        month: key, revenue: 0, cogs: 0, shipping: 0, commission: 0,
        adSpend: 0, orders: 0, cancelled: 0,
      });
    }
    return map.get(key);
  };

  for (const order of orders) {
    const bucket = bucketFor(monthKey(order.orderDate));
    if (isCancelled(order)) {
      bucket.cancelled += 1;
      continue;
    }
    bucket.revenue += toNetRevenue(order);
    bucket.orders += 1;
  }

  for (const item of items) {
    const order = orderById.get(item.orderId);
    if (!order || isCancelled(order)) continue;

    const bucket = bucketFor(monthKey(order.orderDate));
    const quantity = resolveQuantity(item);
    const grossLine = resolveUnitPrice(item) * quantity;
    const purchaseOrder = item.purchaseOrder?.status === 'ordered' ? item.purchaseOrder : null;

    if (purchaseOrder) {
      bucket.cogs += Number(purchaseOrder.buyPriceNet) || 0;
      bucket.shipping += Number(purchaseOrder.shippingCost) || 0;
      bucket.commission += Number(purchaseOrder.commissionAmount) || 0;
      continue;
    }

    if (order.fulfillmentType !== 'dropship') {
      bucket.cogs += (Number(item.product?.purchasePrice) || 0) * quantity;
      bucket.shipping += getShippingRateForCountry(shippingRateMap, order.country);
    }
    bucket.commission += grossLine * COMMISSION_RATE;
  }

  for (const entry of adSpendRows) {
    bucketFor(monthKey(entry.date)).adSpend += Number(entry.amount) || 0;
  }

  const headers = [
    'Maand', 'Omzet excl btw', 'Inkoop', 'Verzendkosten', 'Commissie',
    'Advertenties', 'Vaste kosten', 'Nettowinst', 'Marge %', 'Orders', 'Geannuleerd',
  ];

  const rows = Array.from(map.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((entry) => {
      const fixed = entry.orders > 0 ? fixedPerMonth : 0;
      const profit = entry.revenue - entry.cogs - entry.shipping
        - entry.commission - entry.adSpend - fixed;

      return [
        entry.month,
        num(entry.revenue),
        num(entry.cogs),
        num(entry.shipping),
        num(entry.commission),
        num(entry.adSpend),
        num(fixed),
        num(profit),
        entry.revenue > 0 ? num((profit / entry.revenue) * 100) : '',
        entry.orders,
        entry.cancelled,
      ];
    });

  return { headers, rows, name: 'Maandelijkse PnL' };
};

const exportReturns = async (scope) => {
  const returns = await prisma.return.findMany({
    where: {
      installationId: scope.installationId,
      registrationDate: { gte: scope.from, lte: scope.to },
      ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
    },
    select: {
      returnNumber: true, rmaId: true, orderNumber: true, customerName: true,
      storeName: true, platform: true, type: true, status: true,
      registrationDate: true, processedAt: true, carrier: true, trackingCode: true,
      returnReason: true, returnReasonNote: true, inspectionStatus: true,
      items: { select: { productName: true, ean: true, quantity: true, price: true } },
    },
    orderBy: { registrationDate: 'desc' },
  });

  const headers = [
    'Retournummer', 'RMA', 'Ordernummer', 'Klant', 'Store', 'Platform', 'Type',
    'Status', 'Geregistreerd op', 'Verwerkt op', 'Vervoerder', 'Trackingcode',
    'Reden', 'Toelichting', 'Inspectiestatus',
    'EAN', 'Product', 'Aantal', 'Stuksprijs', 'Regelwaarde',
  ];

  // Eén regel per retourartikel, zodat je er in Excel op kunt draaien.
  const rows = [];
  for (const record of returns) {
    const base = [
      record.returnNumber, record.rmaId || '', record.orderNumber, record.customerName,
      record.storeName, record.platform, record.type, record.status,
      day(record.registrationDate), day(record.processedAt),
      record.carrier || '', record.trackingCode || '',
      record.returnReason || '', record.returnReasonNote || '', record.inspectionStatus || '',
    ];

    if (record.items.length === 0) {
      rows.push([...base, '', '', '', '', '']);
      continue;
    }

    for (const item of record.items) {
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      rows.push([
        ...base,
        item.ean || '',
        item.productName,
        quantity,
        num(item.price),
        num((Number(item.price) || 0) * quantity),
      ]);
    }
  }

  return { headers, rows, name: 'Retouren' };
};

const exportPayouts = async (scope) => {
  const payouts = await prisma.payout.findMany({
    where: {
      installationId: scope.installationId,
      payoutDate: { gte: scope.from, lte: scope.to },
      ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
    },
    orderBy: { payoutDate: 'desc' },
  });

  const headers = ['Uitbetaaldatum', 'Periode van', 'Periode t/m', 'Channel', 'Bedrag', 'Notitie'];

  const rows = payouts.map((entry) => [
    day(entry.payoutDate),
    day(entry.periodFrom),
    day(entry.periodTo),
    entry.storeName || '',
    num(entry.amount),
    entry.note || '',
  ]);

  return { headers, rows, name: 'Uitbetalingen' };
};

const exportAdSpend = async (scope) => {
  const entries = await prisma.adSpend.findMany({
    where: {
      installationId: scope.installationId,
      date: { gte: scope.from, lte: scope.to },
      ...(scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {}),
    },
    orderBy: [{ date: 'asc' }, { storeName: 'asc' }],
  });

  const headers = ['Datum', 'Channel', 'Bedrag', 'ROAS gerapporteerd'];

  const rows = entries.map((entry) => [
    day(entry.date),
    entry.storeName,
    num(entry.amount),
    entry.reportedRoas != null ? num(entry.reportedRoas) : '',
  ]);

  return { headers, rows, name: 'Advertentiekosten' };
};

const exportFixedCosts = async (scope) => {
  const groups = await prisma.fixedCostGroup.findMany({
    where: { installationId: scope.installationId },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  const headers = ['Categorie', 'Post', 'Bedrag per maand', 'Bedrag per jaar'];

  const rows = [];
  for (const group of groups) {
    for (const item of group.items) {
      rows.push([
        group.name,
        item.name,
        num(item.amountPerMonth),
        num((Number(item.amountPerMonth) || 0) * 12),
      ]);
    }
  }

  return { headers, rows, name: 'Vaste kosten' };
};

const EXPORTS = {
  orders: exportOrders,
  'order-items': exportOrderItems,
  products: exportProducts,
  'purchase-orders': exportPurchaseOrders,
  vat: exportVat,
  'monthly-pnl': exportMonthlyPnl,
  returns: exportReturns,
  payouts: exportPayouts,
  'ad-spend': exportAdSpend,
  'fixed-costs': exportFixedCosts,
};

/**
 * Aantal rijen per export, zodat de kaarten kunnen tonen wat je krijgt zonder
 * dat we alle datasets volledig hoeven op te bouwen.
 */
export const getExportCounts = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const orderWhere = orderWhereFor(scope);
    const storeWhere = scope.stores.length > 0 ? { storeName: { in: scope.stores } } : {};

    const [
      orderCount,
      itemCount,
      purchaseOrderCount,
      returnItemCount,
      payoutCount,
      adSpendCount,
      fixedCostCount,
      productGroups,
      countryGroups,
    ] = await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.orderItem.count({ where: { order: orderWhere } }),
      prisma.purchaseOrder.count({
        where: { installationId: scope.installationId, order: orderWhere },
      }),
      prisma.returnItem.count({
        where: {
          return: {
            installationId: scope.installationId,
            registrationDate: { gte: scope.from, lte: scope.to },
            ...storeWhere,
          },
        },
      }),
      prisma.payout.count({
        where: {
          installationId: scope.installationId,
          payoutDate: { gte: scope.from, lte: scope.to },
          ...storeWhere,
        },
      }),
      prisma.adSpend.count({
        where: {
          installationId: scope.installationId,
          date: { gte: scope.from, lte: scope.to },
          ...storeWhere,
        },
      }),
      prisma.fixedCostItem.count({ where: { installationId: scope.installationId } }),
      prisma.orderItem.groupBy({ by: ['ean'], where: { order: orderWhere } }),
      prisma.order.groupBy({ by: ['country'], where: orderWhere }),
    ]);

    // Aantal maanden dat de gekozen periode raakt.
    const months =
      (scope.to.getUTCFullYear() - scope.from.getUTCFullYear()) * 12
      + (scope.to.getUTCMonth() - scope.from.getUTCMonth()) + 1;

    res.json({
      counts: {
        orders: orderCount,
        'order-items': itemCount,
        products: productGroups.length,
        'purchase-orders': purchaseOrderCount,
        vat: countryGroups.length,
        'monthly-pnl': Math.max(0, months),
        returns: returnItemCount,
        payouts: payoutCount,
        'ad-spend': adSpendCount,
        'fixed-costs': fixedCostCount,
      },
    });
  } catch (error) {
    handleError(res, 'Export counts', error);
  }
};

/**
 * Levert de dataset als kolomkoppen plus rijen. De frontend maakt daar het
 * Excel-bestand van.
 */
export const downloadExport = async (req, res) => {
  try {
    const scope = await resolveRequestScope(req);
    if (scope.error) return res.status(scope.error.status).json({ error: scope.error.message });

    const type = String(req.params.type || '');
    const builder = EXPORTS[type];

    if (!builder) {
      return res.status(400).json({ error: `Onbekend exporttype: ${type}` });
    }

    const { headers, rows, name } = await builder(scope);

    const from = scope.from.toISOString().slice(0, 10);
    const to = scope.to.toISOString().slice(0, 10);

    res.json({
      type,
      sheetName: name,
      filename: `${name.replace(/\s+/g, '')}_${from}_${to}.xlsx`,
      headers,
      rows,
      rowCount: rows.length,
    });
  } catch (error) {
    handleError(res, 'Export', error);
  }
};