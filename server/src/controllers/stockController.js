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

// Bereken voorraad per product per installatie (klant)
const calculateStockPerProductPerInstallation = async (productIds, installationIds) => {
  if (productIds.length === 0) return {};

  const inboundMutations = await prisma.stockMutation.groupBy({
    by: ['productId', 'installationId'],
    where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'inbound' },
    _sum: { quantity: true },
  });

  const pickedMutations = await prisma.stockMutation.groupBy({
    by: ['productId', 'installationId'],
    where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'picked' },
    _sum: { quantity: true },
  });

  const adjustMutations = await prisma.stockMutation.groupBy({
    by: ['productId', 'installationId'],
    where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'adjust' },
    _sum: { quantity: true },
  });

  const reservations = await prisma.stockReservation.groupBy({
    by: ['productId', 'installationId'],
    where: { productId: { in: productIds }, installationId: { in: installationIds }, pickedAt: null, cancelled: false },
    _sum: { quantity: true },
  });

  // result[productId][installationId] = { totaal, gereserveerd, beschikbaar }
  const result = {};

  const getOrCreate = (productId, installationId) => {
    if (!result[productId]) result[productId] = {};
    if (!result[productId][installationId]) {
      result[productId][installationId] = { totaal: 0, gereserveerd: 0, beschikbaar: 0 };
    }
    return result[productId][installationId];
  };

  for (const m of inboundMutations) {
    getOrCreate(m.productId, m.installationId).totaal += m._sum.quantity || 0;
  }
  for (const m of pickedMutations) {
    getOrCreate(m.productId, m.installationId).totaal -= m._sum.quantity || 0;
  }
  for (const m of adjustMutations) {
    getOrCreate(m.productId, m.installationId).totaal += m._sum.quantity || 0;
  }
  for (const r of reservations) {
    getOrCreate(r.productId, r.installationId).gereserveerd += r._sum.quantity || 0;
  }

  // Bereken beschikbaar
  for (const productId of Object.keys(result)) {
    for (const installationId of Object.keys(result[productId])) {
      const entry = result[productId][installationId];
      entry.beschikbaar = Math.max(0, entry.totaal - entry.gereserveerd);
    }
  }

  return result;
};

// Blijft beschikbaar voor andere functies die het nog gebruiken (reserve, pick etc.)
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

    // Voor global admins: haal batches op van ALLE installaties, niet alleen activeProfile
    const allInstallations = req.user.isGlobalAdmin
      ? await prisma.installation.findMany({ select: { id: true } }).then(r => r.map(i => i.id))
      : installationIds;

    // Haal alle batches op voor deze installaties
    const allBatches = await prisma.stockBatch.findMany({
      where: { installationId: { in: allInstallations } },
      select: { productId: true, locationId: true, installationId: true },
    });

    if (allBatches.length === 0) {
      return res.json({ items: [], stats: { total: 0, totalAvailable: 0, totalReserved: 0 } });
    }

    const productIdList = [...new Set(allBatches.map(b => b.productId))];

    // Haal producten op — geen installationId filter hier want product kan aan andere installatie hangen
    const productWhere = {
      id: { in: productIdList },
      archived: false,
      ...(search && {
        OR: [
          { name: { contains: search } },
          { ean: { contains: search } },
          { brand: { contains: search } },
        ],
      }),
    };

    const products = await prisma.product.findMany({
      where: productWhere,
      include: {
        installation: { select: { id: true, name: true } },
      },
      orderBy: sort === 'naam-asc' ? { name: 'asc' }
        : sort === 'naam-desc' ? { name: 'desc' }
        : { createdAt: 'desc' },
    });

    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // Haal locatie namen op
    const locationIds = [...new Set(allBatches.map(b => b.locationId))];
    const locations = await prisma.warehouseLocation.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, code: true },
    });
    const locationMap = Object.fromEntries(locations.map(l => [l.id, l.code]));

    // Haal installatie namen op voor batch installaties
    const batchInstallationIds = [...new Set(allBatches.map(b => b.installationId))];
    const batchInstallations = await prisma.installation.findMany({
      where: { id: { in: batchInstallationIds } },
      select: { id: true, name: true },
    });
    const installationMap = Object.fromEntries(batchInstallations.map(i => [i.id, i.name]));

    // Bereken voorraad per product per installatie
    const stockPerProductPerInstallation = await calculateStockPerProductPerInstallation(
      productIdList,
      allInstallations,
    );

    // Groepeer batches per product per installatie
    const groupMap = {}; // key: `${productId}_${installationId}`
    for (const batch of allBatches) {
      const product = productMap[batch.productId];
      if (!product) continue;

      // Filter op search (al gedaan in productWhere maar dubbele check voor veiligheid)
      const key = `${batch.productId}_${batch.installationId}`;
      if (!groupMap[key]) {
        groupMap[key] = {
          productId: batch.productId,
          batchInstallationId: batch.installationId,
          locationIds: new Set(),
        };
      }
      groupMap[key].locationIds.add(batch.locationId);
    }

    let items = Object.values(groupMap).map(group => {
      const product = productMap[group.productId];
      if (!product) return null;

      const stockForThisInstallation = stockPerProductPerInstallation[group.productId]?.[group.batchInstallationId] || {
        totaal: 0,
        gereserveerd: 0,
        beschikbaar: 0,
      };

      const locatieCodes = [...group.locationIds]
        .map(lid => locationMap[lid])
        .filter(Boolean);

      const klantNaam = installationMap[group.batchInstallationId] || `Installatie ${group.batchInstallationId}`;

      return {
        id: product.id,
        installationId: group.batchInstallationId, // klant installatie van de batch
        foto: product.image,
        artikel_naam: product.name,
        ean: product.ean || '',
        brand: product.brand,
        sizeCategory: product.sizeCategory,
        locaties: locatieCodes,
        klant: klantNaam,
        aangemeld: 0,
        in_behandeling: 0,
        gereserveerd: stockForThisInstallation.gereserveerd,
        beschikbaar: stockForThisInstallation.beschikbaar,
        totaal: stockForThisInstallation.totaal,
      };
    }).filter(Boolean);

    // Filter items zonder voorraad eruit (totaal === 0)
    items = items.filter(i => i.totaal > 0 || i.gereserveerd > 0);

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
    const { installationId, warehouseInstallationId, productId, locationId, quantity, reference, notes, receivedAt } = req.body;
    const batchInstallationId = warehouseInstallationId || installationId;

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

    const parsedWarehouseInstallationId = parseInt(batchInstallationId, 10);

    const batch = await prisma.stockBatch.create({
      data: {
        installationId: parsedWarehouseInstallationId,
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
        installationId: parsedWarehouseInstallationId,
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

// ─── PUT /api/stock/batch/:batchId/location ──────────────────────────────────

export const moveBatchLocation = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { newLocationId, notes } = req.body;

    const parsedBatchId = parseInt(batchId, 10);
    const parsedNewLocationId = parseInt(newLocationId, 10);

    if (Number.isNaN(parsedBatchId)) return res.status(400).json({ error: 'Invalid batch ID' });
    if (Number.isNaN(parsedNewLocationId)) return res.status(400).json({ error: 'Invalid location ID' });

    const batch = await prisma.stockBatch.findUnique({ where: { id: parsedBatchId } });
    if (!batch) return res.status(404).json({ error: 'Batch niet gevonden' });

    const installationIds = await getInstallationIds(req, batch.installationId);
    if (!installationIds) return res.status(403).json({ error: 'Access denied' });

    // Doel-locatie moet bestaan en bij dezelfde installatie horen
    const targetLocation = await prisma.warehouseLocation.findFirst({
      where: { id: parsedNewLocationId, installationId: batch.installationId },
    });
    if (!targetLocation) return res.status(404).json({ error: 'Doel-locatie niet gevonden' });

    // Oude locatiecode voor de log
    const oldLocation = batch.locationId
      ? await prisma.warehouseLocation.findUnique({ where: { id: batch.locationId }, select: { code: true } })
      : null;
    const oldCode = oldLocation?.code || 'onbekend';

    // Verplaats de batch
    await prisma.stockBatch.update({
      where: { id: parsedBatchId },
      data: { locationId: parsedNewLocationId },
    });

    // Log als move-mutatie (voorraad-neutraal, quantity 0)
    await prisma.stockMutation.create({
      data: {
        installationId: batch.installationId,
        productId: batch.productId,
        batchId: parsedBatchId,
        type: 'move',
        quantity: 0,
        locationId: parsedNewLocationId,
        performedBy: req.user.id,
        notes: `Locatie gewijzigd: ${oldCode} → ${targetLocation.code}${notes ? ` (${notes})` : ''}`,
      },
    });

    res.json({ message: 'Locatie gewijzigd', batchId: parsedBatchId, newLocationId: parsedNewLocationId });
  } catch (error) {
    console.error('Move batch location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── GET /api/stock/mutations ─────────────────────────────────────────────────

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