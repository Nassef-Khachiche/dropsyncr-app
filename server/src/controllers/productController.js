import prisma from '../config/database.js';

export const getProducts = async (req, res) => {
  try {
    const { installationId, search, archived, bundled, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Verify access to installation
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

    const where = {
      installationId: parseInt(installationId),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { sku: { contains: search } },
          { ean: { contains: search } },
        ],
      }),
      ...(archived !== undefined && { archived: archived === 'true' }),
      ...(bundled !== undefined && { bundled: bundled === 'true' }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          locations: true,
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
      prisma.product.count({ where }),
    ]);

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findFirst({
      where: {
        id: parseInt(id),
      },
        include: {
          locations: true,
          installation: {
            select: {
              id: true,
              name: true,
            },
          },
        },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      installationId,
      sku,
      ean,
      name,
      image,
      brand,
      price,
      totalStock,
      availableStock,
      fulfillmentStock,
      internalRef,
      bundled,
      locations,
    } = req.body;

    // Verify access
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

    const product = await prisma.product.create({
      data: {
        installationId: parseInt(installationId),
        sku,
        ean,
        name,
        image,
        brand,
        price: parseFloat(price),
        totalStock: parseInt(totalStock) || 0,
        availableStock: parseInt(availableStock) || 0,
        fulfillmentStock: parseInt(fulfillmentStock) || 0,
        internalRef,
        bundled: bundled || false,
        locations: {
          create: locations?.map((loc) => ({
            location: loc.location,
            quantity: parseInt(loc.quantity) || 0,
          })) || [],
        },
      },
      include: {
        locations: true,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Product SKU already exists for this installation' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Handle locations separately if provided
    if (updateData.locations) {
      const locations = updateData.locations;
      delete updateData.locations;

      // Delete existing locations and create new ones
      await prisma.productLocation.deleteMany({
        where: { productId: parseInt(id) },
      });

      await prisma.product.update({
        where: { id: parseInt(id) },
        data: {
          ...updateData,
          locations: {
            create: locations.map((loc) => ({
              location: loc.location,
              quantity: parseInt(loc.quantity) || 0,
            })),
          },
        },
      });
    } else {
      // Convert numeric fields
      if (updateData.price) updateData.price = parseFloat(updateData.price);
      if (updateData.totalStock !== undefined) updateData.totalStock = parseInt(updateData.totalStock);
      if (updateData.availableStock !== undefined) updateData.availableStock = parseInt(updateData.availableStock);
      if (updateData.fulfillmentStock !== undefined) updateData.fulfillmentStock = parseInt(updateData.fulfillmentStock);
      if (updateData.salesPerMonth !== undefined) updateData.salesPerMonth = parseInt(updateData.salesPerMonth);

      await prisma.product.update({
        where: { id: parseInt(id) },
        data: updateData,
      });
    }

    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) },
      include: {
        locations: true,
      },
    });

    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.product.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const bulkUpdateStock = async (req, res) => {
  try {
    const { productIds, stockUpdates } = req.body;

    const updates = await Promise.all(
      productIds.map((id, index) =>
        prisma.product.update({
          where: { id: parseInt(id) },
          data: stockUpdates[index],
        })
      )
    );

    res.json({ updated: updates.length, products: updates });
  } catch (error) {
    console.error('Bulk update stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

