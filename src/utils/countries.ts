export const defaultCountryOptions = [
  'NL', 'BE', 'DE', 'FR', 'LU', 'AT', 'ES', 'IT', 'PT', 'IE',
  'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'HR', 'SI', 'DK', 'SE',
  'NO', 'FI', 'EE', 'LV', 'LT', 'CH', 'GB', 'US', 'CA', 'AU',
];

const countryAliases: Record<string, string> = {
  NETHERLANDS: 'NL',
  NEDERLAND: 'NL',
  BELGIUM: 'BE',
  BELGIE: 'BE',
  GERMANY: 'DE',
  DEUTSCHLAND: 'DE',
  FRANCE: 'FR',
  LUXEMBOURG: 'LU',
  AUSTRIA: 'AT',
  OOSTENRIJK: 'AT',
  SPAIN: 'ES',
  SPANJE: 'ES',
  ITA: 'IT',
  ITALY: 'IT',
  ITALIA: 'IT',
  ITALIE: 'IT',
  PORTUGAL: 'PT',
  IRELAND: 'IE',
  IERLAND: 'IE',
  POLAND: 'PL',
  POLEN: 'PL',
  CZECHIA: 'CZ',
  CZECH_REPUBLIC: 'CZ',
  SLOVAKIA: 'SK',
  HUNGARY: 'HU',
  ROMANIA: 'RO',
  BULGARIA: 'BG',
  CROATIA: 'HR',
  SLOVENIA: 'SI',
  DENMARK: 'DK',
  DENEMARKEN: 'DK',
  SWEDEN: 'SE',
  ZWEDEN: 'SE',
  NORWAY: 'NO',
  NOORWEGEN: 'NO',
  FINLAND: 'FI',
  ESTONIA: 'EE',
  LATVIA: 'LV',
  LITHUANIA: 'LT',
  SWITZERLAND: 'CH',
  ZWITSERLAND: 'CH',
  UNITED_KINGDOM: 'GB',
  UK: 'GB',
  GREAT_BRITAIN: 'GB',
  UNITED_STATES: 'US',
  USA: 'US',
  CANADA: 'CA',
  AUSTRALIA: 'AU',
};

export const normalizeCountryCodeForDisplay = (countryCode: string) => {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (!normalized) return '';
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;

  const key = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return countryAliases[key] || normalized;
};

export const getCountryFlagUrl = (countryCode: string) => {
  const normalizedCode = normalizeCountryCodeForDisplay(countryCode);
  if (!/^[A-Z]{2}$/.test(normalizedCode)) return null;
  return `https://flagcdn.com/24x18/${normalizedCode.toLowerCase()}.png`;
};

export const formatCountryDisplay = (countryCode: string) => {
  const normalizedCode = normalizeCountryCodeForDisplay(countryCode);
  return {
    code: normalizedCode || '-',
    flagUrl: normalizedCode ? getCountryFlagUrl(normalizedCode) : null,
  };
};
