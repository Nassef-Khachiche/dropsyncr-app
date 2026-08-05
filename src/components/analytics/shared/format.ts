/**
 * Opmaak van bedragen, percentages en datums voor alle analytics-tabs.
 */

export const EUR = (value: number | null | undefined, locale = 'nl-NL') =>
  '€ ' + (Number(value) || 0).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Compacte variant voor as-labels: € 12k
export const EUR_SHORT = (value: number | null | undefined) => {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1000) return `€${(amount / 1000).toFixed(0)}k`;
  return `€${amount.toFixed(0)}`;
};

export const PCT = (value: number | null | undefined, decimals = 1) =>
  ((Number(value) || 0) * 100).toFixed(decimals) + '%';

export const NUM = (value: number | null | undefined, locale = 'nl-NL') =>
  (Number(value) || 0).toLocaleString(locale);

// YYYY-MM-DD naar DD-MM voor korte as-labels.
export const shortDate = (value: string) => {
  const parts = String(value).split('-');
  if (parts.length !== 3) return value;
  return `${parts[2]}-${parts[1]}`;
};