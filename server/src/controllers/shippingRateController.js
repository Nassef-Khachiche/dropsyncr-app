import prisma from '../config/database.js';
import { EU_COUNTRIES, normalizeCountryCode } from '../utils/vatRates.js';

/**
 * Verzendkosten per land, per installatie.
 *
 * Volledig door de klant zelf ingevuld — er staan geen bedragen in de code.
 * Een land dat nog niet is ingesteld telt als 0 in de margeberekening.
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
 * Geeft alle EU-landen terug, ook de landen waar nog niets is ingevuld.
 * Die krijgen amount 0 zodat de klant ze in de settings kan invullen.
 */
export const getShippingRates = async (req, res) => {
  try {
    const { installationId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const saved = await prisma.shippingRate.findMany({
      where: { installationId: parseInt(installationId, 10) },
    });

    const savedMap = new Map(saved.map((row) => [row.countryCode, row.amount]));

    const rates = EU_COUNTRIES.map((countryCode) => ({
      countryCode,
      amount: savedMap.has(countryCode) ? round2(savedMap.get(countryCode)) : 0,
      configured: savedMap.has(countryCode),
    }));

    res.json({ rates });
  } catch (error) {
    console.error('[SHIPPING RATE] List error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Verzendkosten opslaan. Landen die niet worden meegestuurd blijven ongemoeid.
 */
export const saveShippingRates = async (req, res) => {
  try {
    const { installationId, rates } = req.body;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }
    if (!Array.isArray(rates)) {
      return res.status(400).json({ error: 'Rates moet een lijst zijn' });
    }
    if (!(await assertInstallationAccess(req.user, installationId))) {
      return res.status(403).json({ error: 'Access denied to this installation' });
    }

    const installationIdNumber = parseInt(installationId, 10);
    const allowed = new Set(EU_COUNTRIES);

    for (const row of rates) {
      const countryCode = normalizeCountryCode(row?.countryCode);
      if (!allowed.has(countryCode)) continue;

      const amount = round2(row?.amount);
      if (amount < 0) continue;

      await prisma.shippingRate.upsert({
        where: {
          installationId_countryCode: {
            installationId: installationIdNumber,
            countryCode,
          },
        },
        update: { amount },
        create: { installationId: installationIdNumber, countryCode, amount },
      });
    }

    const saved = await prisma.shippingRate.findMany({
      where: { installationId: installationIdNumber },
      orderBy: { countryCode: 'asc' },
    });

    res.json({ success: true, rates: saved });
  } catch (error) {
    console.error('[SHIPPING RATE] Save error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

/**
 * Herbruikbare lookup voor andere controllers (o.a. de inkooplijst).
 * Geeft een Map van landcode naar bedrag. Niet ingesteld = niet in de Map.
 */
export const loadShippingRateMap = async (installationId) => {
  const rows = await prisma.shippingRate.findMany({
    where: { installationId: parseInt(installationId, 10) },
  });
  return new Map(rows.map((row) => [row.countryCode, Number(row.amount) || 0]));
};

export const getShippingRateForCountry = (rateMap, country) => {
  const amount = rateMap.get(normalizeCountryCode(country));
  return Number.isFinite(amount) ? amount : 0;
};