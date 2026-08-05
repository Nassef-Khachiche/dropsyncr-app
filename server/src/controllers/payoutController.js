import prisma from '../config/database.js';

/**
 * Uitbetalingen van marketplaces. Volledig handmatig ingevoerd — er is geen
 * koppeling die deze bedragen aanlevert.
 */

const assertInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: user.id, installationId: parseInt(installationId, 10) },
  });
  return Boolean(hasAccess);
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const parseDay = (value) => {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDay = (date) => date.toISOString().slice(0, 10);

export const getPayouts = async (req, res) => {
  try {
    const { installationId, from, to, stores = '' } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const installationIdNumber = parseInt(installationId, 10);
    const storeList = String(stores).split(',').map((entry) => entry.trim()).filter(Boolean);

    const fromDate = parseDay(from);
    const toDate = parseDay(to);

    const payouts = await prisma.payout.findMany({
      where: {
        installationId: installationIdNumber,
        ...(fromDate && toDate ? { payoutDate: { gte: fromDate, lte: toDate } } : {}),
        ...(storeList.length > 0 ? { storeName: { in: storeList } } : {}),
      },
      orderBy: { payoutDate: 'desc' },
    });

    const rows = payouts.map((payout) => ({
      id: payout.id,
      payoutDate: toIsoDay(payout.payoutDate),
      periodFrom: toIsoDay(payout.periodFrom),
      periodTo: toIsoDay(payout.periodTo),
      amount: round2(payout.amount),
      storeName: payout.storeName,
      note: payout.note,
    }));

    const total = round2(rows.reduce((sum, row) => sum + row.amount, 0));

    // Per store, zodat je ziet welk kanaal wat uitkeert.
    const storeMap = new Map();
    for (const row of rows) {
      const key = row.storeName || '-';
      storeMap.set(key, round2((storeMap.get(key) || 0) + row.amount));
    }

    res.json({
      payouts: rows,
      totals: {
        amount: total,
        count: rows.length,
        average: rows.length > 0 ? round2(total / rows.length) : 0,
        last: rows[0] || null,
      },
      byStore: Array.from(storeMap.entries())
        .map(([storeName, amount]) => ({ storeName, amount }))
        .sort((a, b) => b.amount - a.amount),
    });
  } catch (error) {
    console.error('[PAYOUT] List error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

const validatePayload = (body) => {
  const payoutDate = parseDay(body?.payoutDate);
  const periodFrom = parseDay(body?.periodFrom);
  const periodTo = parseDay(body?.periodTo);
  const amount = round2(body?.amount);

  if (!payoutDate) return { error: 'Uitbetaaldatum is verplicht' };
  if (!periodFrom || !periodTo) return { error: 'Periode van en t/m zijn verplicht' };
  if (periodTo < periodFrom) return { error: 'Periode t/m ligt voor periode van' };
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Bedrag moet groter zijn dan 0' };

  return {
    data: {
      payoutDate,
      periodFrom,
      periodTo,
      amount,
      storeName: String(body?.storeName || '').trim() || null,
      note: String(body?.note || '').trim() || null,
    },
  };
};

export const createPayout = async (req, res) => {
  try {
    const { installationId } = req.body;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const parsed = validatePayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const payout = await prisma.payout.create({
      data: {
        ...parsed.data,
        installationId: parseInt(installationId, 10),
        createdById: req.user.id,
      },
    });

    res.json({ success: true, payout });
  } catch (error) {
    console.error('[PAYOUT] Create error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const updatePayout = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.payout.findUnique({ where: { id } });

    if (!existing) return res.status(404).json({ error: 'Uitbetaling niet gevonden' });
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const parsed = validatePayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const payout = await prisma.payout.update({ where: { id }, data: parsed.data });
    res.json({ success: true, payout });
  } catch (error) {
    console.error('[PAYOUT] Update error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const deletePayout = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.payout.findUnique({ where: { id } });

    if (!existing) return res.status(404).json({ error: 'Uitbetaling niet gevonden' });
    if (!(await assertInstallationAccess(req.user, existing.installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    await prisma.payout.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[PAYOUT] Delete error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};