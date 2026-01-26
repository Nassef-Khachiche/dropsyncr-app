import prisma from '../config/database.js';

export const getDashboardStats = async (req, res) => {
  try {
    const { installationId } = req.query;
    const userId = req.user.id;

    // Parse installationId if provided and valid
    const parsedInstallationId = installationId && !isNaN(parseInt(installationId)) 
      ? parseInt(installationId) 
      : null;

    // Build where clause based on user permissions
    let where = {};
    if (req.user.isGlobalAdmin) {
      where = {
        ...(parsedInstallationId && { installationId: parsedInstallationId }),
      };
    } else {
      // Get user's installation IDs
      const userInstallations = await prisma.userInstallation.findMany({
        where: { userId },
        select: { installationId: true },
      });
      const installationIds = userInstallations.map(ui => ui.installationId);

      if (installationIds.length === 0) {
        // User has no installations, return empty stats
        return res.json({
          stats: {
            totalRevenue: 0,
            totalOrders: 0,
            pendingOrders: 0,
            processedToday: 0,
          },
          charts: {
            revenueData: [],
            ordersBySupplier: [],
          },
        });
      }

      where = {
        userId,
        installationId: { in: installationIds },
        ...(parsedInstallationId && installationIds.includes(parsedInstallationId) && { installationId: parsedInstallationId }),
      };
    }

    // Get date range (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const [
      totalRevenue,
      totalOrders,
      pendingOrders,
      processedToday,
      ordersByDate,
      ordersBySupplier,
    ] = await Promise.all([
      // Total revenue
      prisma.order.aggregate({
        where: {
          ...where,
          orderStatus: { in: ['verzonden', 'afgeleverd'] },
        },
        _sum: {
          orderValue: true,
        },
      }),

      // Total orders
      prisma.order.count({
        where,
      }),

      // Pending orders
      prisma.order.count({
        where: {
          ...where,
          orderStatus: 'openstaand',
        },
      }),

      // Processed today
      prisma.order.count({
        where: {
          ...where,
          orderStatus: 'verzonden',
          updatedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),

      // Orders by date (last 7 days)
      prisma.order.groupBy({
        by: ['orderDate'],
        where: {
          ...where,
          orderDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: {
          id: true,
        },
        _sum: {
          orderValue: true,
        },
        orderBy: {
          orderDate: 'asc',
        },
      }),

      // Orders by supplier (from order items)
      prisma.orderItem.groupBy({
        by: ['supplier'],
        where: {
          order: where,
        },
        _count: {
          id: true,
        },
      }),
    ]);

    // Format revenue data for chart
    const revenueData = ordersByDate.map((item) => ({
      date: new Date(item.orderDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      revenue: item._sum.orderValue || 0,
      orders: item._count.id,
    }));

    // Format supplier data
    const supplierData = ordersBySupplier
      .filter((item) => item.supplier)
      .map((item) => ({
        supplier: item.supplier,
        orders: item._count.id,
        percentage: Math.round((item._count.id / totalOrders) * 100),
      }));

    res.json({
      stats: {
        totalRevenue: totalRevenue._sum.orderValue || 0,
        totalOrders,
        pendingOrders,
        processedToday,
      },
      charts: {
        revenueData,
        ordersBySupplier: supplierData,
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

