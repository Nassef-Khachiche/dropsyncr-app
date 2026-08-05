export const VAT_RATES = {
  AT: 0.20,   // Oostenrijk
  BE: 0.21,   // België
  BG: 0.20,   // Bulgarije
  CY: 0.19,   // Cyprus
  CZ: 0.21,   // Tsjechië
  DE: 0.19,   // Duitsland
  DK: 0.25,   // Denemarken
  EE: 0.24,   // Estland
  ES: 0.21,   // Spanje
  FI: 0.255,  // Finland
  FR: 0.20,   // Frankrijk
  GR: 0.24,   // Griekenland
  HR: 0.25,   // Kroatië
  HU: 0.27,   // Hongarije
  IE: 0.23,   // Ierland
  IT: 0.22,   // Italië
  LT: 0.21,   // Litouwen
  LU: 0.17,   // Luxemburg
  LV: 0.21,   // Letland
  MT: 0.18,   // Malta
  NL: 0.21,   // Nederland
  PL: 0.23,   // Polen
  PT: 0.23,   // Portugal
  RO: 0.21,   // Roemenië
  SE: 0.25,   // Zweden
  SI: 0.22,   // Slovenië
  SK: 0.23,   // Slowakije
};

/*
 * Buiten de EU geldt geen Europese btw. Een land dat niet in de lijst hierboven
 * staat krijgt daarom 0% — dat is correcter dan een willekeurig EU-tarief
 * opleggen aan bijvoorbeeld een Britse of Zwitserse order.
 */
export const DEFAULT_VAT_RATE = 0;

// Voor weergave: is dit een EU-land met een eigen btw-tarief?
export const isEuCountry = (country) =>
  Object.prototype.hasOwnProperty.call(VAT_RATES, normalizeCountryCode(country));

// EU-documenten schrijven Griekenland als EL, ISO gebruikt GR.
const COUNTRY_ALIASES = {
  EL: 'GR',
  UK: 'GB',
};

export const normalizeCountryCode = (country) => {
  const code = String(country || '').trim().toUpperCase();
  if (!code) return '';
  return COUNTRY_ALIASES[code] || code;
};

export const getVatRate = (country) => {
  const rate = VAT_RATES[normalizeCountryCode(country)];
  return Number.isFinite(rate) ? rate : DEFAULT_VAT_RATE;
};

// Alle EU-landen, alfabetisch — gebruikt om de verzendkosten-instelling te vullen.
export const EU_COUNTRIES = Object.keys(VAT_RATES).sort();