import prisma from '../config/database.js';
import fetch from 'node-fetch';

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

export const refreshWeGrowTracking = async (req, res) => {
  try {
    const { carrierId, shipmentId } = req.body;

    if (!carrierId || !shipmentId) {
      return res.status(400).json({ error: 'carrierId en shipmentId zijn verplicht' });
    }

    const carrier = await prisma.carrier.findUnique({
      where: { id: parseInt(carrierId) },
    });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    if (carrier.carrierType !== 'wegrow') {
      return res.status(400).json({ error: 'Carrier is not a WeGrow carrier' });
    }

    if (!carrier.active) {
      return res.status(400).json({ error: 'Carrier contract is inactive' });
    }

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: carrier.installationId,
        },
      });

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const credentials = JSON.parse(carrier.credentials || '{}');
    const apiKey = credentials.apiKey || process.env.WEGROW_API_KEY;
    const apiVersion = credentials.apiVersion || 'v1';

    if (!apiKey) {
      return res.status(400).json({ error: 'WeGrow API key ontbreekt' });
    }

    const sandboxDefault = process.env.WEGROW_SANDBOX_URL || 'https://api-sandbox.wegrow.eu';
    const productionDefault = process.env.WEGROW_PRODUCTION_URL || 'https://api.wegrow.eu';
    const useSandbox = credentials.sandbox === true || credentials.environment === 'sandbox';
    const baseUrl = (credentials.baseUrl || process.env.WEGROW_BASE_URL || (useSandbox ? sandboxDefault : productionDefault)).replace(/\/+$/, '');

    const response = await fetch(`${baseUrl}/shipments/${encodeURIComponent(String(shipmentId))}/track`, {
      method: 'GET',
      headers: {
        'x-key': apiKey,
        'x-version': apiVersion,
      },
    });

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(502).json({
        error: 'Failed to fetch WeGrow tracking',
        details: responseData?.detail || responseData?.error || 'Unknown WeGrow error',
      });
    }

    const events = responseData?.events || responseData?.event || [];
    const latestEvent = Array.isArray(events) && events.length > 0 ? events[events.length - 1] : null;

    return res.json({
      success: true,
      shipmentId: String(shipmentId),
      carrierTrackingId: responseData?.carrier_tracking_id || null,
      eta: responseData?.eta || null,
      events,
      latestStatus: latestEvent
        ? {
          time: latestEvent?.time || null,
          milestone: latestEvent?.codes?.milestone || null,
          code: latestEvent?.codes?.code || null,
          subCode: latestEvent?.codes?.sub_code || null,
          description: latestEvent?.codes?.description || null,
        }
        : null,
    });
  } catch (error) {
    console.error('Refresh WeGrow tracking error:', error);
    res.status(500).json({ error: 'Failed to refresh WeGrow tracking' });
  }
};

