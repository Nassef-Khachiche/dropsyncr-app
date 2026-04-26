import prisma from '../config/database.js';

export const getWarehouseAddress = async (req, res) => {
  try {
    const { installationId } = req.query;

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parsedInstallationId },
      });
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
    }

    const address = await prisma.warehouseAddress.findUnique({
      where: { installationId: parsedInstallationId },
    });

    res.json(address || null);
  } catch (error) {
    console.error('Get warehouse address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const upsertWarehouseAddress = async (req, res) => {
  try {
    const { installationId, name, email, phone, street, houseNumber, postalCode, city, country } = req.body;

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installation ID' });
    }

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parsedInstallationId },
      });
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });
    }

    const address = await prisma.warehouseAddress.upsert({
      where: { installationId: parsedInstallationId },
      update: {
        name: name || null,
        email: email || null,
        phone: phone || null,
        street: street || null,
        houseNumber: houseNumber || null,
        postalCode: postalCode || null,
        city: city || null,
        country: country || 'NL',
      },
      create: {
        installationId: parsedInstallationId,
        name: name || null,
        email: email || null,
        phone: phone || null,
        street: street || null,
        houseNumber: houseNumber || null,
        postalCode: postalCode || null,
        city: city || null,
        country: country || 'NL',
      },
    });

    res.json(address);
  } catch (error) {
    console.error('Upsert warehouse address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};