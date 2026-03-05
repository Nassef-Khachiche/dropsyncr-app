import prisma from '../config/database.js';
import {
  resolveShippingAutomationForOrder,
  inferBolShippingMethodFromOrderData,
  inferIsMailboxFromOrderData,
} from '../utils/shippingAutomation.js';

const normalizeOrderShippingState = (order) => {
  const normalizedOrderStatus = String(order?.orderStatus || '').trim().toLowerCase();
  const normalizedStatus = String(order?.status || '').trim().toLowerCase();

  const shippedStates = ['verzonden', 'verstuurd', 'shipped', 'delivered', 'afgeleverd'];

  if (shippedStates.includes(normalizedOrderStatus) || shippedStates.includes(normalizedStatus)) {
    return 'verzonden';
  }

  return 'openstaand';
};

const normalizeLabelUrlForResponse = (labelUrl, req) => {
  const normalized = String(labelUrl || '').trim();
  if (!normalized) return normalized;

  const forwardedProto = String(req.get('x-forwarded-proto') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const forwardedHost = String(req.get('x-forwarded-host') || '')
    .split(',')[0]
    .trim();
  const requestHost = forwardedHost || String(req.get('host') || '').trim();
  const protocol =
    req.secure ||
    forwardedProto === 'https' ||
    process.env.FORCE_LABEL_HTTPS === 'true' ||
    process.env.NODE_ENV === 'production'
      ? 'https'
      : req.protocol;

  if (normalized.startsWith('/labels/')) {
    return `${protocol}://${requestHost}${normalized}`;
  }

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
      SELECT shippingMethod
      FROM \`Order\`
      WHERE id = ${parsedOrderId}
      LIMIT 1
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
    new Set(
      (orderIds || [])
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
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
    const { installationId, userScoped, status, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const isAllStoresMode = !installationId || installationId === 'all';
    const forceUserScope = userScoped === 'true';

    // Build where clause - global admins can see all unless userScoped=true
    let baseWhere = {};
    if (req.user.isGlobalAdmin && !forceUserScope) {
      if (!isAllStoresMode) {
        const parsedInstallationId = parseInt(installationId, 10);
        if (Number.isNaN(parsedInstallationId)) {
          return res.status(400).json({ error: 'Invalid installation ID' });
        }

        baseWhere = {
          installationId: parsedInstallationId,
        };
      }
    } else {
      // Get user's installation IDs
      const userInstallations = await prisma.userInstallation.findMany({
        where: { userId: req.user.id },
        select: { installationId: true },
      });
      const installationIds = userInstallations.map(ui => ui.installationId);

      if (!isAllStoresMode) {
        const parsedInstallationId = parseInt(installationId, 10);
        if (Number.isNaN(parsedInstallationId)) {
          return res.status(400).json({ error: 'Invalid installation ID' });
        }

        if (!installationIds.includes(parsedInstallationId)) {
          return res.status(403).json({ error: 'Access denied to this installation' });
        }

        baseWhere = {
          userId: req.user.id,
          installationId: parsedInstallationId,
        };
      } else {
        baseWhere = {
          userId: req.user.id,
          installationId: { in: installationIds },
        };
      }

    }

    const andConditions = [];

    if (status && status !== 'all') {
      const normalizedStatus = String(status).toLowerCase();

      if (normalizedStatus === 'openstaand') {
        andConditions.push({
          OR: [
            {
              orderStatus: {
                in: ['openstaand', 'OPEN', 'NEW', 'ANNOUNCED', 'ARRIVED_AT_WH', 'onderweg-ffm', 'binnengekomen-ffm', 'label-aangemaakt'],
              },
            },
            {
              status: {
                in: ['openstaand', 'onderweg-ffm', 'binnengekomen-ffm', 'label-aangemaakt'],
              },
            },
          ],
        });
      } else if (normalizedStatus === 'verzonden') {
        andConditions.push({
          OR: [
            {
              orderStatus: {
                in: ['verzonden', 'verstuurd', 'SHIPPED', 'DELIVERED', 'afgeleverd'],
              },
            },
            {
              status: {
                in: ['verzonden', 'verstuurd', 'afgeleverd'],
              },
            },
          ],
        });
      } else {
        andConditions.push({
          OR: [
            { orderStatus: String(status) },
            { status: String(status) },
          ],
        });
      }
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

    const finalWhere = {
      ...baseWhere,
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: finalWhere,
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          tracking: true,
          label: true,
          installation: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.order.count({ where: finalWhere }),
    ]);

    const shippingMethodMap = await getShippingMethodMapForOrderIds(orders.map((order) => order.id));

    const normalizedOrders = orders.map((order) => ({
      ...order,
      shippingMethod: shippingMethodMap.get(order.id) || order.shippingMethod || null,
      label: order.label
        ? {
            ...order.label,
            labelUrl: normalizeLabelUrlForResponse(order.label.labelUrl, req),
          }
        : order.label,
    }));

    res.json({
      orders: normalizedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id,
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        tracking: true,
        label: {
          include: {
            carrier: true,
          },
        },
        profile: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const rawShippingMethod = await getShippingMethodForOrderId(order.id);

    const normalizedOrder = {
      ...order,
      shippingMethod: rawShippingMethod || order.shippingMethod || null,
      label: order.label
        ? {
            ...order.label,
            labelUrl: normalizeLabelUrlForResponse(order.label.labelUrl, req),
          }
        : order.label,
    };

    res.json(normalizedOrder);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createOrder = async (req, res) => {
  try {
    const {
      orderNumber,
      installationId,
      customerName,
      customerEmail,
      address,
      country,
      storeName,
      platform,
      orderDate,
      deliveryDate,
      orderValue,
      items,
      supplierTracking,
      status,
      shippingMethod,
      bolShippingMethod,
      fulfilmentMethod,
      fulfillmentMethod,
      isBrievenbus,
      isMailbox,
    } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    // Verify user has access to this installation (unless global admin)
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parsedInstallationId,
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const resolvedShippingMethod = inferBolShippingMethodFromOrderData({
      shippingMethod,
      bolShippingMethod,
      fulfilmentMethod,
      fulfillmentMethod,
      orderItems: items,
    });

    const mailboxOrder = inferIsMailboxFromOrderData({
      isBrievenbus,
      isMailbox,
      orderItems: items,
    });

    const shippingAutomationResult = await resolveShippingAutomationForOrder({
      prisma,
      installationId: parsedInstallationId,
      storeName,
      country,
      bolShippingMethod: resolvedShippingMethod,
      isBrievenbus: mailboxOrder,
    });

    const resolvedOrderShippingMethod = shippingAutomationResult.shippingAssignment || null;

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
        status: status || 'onderweg-ffm',
        orderStatus: 'openstaand',
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
      include: {
        orderItems: true,
        installation: true,
      },
    });

    if (resolvedOrderShippingMethod) {
      try {
        await prisma.$executeRaw`
          UPDATE \`Order\`
          SET shippingMethod = ${resolvedOrderShippingMethod}, updatedAt = NOW()
          WHERE id = ${order.id} AND installationId = ${parsedInstallationId}
        `;
      } catch {
        // shippingMethod might not exist in some DBs; ignore for compatibility
      }
    }

    res.status(201).json({
      ...order,
      shippingMethod: resolvedOrderShippingMethod,
    });
  } catch (error) {
    console.error('Create order error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Order number already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id, 10);
    const updateData = { ...(req.body || {}) };

    if (Number.isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        installationId: true,
        orderStatus: true,
        status: true,
      },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!req.user.isGlobalAdmin && existingOrder.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this order' });
    }

    let shippingMethodToPersist = null;
    const hasShippingMethodUpdate = Object.prototype.hasOwnProperty.call(updateData, 'shippingMethod');

    if (hasShippingMethodUpdate) {
      const shippingState = normalizeOrderShippingState(existingOrder);
      if (shippingState === 'verzonden') {
        return res.status(400).json({ error: 'Shipping method cannot be changed after verzending' });
      }

      const normalizedShippingMethod = String(updateData.shippingMethod || '').trim();
      shippingMethodToPersist = normalizedShippingMethod || null;
      delete updateData.shippingMethod;
    }

    // Convert date strings to Date objects if present
    if (updateData.orderDate) updateData.orderDate = new Date(updateData.orderDate);
    if (updateData.deliveryDate) updateData.deliveryDate = new Date(updateData.deliveryDate);
    if (updateData.orderValue) updateData.orderValue = parseFloat(updateData.orderValue);

    const finalUpdateData = {
      ...updateData,
    };

    if (hasShippingMethodUpdate) {
      await prisma.$executeRaw`
        UPDATE \`Order\`
        SET shippingMethod = ${shippingMethodToPersist}, updatedAt = NOW()
        WHERE id = ${orderId} AND installationId = ${existingOrder.installationId}
      `;
    }

    let order;
    if (Object.keys(finalUpdateData).length > 0) {
      order = await prisma.order.update({
        where: {
          id: orderId,
        },
        data: finalUpdateData,
        include: {
          orderItems: true,
          tracking: true,
          label: true,
        },
      });
    } else {
      order = await prisma.order.findUnique({
        where: {
          id: orderId,
        },
        include: {
          orderItems: true,
          tracking: true,
          label: true,
        },
      });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(hasShippingMethodUpdate ? { ...order, shippingMethod: shippingMethodToPersist } : order);
  } catch (error) {
    console.error('Update order error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (error.code === 'P2010' || String(error?.message || '').includes('Unknown column')) {
      return res.status(500).json({
        error: 'Shipping method column is missing in database',
        details: 'Voer de database migratie uit om kolom shippingMethod toe te voegen aan Order.',
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id, 10);

    if (Number.isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!req.user.isGlobalAdmin && existingOrder.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this order' });
    }

    await prisma.order.delete({
      where: {
        id: orderId,
      },
    });

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

