import prisma from '../config/database.js';

export const getTrackings = async (req, res) => {
  try {
    const { status, search } = req.query;

    const where = {
      order: {
        userId: req.user.id,
      },
      ...(status && status !== 'all' && { status }),
      ...(search && {
        OR: [
          { trackingCode: { contains: search } },
          { order: { orderNumber: { contains: search } } },
        ],
      }),
    };

    const trackings = await prisma.tracking.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            profile: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(trackings);
  } catch (error) {
    console.error('Get trackings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTracking = async (req, res) => {
  try {
    const { orderId, trackingCode, supplier, source } = req.body;

    // Check if order belongs to user
    const order = await prisma.order.findFirst({
      where: {
        id: parseInt(orderId),
        userId: req.user.id,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const tracking = await prisma.tracking.upsert({
      where: { orderId: parseInt(orderId) },
      update: {
        trackingCode,
        supplier,
        source: source || 'manual',
        status: 'linked',
      },
      create: {
        orderId: parseInt(orderId),
        trackingCode,
        supplier,
        source: source || 'manual',
        status: 'linked',
      },
    });

    res.status(201).json(tracking);
  } catch (error) {
    console.error('Create tracking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const bulkCreateTracking = async (req, res) => {
  try {
    const { trackings } = req.body; // Array of { trackingCode, supplier, source }

    const results = await Promise.all(
      trackings.map(async (tracking) => {
        // Try to find order by tracking code in supplier tracking field
        const order = await prisma.order.findFirst({
          where: {
            userId: req.user.id,
            supplierTracking: tracking.trackingCode,
          },
        });

        if (order) {
          return prisma.tracking.upsert({
            where: { orderId: order.id },
            update: {
              trackingCode: tracking.trackingCode,
              supplier: tracking.supplier,
              source: tracking.source || 'email',
              status: 'linked',
            },
            create: {
              orderId: order.id,
              trackingCode: tracking.trackingCode,
              supplier: tracking.supplier,
              source: tracking.source || 'email',
              status: 'linked',
            },
          });
        } else {
          // Create pending tracking (no order linked)
          return prisma.tracking.create({
            data: {
              orderId: null, // This will need a different approach - maybe a separate table
              trackingCode: tracking.trackingCode,
              supplier: tracking.supplier,
              source: tracking.source || 'email',
              status: 'pending',
            },
          });
        }
      })
    );

    res.status(201).json({ created: results.length, trackings: results });
  } catch (error) {
    console.error('Bulk create tracking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

