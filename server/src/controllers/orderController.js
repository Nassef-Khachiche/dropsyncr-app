import prisma from '../config/database.js';
import {
  resolveShippingAutomationForOrder,
  inferBolShippingMethodFromOrderData,
  inferIsMailboxFromOrderData,
} from '../utils/shippingAutomation.js';

const normalizeOrderShippingState = (order) => {
  const normalizedStatus = String(order?.status || '').trim().toLowerCase();
  const normalizedOrderStatus = String(order?.orderStatus || '').trim().toLowerCase();
  const normalizedOrderStatusCode = String(order?.orderStatusCode || '').trim().toUpperCase();

  const shippedStates = ['verzonden', 'verstuurd', 'shipped', 'delivered', 'afgeleverd'];
  const shippedStatusCodes = ['SHIPPED', 'DELIVERED'];
  const hasInternalStatus = Boolean(normalizedStatus);

  if (hasInternalStatus) {
    return shippedStates.includes(normalizedStatus) ? 'verzonden' : 'openstaand';
  }
  if (shippedStatusCodes.includes(normalizedOrderStatusCode)) return 'verzonden';
  if (shippedStates.includes(normalizedOrderStatus)) return 'verzonden';
  return 'openstaand';
};

const toOrderStatusCode = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const shippedTokens = new Set([
    'verzonden', 'verstuurd', 'afgeleverd', 'shipped', 'delivered',
    'send', 'sent', 'processed', 'finished', 'dispatched', 'fulfilled',
    'fulfilment_completed', 'fulfillment_completed', 'completed',
  ]);
  return shippedTokens.has(normalized) ? 'SHIPPED' : 'OPEN';
};

const normalizeLabelUrlForResponse = (labelUrl, req) => {
  const normalized = String(labelUrl || '').trim();
  if (!normalized) return normalized;

  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const requestHost = forwardedHost || String(req.get('host') || '').trim();
  const protocol =
    req.secure || forwardedProto === 'https' || process.env.FORCE_LABEL_HTTPS === 'true' || process.env.NODE_ENV === 'production'
      ? 'https'
      : req.protocol;

  if (normalized.startsWith('/labels/')) return `${protocol}://${requestHost}${normalized}`;

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const parsedUrl = new URL(normalized);
      const sameHost = parsedUrl.host.toLowerCase() === requestHost.toLowerCase();
      if (sameHost && protocol === 'https' && parsedUrl.protocol === 'http:') {
        parsedUrl.protocol = 'https:';
        return parsedUrl.toString();
      }
    } catch {
      return normalized;
    }
  }

  return normalized;
};

const getShippingMethodForOrderId = async (orderId) => {
  const parsedOrderId = parseInt(orderId, 10);
  if (!Number.isInteger(parsedOrderId) || parsedOrderId <= 0) return null;

  try {
    const rows = await prisma.$queryRaw`
      SELECT shippingMethod FROM \`Order\` WHERE id = ${parsedOrderId} LIMIT 1
    `;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const shippingMethod = rows[0]?.shippingMethod;
    return typeof shippingMethod === 'string' && shippingMethod.trim() ? shippingMethod.trim() : null;
  } catch {
    return null;
  }
};

const getShippingMethodMapForOrderIds = async (orderIds = []) => {
  const uniqueOrderIds = Array.from(
    new Set((orderIds || []).map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))
  );
  const shippingMethodMap = new Map();
  await Promise.all(
    uniqueOrderIds.map(async (orderId) => {
      const shippingMethod = await getShippingMethodForOrderId(orderId);
      shippingMethodMap.set(orderId, shippingMethod);
    })
  );
  return shippingMethodMap;
};

export const getOrders = async (req, res) => {
  try {
    const { installationId, userScoped, status, search, page = 1, limit = 50, fulfillmentType, storeName, vvbWindow } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const isAllStoresMode = !installationId || installationId === 'all';
    const forceUserScope = userScoped === 'true';

    let baseWhere = {};
    if (req.user.isGlobalAdmin && !forceUserScope) {
      if (!isAllStoresMode) {
        const parsedInstallationId = parseInt(installationId, 10);
        if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });
        baseWhere = { installationId: parsedInstallationId };
      }
    } else {
      const userInstallations = await prisma.userInstallation.findMany({
        where: { userId: req.user.id },
        select: { installationId: true },
      });
      const installationIds = userInstallations.map(ui => ui.installationId);

      if (!isAllStoresMode) {
        const parsedInstallationId = parseInt(installationId, 10);
        if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });
        if (!installationIds.includes(parsedInstallationId)) return res.status(403).json({ error: 'Access denied to this installation' });
        baseWhere = { installationId: parsedInstallationId };
      } else {
        baseWhere = { installationId: { in: installationIds } };
      }
    }

    const andConditions = [];

    if (status && status !== 'all') {
      const normalizedStatus = String(status).toLowerCase();
      if (normalizedStatus === 'gepickt') {
        andConditions.push({ OR: [{ orderStatus: 'gepickt' }, { status: 'gepickt' }] });
      } else if (normalizedStatus === 'openstaand') {
        andConditions.push({
          OR: [
            { orderStatus: { in: ['openstaand', 'OPEN', 'NEW', 'ANNOUNCED', 'ARRIVED_AT_WH', 'onderweg-ffm', 'binnengekomen-ffm', 'label-aangemaakt'] } },
            { status: { in: ['openstaand', 'onderweg-ffm', 'binnengekomen-ffm', 'label-aangemaakt'] } },
          ],
        });
      } else if (normalizedStatus === 'verzonden') {
        andConditions.push({
          OR: [
            { orderStatus: { in: ['verzonden', 'verstuurd', 'SHIPPED', 'DELIVERED', 'afgeleverd'] } },
            { status: { in: ['verzonden', 'verstuurd', 'afgeleverd'] } },
          ],
        });
      } else {
        andConditions.push({ OR: [{ orderStatus: String(status) }, { status: String(status) }] });
      }
    }

    if (fulfillmentType) andConditions.push({ fulfillmentType: String(fulfillmentType) });
    if (storeName && storeName !== 'all') andConditions.push({ storeName: String(storeName) });

    if (vvbWindow === 'ochtend' || vvbWindow === 'avond') {
      // Vandaag (UTC dag-range)
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      // Ochtend = 09:30 NL = 07:30 UTC ; Avond = 18:00 NL = 16:00 UTC
      const windowStart = new Date(dayStart);
      const windowEnd = new Date(dayStart);
      if (vvbWindow === 'ochtend') {
        windowStart.setUTCHours(7, 0, 0, 0);
        windowEnd.setUTCHours(8, 0, 0, 0);
      } else {
        windowStart.setUTCHours(15, 30, 0, 0);
        windowEnd.setUTCHours(16, 30, 0, 0);
      }

      andConditions.push({
        AND: [
          { latestDropOffDate: { gte: dayStart, lt: dayEnd } },
          { latestDropOffDate: { gte: windowStart, lte: windowEnd } },
          { OR: [{ isVVB: true }, { shippingMethod: { contains: 'bol' } }] },
        ],
      });
    }

    if (req.query.expiringTomorrow === 'true') {
      const filterNow = new Date();
      const filterNextWorkday = new Date(filterNow);
      filterNextWorkday.setDate(filterNextWorkday.getDate() + 2);
      while (filterNextWorkday.getDay() === 0 || filterNextWorkday.getDay() === 6) {
        filterNextWorkday.setDate(filterNextWorkday.getDate() + 2);
      }
      filterNextWorkday.setHours(23, 59, 59, 999);
      andConditions.push({ deliveryDate: { lte: filterNextWorkday } });
    }

    if (search) {
      andConditions.push({
        OR: [
          { orderNumber: { contains: search } },
          { customerName: { contains: search } },
          { supplierTracking: { contains: search } },
        ],
      });
    }

    const finalWhere = { ...baseWhere, ...(andConditions.length > 0 ? { AND: andConditions } : {}) };
    const statsWhere = { ...baseWhere };

    const now = new Date();
    const nextWorkday = new Date(now);
    nextWorkday.setDate(nextWorkday.getDate() + 1);
    while (nextWorkday.getDay() === 0 || nextWorkday.getDay() === 6) {
      nextWorkday.setDate(nextWorkday.getDate() + 1);
    }
    nextWorkday.setHours(23, 59, 59, 999);

    const openStatusValues = ['openstaand', 'OPEN', 'NEW', 'ANNOUNCED', 'ARRIVED_AT_WH', 'onderweg-ffm', 'binnengekomen-ffm', 'label-aangemaakt'];
    const shippedStatusValues = ['verzonden', 'verstuurd', 'SHIPPED', 'DELIVERED', 'afgeleverd'];

    const [orders, total, statsOpen, statsNeedsPicking, statsExpiringTomorrow, statsProcessed] = await Promise.all([
      prisma.order.findMany({
        where: finalWhere,
        include: {
          orderItems: { include: { product: true } },
          tracking: true,
          label: true,
          installation: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.order.count({ where: finalWhere }),
      prisma.order.count({
        where: { ...statsWhere, OR: [{ orderStatus: { in: openStatusValues } }, { status: { in: openStatusValues } }] },
      }),
      prisma.order.count({
        where: { ...statsWhere, fulfillmentType: 'fulfillment', OR: [{ orderStatus: { in: openStatusValues } }, { status: { in: openStatusValues } }] },
      }),
      prisma.order.count({
        where: { ...statsWhere, deliveryDate: { gte: now, lte: nextWorkday }, OR: [{ orderStatus: { in: openStatusValues } }, { status: { in: openStatusValues } }] },
      }),
      prisma.order.count({
        where: { ...statsWhere, OR: [{ orderStatus: { in: shippedStatusValues } }, { status: { in: shippedStatusValues } }] },
      }),
    ]);

    const shippingMethodMap = await getShippingMethodMapForOrderIds(orders.map((order) => order.id));

    const normalizedOrders = orders.map((order) => ({
      ...order,
      shippingMethod: shippingMethodMap.get(order.id) || order.shippingMethod || null,
      label: order.label ? { ...order.label, labelUrl: normalizeLabelUrlForResponse(order.label.labelUrl, req) } : order.label,
    }));

    res.json({
      orders: normalizedOrders,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
      stats: { openOrders: statsOpen, needsPicking: statsNeedsPicking, expiringTomorrow: statsExpiringTomorrow, processed: statsProcessed },
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId)) return res.status(400).json({ error: 'Invalid order ID' });

    const order = await prisma.order.findFirst({
      where: {
        id: parsedId,
        ...(req.user.isGlobalAdmin ? {} : {
          installation: { users: { some: { userId: req.user.id } } },
        }),
      },
      include: {
        orderItems: { include: { product: true } },
        tracking: true,
        label: { include: { carrier: true } },
        installation: { select: { id: true, name: true } },
      },
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const rawShippingMethod = await getShippingMethodForOrderId(order.id);

    res.json({
      ...order,
      shippingMethod: rawShippingMethod || order.shippingMethod || null,
      label: order.label ? { ...order.label, labelUrl: normalizeLabelUrlForResponse(order.label.labelUrl, req) } : order.label,
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPicklist = async (req, res) => {
  try {
    const { orderIds } = req.query;
    if (!orderIds) return res.status(400).json({ error: 'orderIds is required' });

    const parsedIds = String(orderIds).split(',').map(id => parseInt(id, 10)).filter(id => !Number.isNaN(id));
    if (parsedIds.length === 0) return res.status(400).json({ error: 'No valid order IDs provided' });

    const orders = await prisma.order.findMany({
      where: { id: { in: parsedIds } },
      include: {
        orderItems: { include: { product: true } },
        installation: { select: { id: true, name: true } },
      },
    });

    const productIds = [...new Set(orders.flatMap(o => o.orderItems.map(i => i.productId)).filter(Boolean))];
    const installationIds = [...new Set(orders.map(o => o.installationId))];

    // FIFO: oudste batch per product ophalen — orderBy receivedAt asc
    const batches = productIds.length > 0
      ? await prisma.stockBatch.findMany({
          where: { productId: { in: productIds }, installationId: { in: installationIds } },
          select: { productId: true, locationId: true, receivedAt: true },
          orderBy: { receivedAt: 'asc' },
        })
      : [];

    const locationIds = [...new Set(batches.map(b => b.locationId))];
    const locations = locationIds.length > 0
      ? await prisma.warehouseLocation.findMany({
          where: { id: { in: locationIds } },
          select: { id: true, code: true },
        })
      : [];
    const locationMap = Object.fromEntries(locations.map(l => [l.id, l.code]));

    // Per product: alleen de oudste locatie (FIFO) — eerste batch in gesorteerde lijst
    const oldestLocationPerProduct = new Map();
    for (const batch of batches) {
      if (!oldestLocationPerProduct.has(batch.productId)) {
        const code = locationMap[batch.locationId];
        if (code) oldestLocationPerProduct.set(batch.productId, code);
      }
    }

    const reservations = await prisma.stockReservation.findMany({
      where: { orderId: { in: parsedIds }, cancelled: false, pickedAt: null },
    });

    const picklist = orders.map(order => ({
      ...order,
      reservations: reservations.filter(r => r.orderId === order.id),
      orderItems: order.orderItems.map(item => {
        const locatieCode = oldestLocationPerProduct.get(item.productId);
        return {
          ...item,
          product: {
            ...item.product,
            locations: locatieCode ? [{ location: locatieCode }] : [],
          },
        };
      }),
    }));

    res.json({ picklist });
  } catch (error) {
    console.error('Get picklist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createOrder = async (req, res) => {
  try {
    const {
      orderNumber, installationId, customerName, customerEmail, address, country,
      storeName, platform, orderDate, deliveryDate, orderValue, items,
      supplierTracking, status, shippingMethod, bolShippingMethod,
      fulfilmentMethod, fulfillmentMethod, isBrievenbus, isMailbox,
    } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parsedInstallationId },
      });
      if (!hasAccess) return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const resolvedShippingMethod = inferBolShippingMethodFromOrderData({ shippingMethod, bolShippingMethod, fulfilmentMethod, fulfillmentMethod, orderItems: items });
    const mailboxOrder = inferIsMailboxFromOrderData({ isBrievenbus, isMailbox, orderItems: items });
    const shippingAutomationResult = await resolveShippingAutomationForOrder({ prisma, installationId: parsedInstallationId, storeName, country, bolShippingMethod: resolvedShippingMethod, isBrievenbus: mailboxOrder });
    const resolvedOrderShippingMethod = shippingAutomationResult.shippingAssignment || null;
    const normalizedInternalStatus = status || 'onderweg-ffm';

    const order = await prisma.order.create({
      data: {
        orderNumber,
        installationId: parsedInstallationId,
        userId: req.user.id,
        customerName,
        customerEmail,
        address,
        country,
        storeName,
        platform,
        orderDate: new Date(orderDate),
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        orderValue: parseFloat(orderValue),
        itemCount: items?.length || 1,
        supplierTracking,
        status: normalizedInternalStatus,
        orderStatus: 'openstaand',
        orderStatusCode: toOrderStatusCode(normalizedInternalStatus),
        orderItems: {
          create: items?.map((item) => ({
            productId: item.productId || null,
            productName: item.productName,
            productImage: item.productImage,
            ean: item.ean,
            sku: item.sku,
            quantity: item.quantity || 1,
            price: parseFloat(item.price || 0),
            unitPrice: parseFloat(item.price || item.unitPrice || 0),
            weight: item.weight,
            supplier: item.supplier,
          })) || [],
        },
      },
      include: { orderItems: true, installation: true },
    });

    if (resolvedOrderShippingMethod) {
      try {
        await prisma.$executeRaw`UPDATE \`Order\` SET shippingMethod = ${resolvedOrderShippingMethod}, updatedAt = NOW() WHERE id = ${order.id} AND installationId = ${parsedInstallationId}`;
      } catch { /* ignore */ }
    }

    res.status(201).json({ ...order, shippingMethod: resolvedOrderShippingMethod });
  } catch (error) {
    console.error('Create order error:', error);
    if (error.code === 'P2002') return res.status(400).json({ error: 'Order number already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id, 10);
    const updateData = { ...(req.body || {}) };

    if (Number.isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, installationId: true, orderStatus: true, status: true, orderStatusCode: true },
    });

    if (!existingOrder) return res.status(404).json({ error: 'Order not found' });
    if (!req.user.isGlobalAdmin && existingOrder.userId !== req.user.id) return res.status(403).json({ error: 'Access denied to this order' });

    let shippingMethodToPersist = null;
    const hasShippingMethodUpdate = Object.prototype.hasOwnProperty.call(updateData, 'shippingMethod');

    if (hasShippingMethodUpdate) {
      if (normalizeOrderShippingState(existingOrder) === 'verzonden') {
        return res.status(400).json({ error: 'Shipping method cannot be changed after verzending' });
      }
      shippingMethodToPersist = String(updateData.shippingMethod || '').trim() || null;
      delete updateData.shippingMethod;
    }

    if (updateData.orderDate) updateData.orderDate = new Date(updateData.orderDate);
    if (updateData.deliveryDate) updateData.deliveryDate = new Date(updateData.deliveryDate);
    if (updateData.orderValue) updateData.orderValue = parseFloat(updateData.orderValue);

    const finalUpdateData = { ...updateData };
    if (Object.prototype.hasOwnProperty.call(finalUpdateData, 'status')) {
      finalUpdateData.orderStatusCode = toOrderStatusCode(finalUpdateData.status);
    } else if (Object.prototype.hasOwnProperty.call(finalUpdateData, 'orderStatus')) {
      finalUpdateData.orderStatusCode = toOrderStatusCode(finalUpdateData.orderStatus);
    }

    if (hasShippingMethodUpdate) {
      await prisma.$executeRaw`UPDATE \`Order\` SET shippingMethod = ${shippingMethodToPersist}, updatedAt = NOW() WHERE id = ${orderId} AND installationId = ${existingOrder.installationId}`;
    }

    let order;
    if (Object.keys(finalUpdateData).length > 0) {
      order = await prisma.order.update({
        where: { id: orderId },
        data: finalUpdateData,
        include: { orderItems: true, tracking: true, label: true },
      });
    } else {
      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { orderItems: true, tracking: true, label: true },
      });
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json(hasShippingMethodUpdate ? { ...order, shippingMethod: shippingMethodToPersist } : order);
  } catch (error) {
    console.error('Update order error:', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id, 10);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID' });

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true },
    });

    if (!existingOrder) return res.status(404).json({ error: 'Order not found' });
    if (!req.user.isGlobalAdmin && existingOrder.userId !== req.user.id) return res.status(403).json({ error: 'Access denied to this order' });

    await prisma.order.delete({ where: { id: orderId } });
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    res.status(500).json({ error: 'Internal server error' });
  }
};