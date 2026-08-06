import prisma from '../config/database.js';

/**
 * Omzettargets per maand, per installatie.
 *
 * De klant vult ze zelf in via Settings. Analytics zet er vervolgens de
 * werkelijke cijfers tegenover.
 */

const assertInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: user.id, installationId: parseInt(installationId, 10) },
  });
  return Boolean(hasAccess);
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Alle twaalf maanden van een jaar, ook de maanden die nog niet zijn ingevuld.
 * Geeft daarnaast terug voor welke jaren er al targets bestaan, zodat de
 * frontend een jaarkeuze kan tonen.
 */
export const getRevenueTargets = async (req, res) => {
  try {
    const { installationId, year } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const installationIdNumber = parseInt(installationId, 10);
    const selectedYear = parseInt(year, 10) || new Date().getFullYear();

    const [saved, allYears] = await Promise.all([
      prisma.revenueTarget.findMany({
        where: { installationId: installationIdNumber, year: selectedYear },
      }),
      prisma.revenueTarget.findMany({
        where: { installationId: installationIdNumber },
        select: { year: true },
        distinct: ['year'],
        orderBy: { year: 'desc' },
      }),
    ]);

    const savedByMonth = new Map(saved.map((row) => [row.month, row.revenueTarget]));

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return {
        month,
        revenueTarget: savedByMonth.has(month) ? round2(savedByMonth.get(month)) : 0,
        configured: savedByMonth.has(month),
      };
    });

    const years = allYears.map((row) => row.year);
    const currentYear = new Date().getFullYear();
    // Huidig en volgend jaar altijd aanbieden, ook als er nog niets staat.
    for (const candidate of [currentYear, currentYear + 1]) {
      if (!years.includes(candidate)) years.push(candidate);
    }

    res.json({
      year: selectedYear,
      months,
      years: years.sort((a, b) => b - a),
      total: round2(months.reduce((sum, entry) => sum + entry.revenueTarget, 0)),
    });
  } catch (error) {
    console.error('[REVENUE TARGET] List error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const saveRevenueTargets = async (req, res) => {
  try {
    const { installationId, year, months } = req.body;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!Array.isArray(months)) {
      return res.status(400).json({ error: 'Months moet een lijst zijn' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const installationIdNumber = parseInt(installationId, 10);
    const targetYear = parseInt(year, 10);

    if (!Number.isFinite(targetYear) || targetYear < 2000 || targetYear > 2100) {
      return res.status(400).json({ error: 'Ongeldig jaar' });
    }

    for (const row of months) {
      const month = parseInt(row?.month, 10);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;

      const revenueTarget = round2(row?.revenueTarget);
      if (revenueTarget < 0) continue;

      await prisma.revenueTarget.upsert({
        where: {
          installationId_year_month: {
            installationId: installationIdNumber,
            year: targetYear,
            month,
          },
        },
        update: { revenueTarget },
        create: { installationId: installationIdNumber, year: targetYear, month, revenueTarget },
      });
    }

    const saved = await prisma.revenueTarget.findMany({
      where: { installationId: installationIdNumber, year: targetYear },
      orderBy: { month: 'asc' },
    });

    res.json({ success: true, targets: saved });
  } catch (error) {
    console.error('[REVENUE TARGET] Save error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/** Herbruikbare lookup: maandnummer naar target voor één jaar. */
export const loadTargetMap = async (installationId, year) => {
  const rows = await prisma.revenueTarget.findMany({
    where: { installationId: parseInt(installationId, 10), year },
  });
  return new Map(rows.map((row) => [row.month, Number(row.revenueTarget) || 0]));
};