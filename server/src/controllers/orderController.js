import prisma from '../config/database.js';

export const getOrders = async (req, res) => {
  try {
    const { installationId, status, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause - global admins can see all, others only their installations
    let baseWhere = {};
    if (req.user.isGlobalAdmin) {
      baseWhere = {
        ...(installationId && { installationId: parseInt(installationId) }),
      };
    } else {
      // Get user's installation IDs
      const userInstallations = await prisma.userInstallation.findMany({
        where: { userId: req.user.id },
        select: { installationId: true },
      });
      const installationIds = userInstallations.map(ui => ui.installationId);

      baseWhere = {
        userId: req.user.id,
        installationId: { in: installationIds },
        ...(installationId && installationIds.includes(parseInt(installationId)) && { installationId: parseInt(installationId) }),
      };
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

    res.json({
      orders,
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

    res.json(order);
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
    } = req.body;

    // Verify user has access to this installation (unless global admin)
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const order = await prisma.order.create({
      data: {
        orderNumber,
        installationId: parseInt(installationId),
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

    res.status(201).json(order);
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
    const updateData = req.body;

    // Convert date strings to Date objects if present
    if (updateData.orderDate) updateData.orderDate = new Date(updateData.orderDate);
    if (updateData.deliveryDate) updateData.deliveryDate = new Date(updateData.deliveryDate);
    if (updateData.orderValue) updateData.orderValue = parseFloat(updateData.orderValue);

    const order = await prisma.order.update({
      where: {
        id: parseInt(id),
        userId: req.user.id,
      },
      data: updateData,
      include: {
        orderItems: true,
        tracking: true,
        label: true,
      },
    });

    res.json(order);
  } catch (error) {
    console.error('Update order error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.order.delete({
      where: {
        id: parseInt(id),
        userId: req.user.id,
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

