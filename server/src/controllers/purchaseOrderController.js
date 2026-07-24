import prisma from '../config/database.js';
import { toAffiliateUrl, isAmazonUrl } from '../utils/affiliateLinks.js';

/**
 * Order Management — inkoop van dropship orders.
 *
 * Vier tabs:
 *   open        — orderitems zonder PurchaseOrder-record
 *   not_ordered — PurchaseOrder met status 'not_ordered' (wacht op controle manager)
 *   ordered     — PurchaseOrder met status 'ordered'
 *   canceled    — PurchaseOrder met status 'canceled' (manager heeft definitief afgekeurd)
 *
 * Flow bij niet bestellen: inkoper zet op 'not_ordered' -> manager controleert ->
 * lukt het echt niet, dan zet de manager hem op 'canceled'.
 *
 * Groepering: we pagineren op ORDER, niet op regel. Daardoor staan alle regels van
 * dezelfde klantorder altijd bij elkaar op dezelfde pagina. Binnen een order worden
 * regels met dezelfde EAN samengevoegd tot één regel met opgeteld aantal — de
 * inkoper bestelt die immers in één keer. Achter de schermen krijgt elk onderliggend
 * orderitem wel zijn eigen PurchaseOrder-record, zodat marge en historie per stuk
 * blijven kloppen.
 */

const VAT_RATE = 0.21;
const COMMISSION_RATE = 0.15;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// Standaard tonen we in de Ordered-tab alleen recent verwerkte orders, zodat de
// lijst snel blijft. Ouder dan dit valt onder "archief".
const ORDERED_RECENT_DAYS = 30;

const assertInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: user.id, installationId: parseInt(installationId) },
  });
  return Boolean(hasAccess);
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Stuksprijs van een orderitem.
const resolveUnitPrice = (orderItem) => {
  const unitPrice = Number(orderItem?.unitPrice || 0);
  const price = Number(orderItem?.price || 0);
  return unitPrice > 0 ? unitPrice : price;
};

const resolveQuantity = (orderItem) => Math.max(1, parseInt(orderItem?.quantity || 1, 10) || 1);

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

const getRecentCutoffDate = () => new Date(Date.now() - ORDERED_RECENT_DAYS * 24 * 60 * 60 * 1000);

// Filter op orderitem-niveau, afhankelijk van de gekozen tab.
const buildItemTabFilter = (tab, { withoutTracking = false, includeArchive = false } = {}) => {
  if (tab === 'not_ordered') {
    return { purchaseOrder: { status: 'not_ordered' } };
  }
  if (tab === 'canceled') {
    return { purchaseOrder: { status: 'canceled' } };
  }
  if (tab === 'ordered') {
    const trackingFilter = withoutTracking
      ? { OR: [{ supplierTracking: null }, { supplierTracking: '' }] }
      : {};
    const recentFilter = includeArchive ? {} : { processedAt: { gte: getRecentCutoffDate() } };
    return { purchaseOrder: { status: 'ordered', ...trackingFilter, ...recentFilter } };
  }
  return { purchaseOrder: null };
};

const buildOrderSearchFilter = (search) => {
  const term = String(search || '').trim();
  if (!term) return {};
  return {
    OR: [
      { orderNumber: { contains: term } },
      { customerName: { contains: term } },
      { orderItems: { some: { ean: { contains: term } } } },
      { orderItems: { some: { productName: { contains: term } } } },
    ],
  };
};

// Regels met dezelfde EAN (en dezelfde verwerkstatus) binnen één order samenvoegen.
const groupOrderItems = (orderItems = []) => {
  const groups = new Map();
  for (const item of orderItems) {
    const eanKey = String(item.ean || '').trim() || `item-${item.id}`;
    const statusKey = item.purchaseOrder?.status || 'open';
    const key = `${eanKey}::${statusKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Array.from(groups.values());
};

// Eén samengevoegde regel voor de frontend.
const toListRow = (order, itemsInGroup, userMap = new Map()) => {
  const primary = itemsInGroup[0];
  const purchaseOrder = primary.purchaseOrder || null;

  const totalQuantity = itemsInGroup.reduce((sum, item) => sum + resolveQuantity(item), 0);
  const unitPrice = round2(resolveUnitPrice(primary));
  const totalSellPrice = round2(
    itemsInGroup.reduce((sum, item) => sum + resolveUnitPrice(item) * resolveQuantity(item), 0)
  );

  return {
    // Alle onderliggende orderitems — de frontend stuurt deze mee bij verwerken.
    orderItemIds: itemsInGroup.map((item) => item.id),
    orderItemId: primary.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    address: order.address,
    country: order.country,
    storeName: order.storeName,
    platform: order.platform,
    orderDate: order.orderDate,
    deliveryDate: order.deliveryDate,
    ean: primary.ean,
    sku: primary.sku,
    productName: primary.productName,
    productImage: primary.productImage,
    supplierUrl: primary.product?.supplierUrl || null,
    productPurchasePrice: primary.product?.purchasePrice ?? null,
    quantity: totalQuantity,
    unitSellPrice: unitPrice,
    sellPrice: totalSellPrice,
    // Aantal losse orderitems dat in deze regel is samengevoegd.
    mergedItemCount: itemsInGroup.length,
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
          processedByName: userMap.get(purchaseOrder.processedById) || null,
        }
      : null,
  };
};

export const getPurchaseOrders = async (req, res) => {
  try {
    const {
      installationId,
      tab = 'open',
      search = '',
      page = 1,
      limit = DEFAULT_PAGE_SIZE,
      withoutTracking,
      includeArchive,
    } = req.query;

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
    const wantsArchive = String(includeArchive) === 'true';

    const itemTabFilter = buildItemTabFilter(tab, {
      withoutTracking: String(withoutTracking) === 'true',
      includeArchive: wantsArchive,
    });

    // Alleen dropship orders die nog openstaan.
    const baseOrderWhere = {
      installationId: installationIdNumber,
      fulfillmentType: 'dropship',
      status: 'openstaand',
    };

    // Kaart-tellers: aantal ORDERS per tab, zonder zoekterm zodat ze stabiel blijven.
    const [openCount, notOrderedCount, orderedCount, canceledCount] = await Promise.all([
      prisma.order.count({
        where: { ...baseOrderWhere, orderItems: { some: buildItemTabFilter('open') } },
      }),
      prisma.order.count({
        where: { ...baseOrderWhere, orderItems: { some: buildItemTabFilter('not_ordered') } },
      }),
      prisma.order.count({
        where: {
          ...baseOrderWhere,
          orderItems: { some: buildItemTabFilter('ordered', { includeArchive: true }) },
        },
      }),
      prisma.order.count({
        where: { ...baseOrderWhere, orderItems: { some: buildItemTabFilter('canceled') } },
      }),
    ]);

    const orderWhere = {
      ...baseOrderWhere,
      ...buildOrderSearchFilter(search),
      orderItems: { some: itemTabFilter },
    };

    // Oudste order bovenaan zodat de langst wachtende bestelling eerst komt.
    const [total, orders] = await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.order.findMany({
        where: orderWhere,
        orderBy: [{ orderDate: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize,
        include: {
          orderItems: {
            where: itemTabFilter,
            include: {
              product: { select: { supplierUrl: true, purchasePrice: true } },
              purchaseOrder: { include: { supplier: { select: { id: true, name: true } } } },
            },
            orderBy: { id: 'asc' },
          },
        },
      }),
    ]);

    // Naam van de inkoper erbij zoeken. PurchaseOrder heeft bewust geen relatie
    // naar User, dus we halen ze in één losse query op.
    const processedByIds = Array.from(
      new Set(
        orders
          .flatMap((order) => order.orderItems)
          .map((orderItem) => orderItem.purchaseOrder?.processedById)
          .filter(Boolean)
      )
    );

    const userMap = new Map();
    if (processedByIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: processedByIds } },
        select: { id: true, name: true, email: true },
      });
      users.forEach((user) => userMap.set(user.id, user.name || user.email));
    }

    const items = [];
    for (const order of orders) {
      for (const group of groupOrderItems(order.orderItems)) {
        items.push(toListRow(order, group, userMap));
      }
    }

    res.json({
      items,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // Ter verduidelijking: total telt orders, items telt samengevoegde regels.
        rowsOnPage: items.length,
      },
      counts: {
        open: openCount,
        not_ordered: notOrderedCount,
        ordered: orderedCount,
        canceled: canceledCount,
      },
      archive: {
        active: wantsArchive,
        recentDays: ORDERED_RECENT_DAYS,
      },
    });
  } catch (error) {
    console.error('[PURCHASE ORDER] List error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// Accepteert zowel één orderItemId als een lijst orderItemIds (samengevoegde regel).
const resolveOrderItemIds = (body = {}) => {
  const list = Array.isArray(body.orderItemIds) ? body.orderItemIds : [];
  const single = body.orderItemId != null ? [body.orderItemId] : [];
  return Array.from(new Set([...list, ...single].map((value) => parseInt(value, 10)).filter(Number.isFinite)));
};

const loadOrderItemsForProcessing = async (user, orderItemIds) => {
  const orderItems = await prisma.orderItem.findMany({
    where: { id: { in: orderItemIds } },
    include: { order: true, purchaseOrder: true },
  });

  if (orderItems.length === 0) {
    return { error: { status: 404, message: 'Order item not found' } };
  }

  const installationId = orderItems[0].order.installationId;
  if (!(await assertInstallationAccess(user, installationId))) {
    return { error: { status: 403, message: 'Access denied to this installation' } };
  }
  if (orderItems.some((item) => item.order.fulfillmentType !== 'dropship')) {
    return { error: { status: 400, message: 'Deze order is geen dropship order' } };
  }
  if (orderItems.some((item) => item.order.installationId !== installationId)) {
    return { error: { status: 400, message: 'Regels horen niet bij dezelfde installatie' } };
  }

  return { orderItems };
};

export const processPurchaseOrder = async (req, res) => {
  try {
    const { supplierId, buyPrice, excludeVat, shippingCost, supplierOrderId, note } = req.body;
    const orderItemIds = resolveOrderItemIds(req.body);

    if (orderItemIds.length === 0) {
      return res.status(400).json({ error: 'Order item ID is required' });
    }
    if (!supplierId) {
      return res.status(400).json({ error: 'Leverancier is verplicht' });
    }

    const { orderItems, error } = await loadOrderItemsForProcessing(req.user, orderItemIds);
    if (error) return res.status(error.status).json({ error: error.message });

    const installationId = orderItems[0].order.installationId;
    const supplier = await prisma.supplier.findUnique({ where: { id: parseInt(supplierId, 10) } });
    if (!supplier || supplier.installationId !== installationId) {
      return res.status(400).json({ error: 'Onbekende leverancier voor deze installatie' });
    }

    // De inkoper vult de inkoopprijs per stuk in. Verzendkosten gelden voor de hele
    // bestelling en verdelen we over de regels, zodat de opgetelde marge klopt.
    const unitBuyPrice = Number(buyPrice) || 0;
    const totalShipping = Number(shippingCost) || 0;
    const shippingPerItem = orderItems.length > 0 ? totalShipping / orderItems.length : 0;

    const results = [];
    for (const orderItem of orderItems) {
      const quantity = resolveQuantity(orderItem);
      const lineSellPrice = round2(resolveUnitPrice(orderItem) * quantity);
      const lineBuyPrice = round2(unitBuyPrice * quantity);

      const margin = calculateMargin({
        sellPrice: lineSellPrice,
        buyPrice: lineBuyPrice,
        excludeVat: Boolean(excludeVat),
        shippingCost: shippingPerItem,
      });

      const data = {
        installationId,
        orderId: orderItem.orderId,
        orderItemId: orderItem.id,
        supplierId: supplier.id,
        status: 'ordered',
        supplierOrderId: supplierOrderId ? String(supplierOrderId).trim() : null,
        buyPrice: lineBuyPrice,
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
      results.push(purchaseOrder);
    }

    res.json({ success: true, processed: results.length, purchaseOrders: results });
  } catch (error) {
    console.error('[PURCHASE ORDER] Process error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

const applyStatusToItems = async ({ req, res, status, requireReason }) => {
  const { reason, note } = req.body;
  const orderItemIds = resolveOrderItemIds(req.body);

  if (orderItemIds.length === 0) {
    return res.status(400).json({ error: 'Order item ID is required' });
  }
  if (requireReason && !String(reason || '').trim()) {
    return res.status(400).json({ error: 'Reden is verplicht' });
  }

  const { orderItems, error } = await loadOrderItemsForProcessing(req.user, orderItemIds);
  if (error) return res.status(error.status).json({ error: error.message });

  const installationId = orderItems[0].order.installationId;
  const results = [];

  for (const orderItem of orderItems) {
    const existing = orderItem.purchaseOrder;
    const quantity = resolveQuantity(orderItem);

    const data = {
      installationId,
      orderId: orderItem.orderId,
      orderItemId: orderItem.id,
      status,
      // Behoud de reden van de inkoper als er geen nieuwe wordt meegegeven.
      notOrderedReason: String(reason || '').trim() || existing?.notOrderedReason || null,
      note: note !== undefined ? (note ? String(note) : null) : existing?.note || null,
      sellPrice: round2(resolveUnitPrice(orderItem) * quantity),
      processedById: req.user.id,
      processedAt: new Date(),
    };

    const purchaseOrder = await prisma.purchaseOrder.upsert({
      where: { orderItemId: orderItem.id },
      update: data,
      create: data,
    });
    results.push(purchaseOrder);
  }

  return res.json({ success: true, processed: results.length, purchaseOrders: results });
};

export const markNotOrdered = async (req, res) => {
  try {
    return await applyStatusToItems({ req, res, status: 'not_ordered', requireReason: true });
  } catch (error) {
    console.error('[PURCHASE ORDER] Not ordered error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Definitief annuleren. Bedoeld voor de manager die een 'not_ordered' regel heeft
 * nagekeken en concludeert dat bestellen echt niet gaat lukken.
 */
export const markCanceled = async (req, res) => {
  try {
    return await applyStatusToItems({ req, res, status: 'canceled', requireReason: false });
  } catch (error) {
    console.error('[PURCHASE ORDER] Cancel error:', error);
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

    const tracking = supplierTracking ? String(supplierTracking).trim() : null;

    // Bij een samengevoegde regel hoort dezelfde tracking bij alle onderliggende
    // regels van hetzelfde product in dezelfde order.
    const sibling = await prisma.orderItem.findUnique({
      where: { id: existing.orderItemId },
      select: { ean: true, orderId: true },
    });

    if (sibling?.ean) {
      await prisma.purchaseOrder.updateMany({
        where: {
          orderId: sibling.orderId,
          status: 'ordered',
          orderItem: { ean: sibling.ean },
        },
        data: { supplierTracking: tracking },
      });
    } else {
      await prisma.purchaseOrder.update({
        where: { id: existing.id },
        data: { supplierTracking: tracking },
      });
    }

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: existing.id } });
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

    const sibling = await prisma.orderItem.findUnique({
      where: { id: existing.orderItemId },
      select: { ean: true, orderId: true },
    });

    if (sibling?.ean) {
      await prisma.purchaseOrder.deleteMany({
        where: {
          orderId: sibling.orderId,
          status: existing.status,
          orderItem: { ean: sibling.ean },
        },
      });
    } else {
      await prisma.purchaseOrder.delete({ where: { id: existing.id } });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[PURCHASE ORDER] Reset error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Bestelhistorie van hetzelfde product (op EAN) binnen deze installatie.
 * Voedt de history-sectie in de Process-dialog met echte cijfers.
 */
export const getProductPurchaseHistory = async (req, res) => {
  try {
    const { installationId, ean, excludeOrderId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const normalizedEan = String(ean || '').trim();
    if (!normalizedEan) {
      return res.json({ timesOrdered: 0, lastOrderedDate: null, avgBuyPrice: null, points: [], recent: [] });
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        installationId: parseInt(installationId, 10),
        status: 'ordered',
        orderItem: { ean: normalizedEan },
        ...(excludeOrderId ? { orderId: { not: parseInt(excludeOrderId, 10) } } : {}),
      },
      include: {
        supplier: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
      orderBy: { processedAt: 'desc' },
      take: 50,
    });

    if (purchaseOrders.length === 0) {
      return res.json({ timesOrdered: 0, lastOrderedDate: null, avgBuyPrice: null, points: [], recent: [] });
    }

    const buyPrices = purchaseOrders
      .map((po) => Number(po.buyPrice))
      .filter((value) => Number.isFinite(value) && value > 0);

    const avgBuyPrice = buyPrices.length
      ? round2(buyPrices.reduce((sum, value) => sum + value, 0) / buyPrices.length)
      : null;

    // Grafiek chronologisch (oud -> nieuw), maximaal de laatste 12 punten.
    const points = purchaseOrders
      .slice()
      .reverse()
      .filter((po) => po.processedAt && Number.isFinite(Number(po.buyPrice)))
      .slice(-12)
      .map((po) => ({ date: po.processedAt, price: round2(po.buyPrice) }));

    const recent = purchaseOrders.slice(0, 5).map((po) => ({
      date: po.processedAt,
      orderNumber: po.order?.orderNumber || null,
      supplier: po.supplier?.name || null,
      buyPrice: po.buyPrice != null ? round2(po.buyPrice) : null,
      netProfit: po.netProfit != null ? round2(po.netProfit) : null,
    }));

    res.json({
      timesOrdered: purchaseOrders.length,
      lastOrderedDate: purchaseOrders[0]?.processedAt || null,
      avgBuyPrice,
      points,
      recent,
    });
  } catch (error) {
    console.error('[PURCHASE ORDER] History error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Leverancierslink opslaan op het product. De inkoper plakt een Amazon-URL,
 * wij bewaren de affiliate-variant zodat de volgende bestelling van hetzelfde
 * product direct via die link loopt.
 */
export const saveProductSupplierUrl = async (req, res) => {
  try {
    const { orderItemId, url } = req.body;

    if (!orderItemId) {
      return res.status(400).json({ error: 'Order item ID is required' });
    }
    if (!String(url || '').trim()) {
      return res.status(400).json({ error: 'URL is verplicht' });
    }

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: parseInt(orderItemId, 10) },
      include: { order: true, product: true },
    });

    if (!orderItem) {
      return res.status(404).json({ error: 'Order item not found' });
    }
    if (!(await assertInstallationAccess(req.user, orderItem.order.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const supplierUrl = toAffiliateUrl(url);
    const wasConverted = isAmazonUrl(url) && supplierUrl !== String(url).trim();

    // Op het gekoppelde product opslaan, en op elk ander product met dezelfde
    // EAN binnen deze installatie — zodat de link ook geldt bij een volgende order.
    const ean = String(orderItem.ean || '').trim();
    if (ean) {
      await prisma.product.updateMany({
        where: { installationId: orderItem.order.installationId, ean },
        data: { supplierUrl },
      });
    }
    if (orderItem.productId) {
      await prisma.product.update({
        where: { id: orderItem.productId },
        data: { supplierUrl },
      });
    }

    console.log('[PURCHASE ORDER] Supplier URL opgeslagen', {
      orderItemId: orderItem.id,
      ean,
      affiliate: wasConverted,
    });

    res.json({ success: true, supplierUrl, isAffiliate: wasConverted });
  } catch (error) {
    console.error('[PURCHASE ORDER] Supplier URL error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};