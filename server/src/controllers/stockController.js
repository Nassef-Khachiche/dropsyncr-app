import prisma from '../config/database.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const getInstallationIds = async (req, parsedInstallationId) => {
  if (req.user.isGlobalAdmin) {
    if (parsedInstallationId) return [parsedInstallationId];
    const all = await prisma.installation.findMany({ select: { id: true } });
    return all.map(i => i.id);
  }
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: req.user.id, installationId: parsedInstallationId },
  });
  if (!hasAccess) return null;
  return [parsedInstallationId];
};

const calculateStockForProducts = async (productIds, installationIds) => {
  if (productIds.length === 0) return {};

  const inboundMutations = await prisma.stockMutation.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'inbound' },
    _sum: { quantity: true },
  });

  const pickedMutations = await prisma.stockMutation.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'picked' },
    _sum: { quantity: true },
  });

  const adjustMutations = await prisma.stockMutation.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'adjust' },
    _sum: { quantity: true },
  });

  const reservations = await prisma.stockReservation.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, installationId: { in: installationIds }, pickedAt: null, cancelled: false },
    _sum: { quantity: true },
  });

  const result = {};
  for (const productId of productIds) {
    const inbound = inboundMutations.find(m => m.productId === productId)?._sum?.quantity || 0;
    const picked = pickedMutations.find(m => m.productId === productId)?._sum?.quantity || 0;
    const adjust = adjustMutations.find(m => m.productId === productId)?._sum?.quantity || 0;
    const reserved = reservations.find(r => r.productId === productId)?._sum?.quantity || 0;

    const totaal = inbound - picked + adjust;
    const beschikbaar = totaal - reserved;

    result[productId] = {
      totaal,
      gereserveerd: reserved,
      beschikbaar: Math.max(0, beschikbaar),
    };
  }

  return result;
};

// ─── GET /api/stock ──────────────────────────────────────────────────────────

export const getInventory = async (req, res) => {
  try {
    const { installationId, search, status, sort } = req.query;

    const parsedInstallationId = installationId ? parseInt(installationId, 10) : null;
    if (parsedInstallationId && Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    const installationIds = await getInstallationIds(req, parsedInstallationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    const productWhere = {
      installationId: { in: installationIds },
      archived: false,
      ...(search && {
        OR: [
          { name: { contains: search } },
          { ean: { contains: search } },
          { brand: { contains: search } },
        ],
      }),
    };

    const productIds = await prisma.stockBatch.findMany({
      where: { installationId: { in: installationIds } },
      select: { productId: true },
      distinct: ['productId'],
    });
    const productIdList = productIds.map(p => p.productId);

    if (productIdList.length > 0) {
      productWhere.id = { in: productIdList };
    } else {
      return res.json({ items: [], stats: { total: 0, totalAvailable: 0, totalReserved: 0 } });
    }

    const products = await prisma.product.findMany({
      where: productWhere,
      include: {
        locations: true,
        installation: { select: { id: true, name: true } },
      },
      orderBy: sort === 'naam-asc' ? { name: 'asc' }
        : sort === 'naam-desc' ? { name: 'desc' }
        : { createdAt: 'desc' },
    });

    const stockMap = await calculateStockForProducts(products.map(p => p.id), installationIds);

    const batches = await prisma.stockBatch.findMany({
      where: { productId: { in: products.map(p => p.id) }, installationId: { in: installationIds } },
      select: { productId: true, locationId: true },
      distinct: ['productId', 'locationId'],
    });

    const locationIds = [...new Set(batches.map(b => b.locationId))];
    const locations = await prisma.warehouseLocation.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, code: true },
    });
    const locationMap = Object.fromEntries(locations.map(l => [l.id, l.code]));

    let items = products.map(product => {
      const stock = stockMap[product.id] || { totaal: 0, gereserveerd: 0, beschikbaar: 0 };
      const productBatches = batches.filter(b => b.productId === product.id);
      const locatieCodes = [...new Set(productBatches.map(b => locationMap[b.locationId]).filter(Boolean))];

      return {
        id: product.id,
        installationId: product.installationId,
        foto: product.image,
        artikel_naam: product.name,
        ean: product.ean || '',
        brand: product.brand,
        sizeCategory: product.sizeCategory,
        locaties: locatieCodes,
        klant: product.installation?.name || '',
        aangemeld: 0,
        in_behandeling: 0,
        gereserveerd: stock.gereserveerd,
        beschikbaar: stock.beschikbaar,
        totaal: stock.totaal,
      };
    });

    if (status === 'gereserveerd') items = items.filter(i => i.gereserveerd > 0);
    if (status === 'laag-voorraad') items = items.filter(i => i.beschikbaar <= 5 && i.beschikbaar >= 0);
    if (sort === 'voorraad-laag') items.sort((a, b) => a.beschikbaar - b.beschikbaar);
    if (sort === 'voorraad-hoog') items.sort((a, b) => b.beschikbaar - a.beschikbaar);

    const stats = {
      total: items.length,
      totalAvailable: items.reduce((sum, i) => sum + i.beschikbaar, 0),
      totalReserved: items.reduce((sum, i) => sum + i.gereserveerd, 0),
    };

    res.json({ items, stats });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/stock/inbound ─────────────────────────────────────────────────

export const inboundStock = async (req, res) => {
  try {
    const { installationId, productId, locationId, quantity, reference, notes, receivedAt } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    const parsedProductId = parseInt(productId, 10);
    const parsedLocationId = parseInt(locationId, 10);
    const parsedQuantity = parseInt(quantity, 10);

    if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });
    if (Number.isNaN(parsedProductId)) return res.status(400).json({ error: 'Invalid product ID' });
    if (Number.isNaN(parsedLocationId)) return res.status(400).json({ error: 'Invalid location ID' });
    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) return res.status(400).json({ error: 'Invalid quantity' });

    const installationIds = await getInstallationIds(req, parsedInstallationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    const batch = await prisma.stockBatch.create({
      data: {
        installationId: parsedInstallationId,
        productId: parsedProductId,
        locationId: parsedLocationId,
        quantity: parsedQuantity,
        receivedBy: req.user.id,
        reference: reference || null,
        notes: notes || null,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      },
    });

    await prisma.stockMutation.create({
      data: {
        installationId: parsedInstallationId,
        productId: parsedProductId,
        batchId: batch.id,
        type: 'inbound',
        quantity: parsedQuantity,
        locationId: parsedLocationId,
        performedBy: req.user.id,
        notes: notes || null,
      },
    });

    res.status(201).json({ batch, message: 'Stock inbound registered successfully' });
  } catch (error) {
    console.error('Inbound stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/stock/reserve ─────────────────────────────────────────────────

export const reserveStock = async (req, res) => {
  try {
    const { installationId, productId, orderId, quantity } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    const parsedProductId = parseInt(productId, 10);
    const parsedOrderId = parseInt(orderId, 10);
    const parsedQuantity = parseInt(quantity, 10);

    if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });
    if (Number.isNaN(parsedProductId)) return res.status(400).json({ error: 'Invalid product ID' });
    if (Number.isNaN(parsedOrderId)) return res.status(400).json({ error: 'Invalid order ID' });
    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) return res.status(400).json({ error: 'Invalid quantity' });

    const stockMap = await calculateStockForProducts([parsedProductId], [parsedInstallationId]);
    const stock = stockMap[parsedProductId];

    if (!stock || stock.beschikbaar < parsedQuantity) {
      return res.status(409).json({
        error: 'Insufficient stock',
        available: stock?.beschikbaar || 0,
        requested: parsedQuantity,
      });
    }

    const reservation = await prisma.stockReservation.create({
      data: {
        installationId: parsedInstallationId,
        productId: parsedProductId,
        orderId: parsedOrderId,
        quantity: parsedQuantity,
        reservedBy: req.user?.id || 0,
      },
    });

    await prisma.stockMutation.create({
      data: {
        installationId: parsedInstallationId,
        productId: parsedProductId,
        type: 'reserved',
        quantity: parsedQuantity,
        orderId: parsedOrderId,
        performedBy: req.user?.id || 0,
        notes: `Gereserveerd voor order ${parsedOrderId}`,
      },
    });

    res.status(201).json({ reservation, message: 'Stock reserved successfully' });
  } catch (error) {
    console.error('Reserve stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/stock/pick ────────────────────────────────────────────────────

export const pickStock = async (req, res) => {
  try {
    const { reservationId, notes } = req.body;

    const parsedReservationId = parseInt(reservationId, 10);
    if (Number.isNaN(parsedReservationId)) return res.status(400).json({ error: 'Invalid reservation ID' });

    const reservation = await prisma.stockReservation.findUnique({ where: { id: parsedReservationId } });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
    if (reservation.pickedAt) return res.status(409).json({ error: 'Already picked' });
    if (reservation.cancelled) return res.status(409).json({ error: 'Reservation is cancelled' });

    const updated = await prisma.stockReservation.update({
      where: { id: parsedReservationId },
      data: { pickedAt: new Date(), pickedBy: req.user.id },
    });

    await prisma.stockMutation.create({
      data: {
        installationId: reservation.installationId,
        productId: reservation.productId,
        type: 'picked',
        quantity: reservation.quantity,
        orderId: reservation.orderId,
        performedBy: req.user.id,
        notes: notes || `Gepickt voor order ${reservation.orderId}`,
      },
    });

    res.json({ reservation: updated, message: 'Stock picked successfully' });
  } catch (error) {
    console.error('Pick stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/stock/adjust ──────────────────────────────────────────────────

export const adjustStock = async (req, res) => {
  try {
    const { installationId, productId, locationId, quantity, notes } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    const parsedProductId = parseInt(productId, 10);
    const parsedQuantity = parseInt(quantity, 10);

    if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });
    if (Number.isNaN(parsedProductId)) return res.status(400).json({ error: 'Invalid product ID' });
    if (Number.isNaN(parsedQuantity)) return res.status(400).json({ error: 'Invalid quantity' });
    if (!notes) return res.status(400).json({ error: 'Notes are required for adjustments' });

    const installationIds = await getInstallationIds(req, parsedInstallationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    const mutation = await prisma.stockMutation.create({
      data: {
        installationId: parsedInstallationId,
        productId: parsedProductId,
        type: 'adjust',
        quantity: parsedQuantity,
        locationId: locationId ? parseInt(locationId, 10) : null,
        performedBy: req.user.id,
        notes,
      },
    });

    res.status(201).json({ mutation, message: 'Stock adjusted successfully' });
  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /api/stock/mutations ─────────────────────────────────────────────────
// Alle mutaties gefilterd op datum periode (globale historie)

export const getAllMutations = async (req, res) => {
  try {
    const { installationId, period } = req.query;

    const parsedInstallationId = installationId ? parseInt(installationId, 10) : null;
    if (parsedInstallationId && Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    const installationIds = await getInstallationIds(req, parsedInstallationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    const now = new Date();
    const fromDate = new Date();

    if (period === 'today') {
      fromDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      fromDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      fromDate.setDate(now.getDate() - 30);
    } else {
      fromDate.setHours(0, 0, 0, 0);
    }

    const mutations = await prisma.stockMutation.findMany({
      where: {
        installationId: { in: installationIds },
        performedAt: { gte: fromDate },
      },
      orderBy: { performedAt: 'desc' },
      take: 500,
    });

    // Haal producten apart op — StockMutation heeft geen directe relatie met Product
    const productIds = [...new Set(mutations.map(m => m.productId).filter(Boolean))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, ean: true },
    });
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    const userIds = [...new Set(mutations.map(m => m.performedBy).filter(Boolean))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const enriched = mutations.map(m => ({
      ...m,
      productName: productMap[m.productId]?.name || 'Onbekend',
      ean: productMap[m.productId]?.ean || '',
      performedByName: userMap[m.performedBy] || (m.performedBy === 0 ? 'Systeem' : 'Onbekend'),
    }));

    res.json({ mutations: enriched });
  } catch (error) {
    console.error('Get all mutations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /api/stock/:productId/mutations ─────────────────────────────────────

export const getProductMutations = async (req, res) => {
  try {
    const { productId } = req.params;
    const { installationId } = req.query;

    const parsedProductId = parseInt(productId, 10);
    const parsedInstallationId = parseInt(installationId, 10);

    if (Number.isNaN(parsedProductId)) return res.status(400).json({ error: 'Invalid product ID' });
    if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });

    const installationIds = await getInstallationIds(req, parsedInstallationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    const mutations = await prisma.stockMutation.findMany({
      where: {
        productId: parsedProductId,
        installationId: { in: installationIds },
      },
      orderBy: { performedAt: 'desc' },
      take: 100,
    });

    const userIds = [...new Set(mutations.map(m => m.performedBy).filter(Boolean))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const enriched = mutations.map(m => ({
      ...m,
      performedByName: userMap[m.performedBy] || (m.performedBy === 0 ? 'Systeem' : 'Onbekend'),
    }));

    res.json({ mutations: enriched });
  } catch (error) {
    console.error('Get mutations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /api/stock/:productId/batches ───────────────────────────────────────

export const getProductBatches = async (req, res) => {
  try {
    const { productId } = req.params;
    const { installationId } = req.query;

    const parsedProductId = parseInt(productId, 10);
    const parsedInstallationId = parseInt(installationId, 10);

    if (Number.isNaN(parsedProductId)) return res.status(400).json({ error: 'Invalid product ID' });
    if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });

    const installationIds = await getInstallationIds(req, parsedInstallationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    const batches = await prisma.stockBatch.findMany({
      where: {
        productId: parsedProductId,
        installationId: { in: installationIds },
      },
      orderBy: { receivedAt: 'asc' },
    });

    const now = new Date();
    const FREE_DAYS = 56;

    const enriched = batches.map(batch => {
      const daysStored = Math.floor((now - new Date(batch.receivedAt)) / (1000 * 60 * 60 * 24));
      const billableDays = Math.max(0, daysStored - FREE_DAYS);
      const isFree = billableDays === 0;
      return { ...batch, daysStored, billableDays, isFree };
    });

    const userIds = [...new Set(batches.map(b => b.receivedBy).filter(Boolean))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const withUsers = enriched.map(b => ({
      ...b,
      receivedByName: userMap[b.receivedBy] || 'Onbekend',
    }));

    res.json({ batches: withUsers });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── DELETE /api/stock/reserve/:id/cancel ────────────────────────────────────

export const cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId)) return res.status(400).json({ error: 'Invalid reservation ID' });

    const reservation = await prisma.stockReservation.findUnique({ where: { id: parsedId } });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
    if (reservation.cancelled) return res.status(409).json({ error: 'Already cancelled' });
    if (reservation.pickedAt) return res.status(409).json({ error: 'Already picked, cannot cancel' });

    const updated = await prisma.stockReservation.update({
      where: { id: parsedId },
      data: { cancelled: true, cancelledAt: new Date() },
    });

    await prisma.stockMutation.create({
      data: {
        installationId: reservation.installationId,
        productId: reservation.productId,
        type: 'adjust',
        quantity: reservation.quantity,
        orderId: reservation.orderId,
        performedBy: req.user?.id || 0,
        notes: `Reservering geannuleerd voor order ${reservation.orderId}`,
      },
    });

    res.json({ reservation: updated, message: 'Reservation cancelled successfully' });
  } catch (error) {
    console.error('Cancel reservation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /api/stock/:productId/ean-aliases ────────────────────────────────────

export const getEanAliases = async (req, res) => {
  try {
    const { productId } = req.params;
    const { installationId } = req.query;

    const parsedProductId = parseInt(productId, 10);
    const parsedInstallationId = parseInt(installationId, 10);

    if (Number.isNaN(parsedProductId)) return res.status(400).json({ error: 'Invalid product ID' });
    if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });

    const installationIds = await getInstallationIds(req, parsedInstallationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    const aliases = await prisma.productEanAlias.findMany({
      where: { productId: parsedProductId, installationId: { in: installationIds } },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ aliases });
  } catch (error) {
    console.error('Get EAN aliases error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── POST /api/stock/:productId/ean-aliases ───────────────────────────────────

export const addEanAlias = async (req, res) => {
  try {
    const { productId } = req.params;
    const { ean, installationId } = req.body;

    const parsedProductId = parseInt(productId, 10);
    const parsedInstallationId = parseInt(installationId, 10);

    if (Number.isNaN(parsedProductId)) return res.status(400).json({ error: 'Invalid product ID' });
    if (Number.isNaN(parsedInstallationId)) return res.status(400).json({ error: 'Invalid installation ID' });
    if (!ean || !String(ean).trim()) return res.status(400).json({ error: 'EAN is required' });

    const installationIds = await getInstallationIds(req, parsedInstallationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    const normalizedEan = String(ean).trim();

    // Check of EAN al bestaat als alias
    const existingAlias = await prisma.productEanAlias.findFirst({
      where: { ean: normalizedEan, installationId: parsedInstallationId },
    });
    if (existingAlias) {
      return res.status(409).json({ error: 'Deze EAN is al gekoppeld als alias' });
    }

    const alias = await prisma.productEanAlias.create({
      data: {
        productId: parsedProductId,
        ean: normalizedEan,
        installationId: parsedInstallationId,
      },
    });

    res.status(201).json({ alias });
  } catch (error) {
    console.error('Add EAN alias error:', error);
    if (error.code === 'P2002') return res.status(409).json({ error: 'Deze EAN is al gekoppeld' });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── DELETE /api/stock/:productId/ean-aliases/:aliasId ───────────────────────

export const deleteEanAlias = async (req, res) => {
  try {
    const { productId, aliasId } = req.params;

    const parsedProductId = parseInt(productId, 10);
    const parsedAliasId = parseInt(aliasId, 10);

    if (Number.isNaN(parsedProductId)) return res.status(400).json({ error: 'Invalid product ID' });
    if (Number.isNaN(parsedAliasId)) return res.status(400).json({ error: 'Invalid alias ID' });

    const alias = await prisma.productEanAlias.findUnique({ where: { id: parsedAliasId } });
    if (!alias) return res.status(404).json({ error: 'Alias not found' });
    if (alias.productId !== parsedProductId) return res.status(403).json({ error: 'Access denied' });

    await prisma.productEanAlias.delete({ where: { id: parsedAliasId } });

    res.json({ message: 'EAN alias verwijderd' });
  } catch (error) {
    console.error('Delete EAN alias error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};