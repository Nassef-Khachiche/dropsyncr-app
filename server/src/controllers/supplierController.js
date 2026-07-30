import prisma from '../config/database.js';

const assertInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: user.id, installationId: parseInt(installationId) },
  });
  return Boolean(hasAccess);
};

export const getSuppliers = async (req, res) => {
  try {
    const { installationId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const suppliers = await prisma.supplier.findMany({
      where: { installationId: parseInt(installationId) },
      orderBy: { name: 'asc' },
    });

    res.json(suppliers);
  } catch (error) {
    console.error('[SUPPLIER] Get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createSupplier = async (req, res) => {
  try {
    const { installationId, name, websiteUrl, active, loginUrl, loginUsername, loginPassword, loginNote } = req.body;

    if (!installationId || !String(name || '').trim()) {
      return res.status(400).json({ error: 'Installation ID en naam zijn verplicht' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const supplier = await prisma.supplier.create({
      data: {
        installationId: parseInt(installationId),
        name: String(name).trim(),
        websiteUrl: websiteUrl ? String(websiteUrl).trim() : null,
        active: active !== undefined ? Boolean(active) : true,
        loginUrl: loginUrl ? String(loginUrl).trim() : null,
        loginUsername: loginUsername ? String(loginUsername).trim() : null,
        loginPassword: loginPassword ? String(loginPassword) : null,
        loginNote: loginNote ? String(loginNote) : null,
      },
    });

    res.status(201).json(supplier);
  } catch (error) {
    console.error('[SUPPLIER] Create error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Er bestaat al een leverancier met deze naam' });
    }
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, websiteUrl, active, loginUrl, loginUsername, loginPassword, loginNote } = req.body;

    const existing = await prisma.supplier.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (websiteUrl !== undefined) data.websiteUrl = websiteUrl ? String(websiteUrl).trim() : null;
    if (active !== undefined) data.active = Boolean(active);
    if (loginUrl !== undefined) data.loginUrl = loginUrl ? String(loginUrl).trim() : null;
    if (loginUsername !== undefined) data.loginUsername = loginUsername ? String(loginUsername).trim() : null;
    if (loginPassword !== undefined) data.loginPassword = loginPassword ? String(loginPassword) : null;
    if (loginNote !== undefined) data.loginNote = loginNote ? String(loginNote) : null;

    const supplier = await prisma.supplier.update({
      where: { id: parseInt(id) },
      data,
    });

    res.json(supplier);
  } catch (error) {
    console.error('[SUPPLIER] Update error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Er bestaat al een leverancier met deze naam' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({ where: { id: parseInt(id) } });
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    if (!(await assertInstallationAccess(req.user, supplier.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const linkedCount = await prisma.purchaseOrder.count({ where: { supplierId: supplier.id } });
    if (linkedCount > 0) {
      return res.status(409).json({
        error: 'Deze leverancier is gekoppeld aan bestaande inkooporders',
        details: 'Zet de leverancier op inactief in plaats van verwijderen.',
        linkedCount,
      });
    }

    await prisma.supplier.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('[SUPPLIER] Delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};