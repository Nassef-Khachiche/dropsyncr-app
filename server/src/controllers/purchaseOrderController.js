import prisma from '../config/database.js';

/**
 * Order Management — inkoop van dropship orders.
 *
 * Drie tabs:
 *   open        — dropship orderitems zonder PurchaseOrder-record
 *   not_ordered — PurchaseOrder met status 'not_ordered'
 *   ordered     — PurchaseOrder met status 'ordered'
 */

const VAT_RATE = 0.21;
const COMMISSION_RATE = 0.15;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const assertInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: user.id, installationId: parseInt(installationId) },
  });
  return Boolean(hasAccess);
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// De verkoopprijs van de regel: stuksprijs maal aantal.
const resolveSellPrice = (orderItem) => {
  const quantity = Math.max(1, parseInt(orderItem?.quantity || 1, 10) || 1);
  const unitPrice = Number(orderItem?.unitPrice || 0);
  const price = Number(orderItem?.price || 0);
  const perUnit = unitPrice > 0 ? unitPrice : price;
  return round2(perUnit * quantity);
};

const calculateMargin = ({ sellPrice, buyPrice, excludeVat, shippingCost }) => {
  const sell = round2(sellPrice);
  const buy = Number(buyPrice) || 0;
  const shipping = Number(shippingCost) || 0;

  const vatAmount = round2((sell * VAT_RATE) / (1 + VAT_RATE));
  const commissionAmount = round2(sell * COMMISSION_RATE);
  const buyPriceNet = round2(excludeVat ? buy / (1 + VAT_RATE) : buy);
  const netProfit = round2(sell - vatAmount - commissionAmount - buyPriceNet - shipping);

  return {
    sellPrice: sell,
    vatAmount,
    commissionAmount,
    buyPriceNet,
    shippingCost: round2(shipping),
    netProfit,
  };
};

// Eén platte vorm voor de frontend, ongeacht welke tab.
const toListItem = (orderItem, purchaseOrder = null) => ({
  orderItemId: orderItem.id,
  orderId: orderItem.order.id,
  orderNumber: orderItem.order.orderNumber,
  customerName: orderItem.order.customerName,
  customerEmail: orderItem.order.customerEmail,
  address: orderItem.order.address,
  country: orderItem.order.country,
  storeName: orderItem.order.storeName,
  platform: orderItem.order.platform,
  orderDate: orderItem.order.orderDate,
  deliveryDate: orderItem.order.deliveryDate,
  ean: orderItem.ean,
  sku: orderItem.sku,
  productName: orderItem.productName,
  productImage: orderItem.productImage,
  supplierUrl: orderItem.product?.supplierUrl || null,
  productPurchasePrice: orderItem.product?.purchasePrice ?? null,
  quantity: orderItem.quantity,
  sellPrice: resolveSellPrice(orderItem),
  purchaseOrder: purchaseOrder
    ? {
        id: purchaseOrder.id,
        status: purchaseOrder.status,
        supplierId: purchaseOrder.supplierId,
        supplierName: purchaseOrder.supplier?.name || null,
        supplierOrderId: purchaseOrder.supplierOrderId,
        supplierTracking: purchaseOrder.supplierTracking,
        buyPrice: purchaseOrder.buyPrice,
        buyPriceNet: purchaseOrder.buyPriceNet,
        shippingCost: purchaseOrder.shippingCost,
        netProfit: purchaseOrder.netProfit,
        notOrderedReason: purchaseOrder.notOrderedReason,
        note: purchaseOrder.note,
        processedAt: purchaseOrder.processedAt,
      }
    : null,
});

const buildSearchFilter = (search) => {
  const term = String(search || '').trim();
  if (!term) return {};
  return {
    OR: [
      { ean: { contains: term } },
      { productName: { contains: term } },
      { order: { orderNumber: { contains: term } } },
      { order: { customerName: { contains: term } } },
    ],
  };
};

export const getPurchaseOrders = async (req, res) => {
  try {
    const { installationId, tab = 'open', search = '', page = 1, limit = DEFAULT_PAGE_SIZE, withoutTracking } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const installationIdNumber = parseInt(installationId, 10);
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit, 10) || DEFAULT_PAGE_SIZE));
    const skip = (pageNumber - 1) * pageSize;

    // Alleen dropship orders die nog openstaan komen in aanmerking.
    const orderFilter = {
      installationId: installationIdNumber,
      fulfillmentType: 'dropship',
      status: 'openstaand',
    };

    const baseWhere = { order: orderFilter, ...buildSearchFilter(search) };

    // Tellingen voor de tab-badges — altijd zonder zoekterm zodat de badges stabiel blijven.
    const countWhere = { order: orderFilter };
    const [openCount, notOrderedCount, orderedCount] = await Promise.all([
      prisma.orderItem.count({ where: { ...countWhere, purchaseOrder: null } }),
      prisma.orderItem.count({ where: { ...countWhere, purchaseOrder: { status: 'not_ordered' } } }),
      prisma.orderItem.count({ where: { ...countWhere, purchaseOrder: { status: 'ordered' } } }),
    ]);

    let itemFilter;
    if (tab === 'not_ordered') {
      itemFilter = { ...baseWhere, purchaseOrder: { status: 'not_ordered' } };
    } else if (tab === 'ordered') {
      const trackingFilter = String(withoutTracking) === 'true'
        ? { OR: [{ supplierTracking: null }, { supplierTracking: '' }] }
        : {};
      itemFilter = { ...baseWhere, purchaseOrder: { status: 'ordered', ...trackingFilter } };
    } else {
      itemFilter = { ...baseWhere, purchaseOrder: null };
    }

    const [total, orderItems] = await Promise.all([
      prisma.orderItem.count({ where: itemFilter }),
      prisma.orderItem.findMany({
        where: itemFilter,
        include: {
          order: true,
          product: { select: { supplierUrl: true, purchasePrice: true } },
          purchaseOrder: { include: { supplier: { select: { id: true, name: true } } } },
        },
        orderBy: [{ order: { deliveryDate: 'asc' } }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
    ]);

    res.json({
      items: orderItems.map((item) => toListItem(item, item.purchaseOrder)),
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      counts: { open: openCount, not_ordered: notOrderedCount, ordered: orderedCount },
    });
  } catch (error) {
    console.error('[PURCHASE ORDER] List error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// Gemeenschappelijke voorbereiding voor process en not-ordered.
const loadOrderItemForProcessing = async (user, orderItemId) => {
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: parseInt(orderItemId, 10) },
    include: { order: true, purchaseOrder: true },
  });

  if (!orderItem) return { error: { status: 404, message: 'Order item not found' } };
  if (!(await assertInstallationAccess(user, orderItem.order.installationId))) {
    return { error: { status: 403, message: 'Access denied to this installation' } };
  }
  if (orderItem.order.fulfillmentType !== 'dropship') {
    return { error: { status: 400, message: 'Deze order is geen dropship order' } };
  }

  return { orderItem };
};

export const processPurchaseOrder = async (req, res) => {
  try {
    const { orderItemId, supplierId, buyPrice, excludeVat, shippingCost, supplierOrderId, note } = req.body;

    if (!orderItemId) {
      return res.status(400).json({ error: 'Order item ID is required' });
    }
    if (!supplierId) {
      return res.status(400).json({ error: 'Leverancier is verplicht' });
    }

    const { orderItem, error } = await loadOrderItemForProcessing(req.user, orderItemId);
    if (error) return res.status(error.status).json({ error: error.message });

    const supplier = await prisma.supplier.findUnique({ where: { id: parseInt(supplierId, 10) } });
    if (!supplier || supplier.installationId !== orderItem.order.installationId) {
      return res.status(400).json({ error: 'Onbekende leverancier voor deze installatie' });
    }

    const margin = calculateMargin({
      sellPrice: resolveSellPrice(orderItem),
      buyPrice,
      excludeVat: Boolean(excludeVat),
      shippingCost,
    });

    const data = {
      installationId: orderItem.order.installationId,
      orderId: orderItem.orderId,
      orderItemId: orderItem.id,
      supplierId: supplier.id,
      status: 'ordered',
      supplierOrderId: supplierOrderId ? String(supplierOrderId).trim() : null,
      buyPrice: Number(buyPrice) || 0,
      excludeVat: Boolean(excludeVat),
      note: note ? String(note) : null,
      notOrderedReason: null,
      processedById: req.user.id,
      processedAt: new Date(),
      ...margin,
    };

    const purchaseOrder = await prisma.purchaseOrder.upsert({
      where: { orderItemId: orderItem.id },
      update: data,
      create: data,
    });

    res.json({ success: true, purchaseOrder });
  } catch (error) {
    console.error('[PURCHASE ORDER] Process error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const markNotOrdered = async (req, res) => {
  try {
    const { orderItemId, reason, note } = req.body;

    if (!orderItemId) {
      return res.status(400).json({ error: 'Order item ID is required' });
    }
    if (!String(reason || '').trim()) {
      return res.status(400).json({ error: 'Reden is verplicht' });
    }

    const { orderItem, error } = await loadOrderItemForProcessing(req.user, orderItemId);
    if (error) return res.status(error.status).json({ error: error.message });

    const data = {
      installationId: orderItem.order.installationId,
      orderId: orderItem.orderId,
      orderItemId: orderItem.id,
      status: 'not_ordered',
      notOrderedReason: String(reason).trim(),
      note: note ? String(note) : null,
      sellPrice: resolveSellPrice(orderItem),
      processedById: req.user.id,
      processedAt: new Date(),
    };

    const purchaseOrder = await prisma.purchaseOrder.upsert({
      where: { orderItemId: orderItem.id },
      update: data,
      create: data,
    });

    res.json({ success: true, purchaseOrder });
  } catch (error) {
    console.error('[PURCHASE ORDER] Not ordered error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const updatePurchaseOrderTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierTracking } = req.body;

    const existing = await prisma.purchaseOrder.findUnique({ where: { id: parseInt(id, 10) } });
    if (!existing) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id: existing.id },
      data: { supplierTracking: supplierTracking ? String(supplierTracking).trim() : null },
    });

    res.json({ success: true, purchaseOrder });
  } catch (error) {
    console.error('[PURCHASE ORDER] Tracking error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// Terug naar de open-lijst zetten (bijv. per ongeluk verwerkt).
export const resetPurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.purchaseOrder.findUnique({ where: { id: parseInt(id, 10) } });
    if (!existing) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    await prisma.purchaseOrder.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[PURCHASE ORDER] Reset error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};