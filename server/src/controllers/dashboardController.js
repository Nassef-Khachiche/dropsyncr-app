import prisma from '../config/database.js';

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const toValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveDateRange = (query = {}) => {
  const today = new Date();
  const preset = String(query.period || '').trim().toLowerCase();
  const explicitStart = toValidDate(query.startDate);
  const explicitEnd = toValidDate(query.endDate);

  if (explicitStart || explicitEnd) {
    return {
      startDate: startOfDay(explicitStart || today),
      endDate: endOfDay(explicitEnd || explicitStart || today),
    };
  }

  if (preset === 'today') {
    return { startDate: startOfDay(today), endDate: endOfDay(today) };
  }

  if (preset === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };
  }

  if (preset === 'last_7' || preset === 'last7days') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { startDate: startOfDay(start), endDate: endOfDay(today) };
  }

  if (preset === 'last_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { startDate: startOfDay(start), endDate: endOfDay(end) };
  }

  if (preset === 'this_year') {
    return { startDate: startOfDay(new Date(today.getFullYear(), 0, 1)), endDate: endOfDay(today) };
  }

  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return { startDate: startOfDay(currentMonthStart), endDate: endOfDay(today) };
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const makeDateBuckets = (startDate, endDate) => {
  const buckets = new Map();
  const cursor = startOfDay(startDate);
  const last = startOfDay(endDate);

  while (cursor <= last) {
    buckets.set(formatDateKey(cursor), { date: formatDateKey(cursor), revenue: 0, orders: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
};

const buildOrderWhere = async (req, installationId) => {
  const normalizedInstallationId = String(installationId || '').trim().toLowerCase();
  const isAllStoresMode = !normalizedInstallationId || normalizedInstallationId === 'all';
  const parsedInstallationId = !isAllStoresMode && !Number.isNaN(parseInt(normalizedInstallationId, 10))
    ? parseInt(normalizedInstallationId, 10)
    : null;

  if (!isAllStoresMode && !parsedInstallationId) {
    const error = new Error('Invalid installation ID');
    error.statusCode = 400;
    throw error;
  }

  if (req.user.isGlobalAdmin) {
    return parsedInstallationId ? { installationId: parsedInstallationId } : {};
  }

  const userInstallations = await prisma.userInstallation.findMany({
    where: { userId: req.user.id },
    select: { installationId: true },
  });
  const installationIds = userInstallations.map((entry) => entry.installationId);

  if (installationIds.length === 0) {
    return { id: -1 };
  }

  if (parsedInstallationId) {
    if (!installationIds.includes(parsedInstallationId)) {
      const error = new Error('Access denied to this installation');
      error.statusCode = 403;
      throw error;
    }
    return { installationId: parsedInstallationId };
  }

  return { installationId: { in: installationIds } };
};

const normalizePlatformKey = (platform = '', storeName = '') => {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const normalizedStore = String(storeName || '').trim().toLowerCase();

  if (normalizedPlatform.includes('bol')) return 'bol';
  if (normalizedPlatform.includes('kaufland')) return 'kaufland';
  if (normalizedStore.includes('fleximedix')) return 'fleximedix';
  if (normalizedStore.includes('inandout') || normalizedStore.includes('in and outdoor')) return 'inandoutdoormatch';
  if (normalizedPlatform.includes('shopify')) return 'shopify';
  return normalizedPlatform || 'other';
};

const emptyChannel = () => ({ daily: [] });

const toCsv = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
};

export const getDashboardStats = async (req, res) => {
  try {
    const { installationId } = req.query;
    const where = await buildOrderWhere(req, installationId);
    const { startDate, endDate } = resolveDateRange(req.query);
    const dateWhere = { orderDate: { gte: startDate, lte: endDate } };

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
          ...dateWhere,
          status: { in: ['verzonden', 'afgeleverd'] },
        },
        _sum: {
          orderValue: true,
        },
      }),

      // Total orders
      prisma.order.count({
        where: { ...where, ...dateWhere },
      }),

      // Pending orders
      prisma.order.count({
        where: {
          ...where,
          ...dateWhere,
          status: 'openstaand',
        },
      }),

      // Processed today
      prisma.order.count({
        where: {
          ...where,
          status: 'verzonden',
          updatedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),

      prisma.order.findMany({
        where: {
          ...where,
          ...dateWhere,
        },
        select: { orderDate: true, orderValue: true },
        orderBy: { orderDate: 'asc' },
      }),

      // Orders by supplier (from order items)
      prisma.orderItem.groupBy({
        by: ['supplier'],
        where: {
          order: { ...where, ...dateWhere },
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const dateBuckets = makeDateBuckets(startDate, endDate);
    ordersByDate.forEach((order) => {
      const key = formatDateKey(new Date(order.orderDate));
      if (!dateBuckets.has(key)) dateBuckets.set(key, { date: key, revenue: 0, orders: 0 });
      const bucket = dateBuckets.get(key);
      bucket.revenue += Number(order.orderValue || 0);
      bucket.orders += 1;
    });
    const revenueData = Array.from(dateBuckets.values()).map((item) => ({
      ...item,
      label: new Date(item.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
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
      dateRange: {
        startDate: formatDateKey(startDate),
        endDate: formatDateKey(endDate),
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

export const getKlkAnalytics = async (req, res) => {
  try {
    const { installationId } = req.query;
    const where = await buildOrderWhere(req, installationId);
    const { startDate, endDate } = resolveDateRange(req.query);
    const orders = await prisma.order.findMany({
      where: { ...where, orderDate: { gte: startDate, lte: endDate } },
      select: {
        orderDate: true,
        orderValue: true,
        platform: true,
        storeName: true,
        fulfillmentType: true,
        itemCount: true,
        installation: { select: { name: true, type: true } },
      },
      orderBy: { orderDate: 'asc' },
    });

    const channels = {
      bol: emptyChannel(),
      kaufland: emptyChannel(),
      fleximedix: emptyChannel(),
      inandoutdoormatch: emptyChannel(),
      fulfilment: emptyChannel(),
    };
    const channelMaps = Object.fromEntries(Object.keys(channels).map((key) => [key, new Map()]));

    const addDaily = (channelKey, order) => {
      const key = formatDateKey(new Date(order.orderDate));
      const dailyMap = channelMaps[channelKey];
      if (!dailyMap.has(key)) {
        dailyMap.set(key, { date: key, omzet: 0, inkoopkosten: 0, cogs: 0, advertentiekosten: 0, orders: 0 });
      }
      const row = dailyMap.get(key);
      const revenue = Number(order.orderValue || 0);
      row.omzet += revenue;
      row.orders += 1;
      if (channelKey === 'bol' || channelKey === 'kaufland') {
        row.inkoopkosten += revenue * 0.6;
      } else if (channelKey === 'fleximedix' || channelKey === 'inandoutdoormatch') {
        row.cogs += revenue * 0.45;
        row.advertentiekosten += revenue * 0.08;
      }
    };

    orders.forEach((order) => {
      const channelKey = order.fulfillmentType === 'fulfillment'
        ? 'fulfilment'
        : normalizePlatformKey(order.platform, order.storeName);

      if (channelKey === 'bol' || channelKey === 'kaufland' || channelKey === 'fleximedix' || channelKey === 'inandoutdoormatch') {
        addDaily(channelKey, order);
      } else if (channelKey === 'shopify') {
        addDaily('inandoutdoormatch', order);
      } else if (order.fulfillmentType === 'fulfillment' || order.installation?.type === 'fulfilment') {
        addDaily('fulfilment', order);
      }
    });

    Object.keys(channels).forEach((key) => {
      channels[key].daily = Array.from(channelMaps[key].values()).sort((a, b) => a.date.localeCompare(b.date));
    });

    if (String(req.query.format || '').toLowerCase() === 'csv') {
      const rows = Object.entries(channels).flatMap(([channel, value]) =>
        value.daily.map((row) => ({ channel, ...row }))
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="klk-analytics-${formatDateKey(startDate)}-${formatDateKey(endDate)}.csv"`);
      return res.send(toCsv(rows));
    }

    res.json({ channels, dateRange: { startDate: formatDateKey(startDate), endDate: formatDateKey(endDate) } });
  } catch (error) {
    console.error('Get KLK analytics error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

export const getFulfillmentAnalytics = async (req, res) => {
  try {
    const { installationId } = req.query;
    const where = await buildOrderWhere(req, installationId);
    const { startDate, endDate } = resolveDateRange(req.query);
    const dateWhere = { orderDate: { gte: startDate, lte: endDate } };
    const fulfillmentWhere = {
      ...where,
      ...dateWhere,
      OR: [
        { fulfillmentType: 'fulfillment' },
        { installation: { is: { type: 'fulfilment' } } },
      ],
    };

    const orders = await prisma.order.findMany({
      where: fulfillmentWhere,
      select: {
        id: true,
        installationId: true,
        storeName: true,
        platform: true,
        orderDate: true,
        orderValue: true,
        installation: { select: { id: true, name: true, active: true } },
      },
      orderBy: { orderDate: 'asc' },
    });

    const clientMap = new Map();
    const monthlyMap = new Map();

    orders.forEach((order) => {
      const installation = order.installation || {};
      const clientId = Number(installation.id || order.installationId || 0);
      const clientName = installation.name || order.storeName || `Installatie ${clientId}`;
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          id: clientId,
          name: clientName,
          logo: '',
          ordersProcessed: 0,
          totalRevenue: 0,
          avgOrderValue: 0,
          trend: 0,
          stores: new Set(),
          status: installation.active === false ? 'inactive' : 'active',
        });
      }

      const client = clientMap.get(clientId);
      client.ordersProcessed += 1;
      client.totalRevenue += Number(order.orderValue || 0);
      client.stores.add(order.storeName || order.platform || 'Onbekend');

      const monthKey = new Date(order.orderDate).toLocaleDateString('nl-NL', { month: 'short' });
      if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, { month: monthKey, orders: 0, revenue: 0 });
      monthlyMap.get(monthKey).orders += 1;
      monthlyMap.get(monthKey).revenue += Number(order.orderValue || 0);
    });

    const clients = Array.from(clientMap.values()).map((client) => ({
      ...client,
      stores: Array.from(client.stores),
      totalRevenue: Number(client.totalRevenue.toFixed(2)),
      avgOrderValue: client.ordersProcessed > 0 ? Number((client.totalRevenue / client.ordersProcessed).toFixed(2)) : 0,
    }));

    const totalOrders = clients.reduce((sum, client) => sum + client.ordersProcessed, 0);
    const distributionColors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#0ea5e9'];
    const clientDistribution = clients.map((client, index) => ({
      name: client.name,
      value: client.ordersProcessed,
      color: distributionColors[index % distributionColors.length],
    }));

    if (String(req.query.format || '').toLowerCase() === 'csv') {
      const rows = clients.map((client) => ({
        klant: client.name,
        stores: client.stores.join(' | '),
        orders: client.ordersProcessed,
        omzet: client.totalRevenue,
        gemiddeldeOrderWaarde: client.avgOrderValue,
        status: client.status,
      }));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="fulfillment-analytics-${formatDateKey(startDate)}-${formatDateKey(endDate)}.csv"`);
      return res.send(toCsv(rows));
    }

    res.json({
      clients,
      monthlyData: Array.from(monthlyMap.values()),
      clientDistribution,
      totals: {
        totalOrders,
        totalRevenue: Number(clients.reduce((sum, client) => sum + client.totalRevenue, 0).toFixed(2)),
        activeClients: clients.filter((client) => client.status === 'active').length,
      },
      dateRange: { startDate: formatDateKey(startDate), endDate: formatDateKey(endDate) },
    });
  } catch (error) {
    console.error('Get fulfillment analytics error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

