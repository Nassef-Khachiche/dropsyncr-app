import prisma from '../config/database.js';

/**
 * Vaste kosten: zelf aan te maken categorieën met daaronder de losse posten.
 * Bedragen zijn altijd per maand.
 */

const assertInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: user.id, installationId: parseInt(installationId, 10) },
  });
  return Boolean(hasAccess);
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const getFixedCosts = async (req, res) => {
  try {
    const { installationId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const groups = await prisma.fixedCostGroup.findMany({
      where: { installationId: parseInt(installationId, 10) },
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    const shaped = groups.map((group) => {
      const items = group.items.map((item) => ({
        id: item.id,
        name: item.name,
        amountPerMonth: round2(item.amountPerMonth),
      }));
      return {
        id: group.id,
        name: group.name,
        items,
        total: round2(items.reduce((sum, item) => sum + item.amountPerMonth, 0)),
      };
    });

    const totalPerMonth = round2(shaped.reduce((sum, group) => sum + group.total, 0));

    res.json({
      groups: shaped,
      totals: {
        perMonth: totalPerMonth,
        perYear: round2(totalPerMonth * 12),
        groupCount: shaped.length,
        itemCount: shaped.reduce((sum, group) => sum + group.items.length, 0),
      },
    });
  } catch (error) {
    console.error('[FIXED COST] List error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const createFixedCostGroup = async (req, res) => {
  try {
    const { installationId, name } = req.body;

    if (!installationId) return res.status(400).json({ error: 'Installation ID is required' });
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }
    if (!String(name || '').trim()) {
      return res.status(400).json({ error: 'Naam is verplicht' });
    }

    const installationIdNumber = parseInt(installationId, 10);
    const count = await prisma.fixedCostGroup.count({ where: { installationId: installationIdNumber } });

    const group = await prisma.fixedCostGroup.create({
      data: {
        installationId: installationIdNumber,
        name: String(name).trim(),
        sortOrder: count,
      },
    });

    res.json({ success: true, group });
  } catch (error) {
    console.error('[FIXED COST] Create group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const updateFixedCostGroup = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.fixedCostGroup.findUnique({ where: { id } });

    if (!existing) return res.status(404).json({ error: 'Categorie niet gevonden' });
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }
    if (!String(req.body?.name || '').trim()) {
      return res.status(400).json({ error: 'Naam is verplicht' });
    }

    const group = await prisma.fixedCostGroup.update({
      where: { id },
      data: { name: String(req.body.name).trim() },
    });

    res.json({ success: true, group });
  } catch (error) {
    console.error('[FIXED COST] Update group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const deleteFixedCostGroup = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.fixedCostGroup.findUnique({ where: { id } });

    if (!existing) return res.status(404).json({ error: 'Categorie niet gevonden' });
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    // De posten eronder gaan mee via de cascade in het schema.
    await prisma.fixedCostGroup.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[FIXED COST] Delete group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const createFixedCostItem = async (req, res) => {
  try {
    const { installationId, groupId, name, amountPerMonth } = req.body;

    if (!installationId) return res.status(400).json({ error: 'Installation ID is required' });
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Naam is verplicht' });

    const groupIdNumber = parseInt(groupId, 10);
    const group = await prisma.fixedCostGroup.findUnique({ where: { id: groupIdNumber } });
    if (!group || group.installationId !== parseInt(installationId, 10)) {
      return res.status(400).json({ error: 'Ongeldige categorie' });
    }

    const count = await prisma.fixedCostItem.count({ where: { groupId: groupIdNumber } });

    const item = await prisma.fixedCostItem.create({
      data: {
        installationId: parseInt(installationId, 10),
        groupId: groupIdNumber,
        name: String(name).trim(),
        amountPerMonth: round2(amountPerMonth),
        sortOrder: count,
      },
    });

    res.json({ success: true, item });
  } catch (error) {
    console.error('[FIXED COST] Create item error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const updateFixedCostItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.fixedCostItem.findUnique({ where: { id } });

    if (!existing) return res.status(404).json({ error: 'Post niet gevonden' });
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const data = {};
    if (req.body?.name != null) {
      if (!String(req.body.name).trim()) return res.status(400).json({ error: 'Naam is verplicht' });
      data.name = String(req.body.name).trim();
    }
    if (req.body?.amountPerMonth != null) {
      data.amountPerMonth = round2(req.body.amountPerMonth);
    }

    const item = await prisma.fixedCostItem.update({ where: { id }, data });
    res.json({ success: true, item });
  } catch (error) {
    console.error('[FIXED COST] Update item error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const deleteFixedCostItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.fixedCostItem.findUnique({ where: { id } });

    if (!existing) return res.status(404).json({ error: 'Post niet gevonden' });
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    await prisma.fixedCostItem.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[FIXED COST] Delete item error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/** Totaal aan vaste kosten per maand voor deze installatie. */
export const loadFixedCostPerMonth = async (installationId) => {
  const items = await prisma.fixedCostItem.findMany({
    where: { installationId: parseInt(installationId, 10) },
    select: { amountPerMonth: true },
  });
  return round2(items.reduce((sum, item) => sum + (Number(item.amountPerMonth) || 0), 0));
};

/**
 * Vaste kosten toegerekend aan een willekeurige periode.
 *
 * Loopt de maanden in de periode langs en neemt per maand het deel dat binnen
 * de periode valt — zo klopt het ook bij een halve maand of een reeks die over
 * een maandgrens loopt.
 */
export const allocateFixedCosts = async (installationId, from, to) => {
  const perMonth = await loadFixedCostPerMonth(installationId);
  if (perMonth <= 0) return 0;

  let allocated = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));

  while (cursor <= to) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const overlapStart = from > monthStart ? from : monthStart;
    const overlapEnd = to < monthEnd ? to : monthEnd;

    if (overlapEnd >= overlapStart) {
      const days = Math.round((overlapEnd - overlapStart) / (24 * 60 * 60 * 1000)) + 1;
      allocated += perMonth * (Math.min(days, daysInMonth) / daysInMonth);
    }

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return round2(allocated);
};