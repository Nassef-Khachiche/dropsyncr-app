import prisma from '../config/database.js';

/**
 * Advertentiekosten per channel per dag. Handmatig ingevoerd; er is geen
 * koppeling met de advertentieplatforms.
 */

const assertInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: user.id, installationId: parseInt(installationId, 10) },
  });
  return Boolean(hasAccess);
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toIsoDay = (date) => date.toISOString().slice(0, 10);

const parseDay = (value) => {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Alle dagen van een maand voor één channel, ook de dagen die nog leeg zijn.
 * Zo kan de frontend meteen een invulbare lijst tonen.
 */
export const getAdSpendMonth = async (req, res) => {
  try {
    const { installationId, year, month, storeName } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }
    if (!storeName) {
      return res.status(400).json({ error: 'Channel is verplicht' });
    }

    const installationIdNumber = parseInt(installationId, 10);
    const now = new Date();
    const targetYear = parseInt(year, 10) || now.getUTCFullYear();
    const targetMonth = Math.min(12, Math.max(1, parseInt(month, 10) || now.getUTCMonth() + 1));

    const from = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const to = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));
    const dayCount = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();

    const saved = await prisma.adSpend.findMany({
      where: {
        installationId: installationIdNumber,
        storeName: String(storeName),
        date: { gte: from, lte: to },
      },
    });

    const byDay = new Map(saved.map((row) => [toIsoDay(row.date), row]));

    const days = Array.from({ length: dayCount }, (_, index) => {
      const day = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
      const entry = byDay.get(day);
      return {
        date: day,
        amount: entry ? round2(entry.amount) : 0,
        reportedRoas: entry?.reportedRoas != null ? Number(entry.reportedRoas) : null,
        configured: Boolean(entry),
      };
    });

    res.json({
      year: targetYear,
      month: targetMonth,
      storeName,
      days,
      total: round2(days.reduce((sum, entry) => sum + entry.amount, 0)),
    });
  } catch (error) {
    console.error('[AD SPEND] Month error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Opslaan van een hele maand in één keer. Dagen met bedrag 0 en zonder ROAS
 * worden verwijderd, zodat leeggemaakte velden ook echt verdwijnen.
 */
export const saveAdSpendMonth = async (req, res) => {
  try {
    const { installationId, storeName, days } = req.body;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }
    if (!storeName) {
      return res.status(400).json({ error: 'Channel is verplicht' });
    }
    if (!Array.isArray(days)) {
      return res.status(400).json({ error: 'Days moet een lijst zijn' });
    }

    const installationIdNumber = parseInt(installationId, 10);

    for (const row of days) {
      const date = parseDay(row?.date);
      if (!date) continue;

      const amount = round2(row?.amount);
      const roasValue = Number(row?.reportedRoas);
      const reportedRoas = Number.isFinite(roasValue) && roasValue > 0
        ? Math.round(roasValue * 100) / 100
        : null;

      const key = {
        installationId_date_storeName: {
          installationId: installationIdNumber,
          date,
          storeName: String(storeName),
        },
      };

      if (amount <= 0 && reportedRoas == null) {
        await prisma.adSpend.deleteMany({
          where: { installationId: installationIdNumber, date, storeName: String(storeName) },
        });
        continue;
      }

      await prisma.adSpend.upsert({
        where: key,
        update: { amount, reportedRoas },
        create: {
          installationId: installationIdNumber,
          date,
          storeName: String(storeName),
          amount,
          reportedRoas,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[AD SPEND] Save error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Herbruikbare lookup voor de analytics-controllers.
 * Geeft het totaal per dag en per channel binnen een periode.
 */
export const loadAdSpend = async (installationId, from, to, stores = []) => {
  const rows = await prisma.adSpend.findMany({
    where: {
      installationId: parseInt(installationId, 10),
      date: { gte: from, lte: to },
      ...(stores.length > 0 ? { storeName: { in: stores } } : {}),
    },
  });

  const total = round2(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));

  const byStore = new Map();
  const byDay = new Map();

  for (const row of rows) {
    const store = row.storeName || '-';
    byStore.set(store, round2((byStore.get(store) || 0) + (Number(row.amount) || 0)));

    const day = toIsoDay(row.date);
    byDay.set(day, round2((byDay.get(day) || 0) + (Number(row.amount) || 0)));
  }

  return { rows, total, byStore, byDay };
};