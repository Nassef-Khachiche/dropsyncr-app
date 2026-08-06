import prisma from '../../config/database.js';
import { getVatRate } from '../../utils/vatRates.js';

/**
 * Gedeelde bouwstenen voor alle analytics-controllers.
 *
 * Twee dingen die overal gelden:
 *  - Omzet is ALTIJD ex btw. `Order.orderValue` staat inclusief, dus we rekenen
 *    per order de btw eruit met het tarief van het land van de klant.
 *  - Elke periode wordt twee keer berekend: de gekozen range en de direct
 *    voorafgaande gelijkwaardige range, zodat KPI's een trend kunnen tonen.
 *
 * Verandert er iets aan die logica, dan gebeurt dat hier en werkt het meteen
 * door in elke tab.
 */

/*
 * Geannuleerde orders tellen niet als omzet. De harde bron is
 * `Order.orderStatusCode`; de vrije `status`-tekst controleren we er als
 * vangnet naast, omdat die per integratie kan afwijken.
 *
 * RETURNED bestaat nog niet als orderstatus. Zodra die er is hoort de code
 * hieronder in RETURNED_CODES en werken de retourcijfers vanzelf mee.
 */
export const CANCELLED_CODES = ['CANCELLED', 'CANCELED'];
export const CANCELLED_STATUSES = ['geannuleerd', 'canceled', 'cancelled'];

export const RETURNED_CODES = [];
export const RETURNED_STATUSES = ['geretourneerd', 'returned'];

export const STATUS_SUPPORT = {
  cancelled: true,
  returned: false,
};

// Marketplace-commissie. Zelfde tarief als in de inkoopmodule.
export const COMMISSION_RATE = 0.15;

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const assertInstallationAccess = async (user, installationId) => {
  if (user.isGlobalAdmin) return true;
  const hasAccess = await prisma.userInstallation.findFirst({
    where: { userId: user.id, installationId: parseInt(installationId, 10) },
  });
  return Boolean(hasAccess);
};

export const isCancelled = (order) =>
  CANCELLED_CODES.includes(String(order?.orderStatusCode || '').toUpperCase())
  || CANCELLED_STATUSES.includes(String(order?.status || '').toLowerCase());

export const isReturned = (order) =>
  RETURNED_CODES.includes(String(order?.orderStatusCode || '').toUpperCase())
  || RETURNED_STATUSES.includes(String(order?.status || '').toLowerCase());

// Bruto bedrag naar netto, met het btw-tarief van het opgegeven land.
export const stripVat = (grossAmount, country) => {
  const gross = Number(grossAmount) || 0;
  return gross / (1 + getVatRate(country));
};

export const vatPortion = (grossAmount, country) => {
  const gross = Number(grossAmount) || 0;
  return gross - gross / (1 + getVatRate(country));
};

export const toNetRevenue = (order) => stripVat(order?.orderValue, order?.country);
export const toVatAmount = (order) => vatPortion(order?.orderValue, order?.country);

// Stuksprijs van een orderitem — unitPrice heeft voorrang, anders price.
export const resolveUnitPrice = (orderItem) => {
  const unitPrice = Number(orderItem?.unitPrice || 0);
  const price = Number(orderItem?.price || 0);
  return unitPrice > 0 ? unitPrice : price;
};

export const resolveQuantity = (orderItem) =>
  Math.max(1, parseInt(orderItem?.quantity || 1, 10) || 1);

export const parseDate = (value, fallback) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

export const toIsoDay = (date) => date.toISOString().slice(0, 10);

/**
 * De direct voorafgaande, gelijkwaardige periode.
 *
 * Bij een hele kalendermaand of kalenderjaar schuiven we een echte maand of
 * jaar terug, niet een vast aantal dagen — anders wordt februari met 28 dagen
 * vergeleken met de laatste 31 dagen van januari.
 */
export const resolvePreviousRange = (from, to) => {
  const startsOnFirst = from.getUTCDate() === 1;
  const lastDayOfMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate();

  const isSameMonth =
    from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();

  const isFullMonth = startsOnFirst && isSameMonth && to.getUTCDate() === lastDayOfMonth;

  const isFullYear =
    startsOnFirst &&
    from.getUTCMonth() === 0 &&
    to.getUTCMonth() === 11 &&
    to.getUTCDate() === 31 &&
    from.getUTCFullYear() === to.getUTCFullYear();

  if (isFullYear) {
    const year = from.getUTCFullYear() - 1;
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    };
  }

  if (isFullMonth) {
    const prevMonthIndex = from.getUTCMonth() - 1;
    const year = prevMonthIndex < 0 ? from.getUTCFullYear() - 1 : from.getUTCFullYear();
    const month = prevMonthIndex < 0 ? 11 : prevMonthIndex;
    return {
      from: new Date(Date.UTC(year, month, 1)),
      to: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
    };
  }

  // Vrije range: evenveel dagen, direct ervoor.
  const spanMs = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - spanMs - 1),
    to: new Date(from.getTime() - 1),
  };
};

/**
 * Standaard where-clause voor orders. Alle analytics-queries scopen op
 * installatie, zodat een klant nooit data van een ander ziet.
 */
export const buildOrderWhere = ({ installationId, from, to, stores = [], countries = [] }) => ({
  installationId,
  orderDate: { gte: from, lte: to },
  ...(stores.length > 0 ? { storeName: { in: stores } } : {}),
  ...(countries.length > 0 ? { country: { in: countries } } : {}),
});

// Velden die vrijwel elke tab van een order nodig heeft.
export const ORDER_SELECT = {
  id: true,
  orderDate: true,
  orderValue: true,
  country: true,
  storeName: true,
  platform: true,
  fulfillmentType: true,
  status: true,
  orderStatusCode: true,
};

/**
 * Kerncijfers van een set orders.
 */
export const summarize = (orders = []) => {
  let netRevenue = 0;
  let vatAmount = 0;
  let activeCount = 0;
  let cancelCount = 0;
  let returnCount = 0;

  for (const order of orders) {
    if (isCancelled(order)) {
      cancelCount += 1;
      continue;
    }
    if (isReturned(order)) returnCount += 1;
    netRevenue += toNetRevenue(order);
    vatAmount += toVatAmount(order);
    activeCount += 1;
  }

  const totalCount = activeCount + cancelCount;

  return {
    netRevenue: round2(netRevenue),
    vatAmount: round2(vatAmount),
    orderCount: totalCount,
    activeCount,
    cancelCount,
    returnCount,
    cancelPct: totalCount > 0 ? cancelCount / totalCount : 0,
    avgOrderValue: activeCount > 0 ? round2(netRevenue / activeCount) : 0,
  };
};

// Relatief verschil tussen twee periodes; 0.14 betekent +14%.
export const trend = (current, previous) => {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
};

/**
 * Query-parameters uitpakken en valideren. Elke analytics-endpoint begint
 * hiermee, zodat filters en periodes overal hetzelfde werken.
 */
export const resolveRequestScope = async (req) => {
  const { installationId, from, to, stores = '', countries = '' } = req.query;

  if (!installationId) {
    return { error: { status: 400, message: 'Installation ID is required' } };
  }
  if (!(await assertInstallationAccess(req.user, installationId))) {
    return { error: { status: 403, message: 'Access denied to this installation' } };
  }

  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const rangeFrom = parseDate(from, defaultFrom);
  const rangeTo = parseDate(to, now);

  // Einddatum altijd tot en met het einde van die dag.
  rangeTo.setUTCHours(23, 59, 59, 999);

  const splitList = (value) =>
    String(value).split(',').map((entry) => entry.trim()).filter(Boolean);

  return {
    installationId: parseInt(installationId, 10),
    from: rangeFrom,
    to: rangeTo,
    previous: resolvePreviousRange(rangeFrom, rangeTo),
    stores: splitList(stores),
    countries: splitList(countries),
  };
};

// Uniforme foutafhandeling, zodat elke controller hetzelfde logt.
export const handleError = (res, label, error) => {
  console.error(`[ANALYTICS] ${label} error:`, error);
  res.status(500).json({ error: 'Internal server error', details: error.message });
};