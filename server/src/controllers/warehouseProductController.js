import prisma from '../config/database.js';

// Bereken live voorraad + locaties voor een lijst van productIds
const enrichProductsWithStock = async (productIds, installationIds) => {
  if (productIds.length === 0) return {};

  const [inboundMutations, pickedMutations, adjustMutations, reservations, batches] = await Promise.all([
    prisma.stockMutation.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'inbound' },
      _sum: { quantity: true },
    }),
    prisma.stockMutation.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'picked' },
      _sum: { quantity: true },
    }),
    prisma.stockMutation.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, installationId: { in: installationIds }, type: 'adjust' },
      _sum: { quantity: true },
    }),
    prisma.stockReservation.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, installationId: { in: installationIds }, pickedAt: null, cancelled: false },
      _sum: { quantity: true },
    }),
    prisma.stockBatch.findMany({
      where: { productId: { in: productIds }, installationId: { in: installationIds } },
      select: { productId: true, locationId: true },
      distinct: ['productId', 'locationId'],
    }),
  ]);

  const locationIds = [...new Set(batches.map(b => b.locationId))];
  const locations = locationIds.length > 0
    ? await prisma.warehouseLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, code: true } })
    : [];
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l.code]));

  const result = {};
  for (const productId of productIds) {
    const inbound  = inboundMutations.find(m => m.productId === productId)?._sum?.quantity || 0;
    const picked   = pickedMutations.find(m => m.productId === productId)?._sum?.quantity || 0;
    const adjust   = adjustMutations.find(m => m.productId === productId)?._sum?.quantity || 0;
    const reserved = reservations.find(r => r.productId === productId)?._sum?.quantity || 0;
    const totaal   = inbound - picked + adjust;
    const productBatches = batches.filter(b => b.productId === productId);
    const locatieCodes = [...new Set(productBatches.map(b => locationMap[b.locationId]).filter(Boolean))];

    result[productId] = {
      totalStock: totaal,
      availableStock: Math.max(0, totaal - reserved),
      locations: locatieCodes,
    };
  }

  return result;
};

export const getProducts = async (req, res) => {
  try {
    const { installationId, search, status, page = 1, limit = 50 } = req.query;

    const parsedInstallationId = installationId ? parseInt(installationId, 10) : null;
    if (installationId && Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    let installationIds = [];
    if (req.user.isGlobalAdmin) {
      if (parsedInstallationId) {
        installationIds = [parsedInstallationId];
      } else {
        const allInstallations = await prisma.installation.findMany({ select: { id: true } });
        installationIds = allInstallations.map(i => i.id);
      }
    } else {
      if (!parsedInstallationId) {
        return res.status(400).json({ error: 'Installation ID is required' });
      }
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parsedInstallationId },
      });
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
      installationIds = [parsedInstallationId];
    }

    const where = {
      installationId: { in: installationIds },
      ...(status === 'active' && { archived: false }),
      ...(status === 'archived' && { archived: true }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { ean: { contains: search } },
          { brand: { contains: search } },
        ],
      }),
    };

    const parsedPage  = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit) || 50));

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          installation: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
      }),
      prisma.product.count({ where }),
    ]);

    const productIds = products.map(p => p.id);
    const stockMap = await enrichProductsWithStock(productIds, installationIds);

    const enrichedProducts = products.map(p => ({
      ...p,
      totalStock: stockMap[p.id]?.totalStock ?? 0,
      availableStock: stockMap[p.id]?.availableStock ?? 0,
      locations: (stockMap[p.id]?.locations || []).map(code => ({ location: code })),
    }));

    const statsGroups = await prisma.product.groupBy({
      by: ['archived'],
      where: { installationId: { in: installationIds } },
      _count: true,
    });

    const activeStats   = statsGroups.find(s => s.archived === false) || { _count: 0 };
    const archivedStats = statsGroups.find(s => s.archived === true)  || { _count: 0 };

    // Total value: purchasePrice × totalStock voor alle actieve producten met voorraad
    // We berekenen dit op basis van alle producten (niet alleen de huidige pagina)
    const allActiveProducts = await prisma.product.findMany({
      where: { installationId: { in: installationIds }, archived: false },
      select: { id: true, purchasePrice: true },
    });

    const allActiveIds = allActiveProducts.map(p => p.id);
    const allStockMap = allActiveIds.length > 0
      ? await enrichProductsWithStock(allActiveIds, installationIds)
      : {};

    const totalValue = allActiveProducts.reduce((sum, p) => {
      const stock = allStockMap[p.id]?.totalStock ?? 0;
      const price = p.purchasePrice ?? 0;
      return sum + (price * stock);
    }, 0);

    res.json({
      products: enrichedProducts,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(total / parsedLimit),
      },
      stats: {
        total: (activeStats._count || 0) + (archivedStats._count || 0),
        active: activeStats._count || 0,
        archived: archivedStats._count || 0,
        totalValue,
      },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      installationId, ean, name, brand, sizeCategory,
      price, purchasePrice, weight, dimensionL, dimensionW, dimensionH,
    } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const sku = `WH-${Date.now()}`;

    const product = await prisma.product.create({
      data: {
        installationId: parsedInstallationId,
        sku,
        ean: ean || null,
        name,
        brand: brand || null,
        sizeCategory: sizeCategory || null,
        price: parseFloat(price) || 0,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
        weight: weight ? parseFloat(weight) : null,
        dimensionL: dimensionL ? parseFloat(dimensionL) : null,
        dimensionW: dimensionW ? parseFloat(dimensionW) : null,
        dimensionH: dimensionH ? parseFloat(dimensionH) : null,
        archived: false,
      },
      include: {
        installation: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ ...product, totalStock: 0, availableStock: 0, locations: [] });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      ean, name, brand, sizeCategory,
      price, purchasePrice, archived,
      weight, dimensionL, dimensionW, dimensionH,
    } = req.body;

    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId)) return res.status(400).json({ error: 'Invalid product ID' });

    const updateData = {};
    if (ean !== undefined)           updateData.ean = ean;
    if (name !== undefined)          updateData.name = name;
    if (brand !== undefined)         updateData.brand = brand;
    if (sizeCategory !== undefined)  updateData.sizeCategory = sizeCategory;
    if (price !== undefined)         updateData.price = parseFloat(price);
    if (purchasePrice !== undefined) updateData.purchasePrice = purchasePrice ? parseFloat(purchasePrice) : null;
    if (archived !== undefined)      updateData.archived = archived;
    if (weight !== undefined)        updateData.weight = weight ? parseFloat(weight) : null;
    if (dimensionL !== undefined)    updateData.dimensionL = dimensionL ? parseFloat(dimensionL) : null;
    if (dimensionW !== undefined)    updateData.dimensionW = dimensionW ? parseFloat(dimensionW) : null;
    if (dimensionH !== undefined)    updateData.dimensionH = dimensionH ? parseFloat(dimensionH) : null;

    const product = await prisma.product.update({
      where: { id: parsedId },
      data: updateData,
      include: {
        installation: { select: { id: true, name: true } },
      },
    });

    const stockMap = await enrichProductsWithStock([parsedId], [product.installationId]);

    res.json({
      ...product,
      totalStock: stockMap[parsedId]?.totalStock ?? 0,
      availableStock: stockMap[parsedId]?.availableStock ?? 0,
      locations: (stockMap[parsedId]?.locations || []).map(code => ({ location: code })),
    });
  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Product not found' });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId)) return res.status(400).json({ error: 'Invalid product ID' });

    await prisma.product.delete({ where: { id: parsedId } });
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Product not found' });
    res.status(500).json({ error: 'Internal server error' });
  }
};