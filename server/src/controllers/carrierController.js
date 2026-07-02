import prisma from '../config/database.js';
import fetch from 'node-fetch';
import { sendKauflandTracking } from './kauflandController.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LABEL_STORAGE_DIR = path.resolve(__dirname, '../../storage/labels');

const parseCredentialsSafely = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const normalizeDpdCredentials = (rawCredentials = {}) => {
  const credentials = { ...rawCredentials };
  const trimMaybe = (value) => (value === undefined || value === null ? value : String(value).trim());

  if (credentials.delisId !== undefined) credentials.delisId = trimMaybe(credentials.delisId);
  if (credentials.username !== undefined) credentials.username = trimMaybe(credentials.username);
  if (credentials.depotNumber !== undefined) credentials.depotNumber = trimMaybe(credentials.depotNumber);
  if (credentials.endpointUrl !== undefined) credentials.endpointUrl = trimMaybe(credentials.endpointUrl);
  if (credentials.authToken !== undefined) credentials.authToken = trimMaybe(credentials.authToken);
  if (credentials.password !== undefined) credentials.password = trimMaybe(credentials.password);

  if (!credentials.authToken && credentials.password) {
    credentials.authToken = credentials.password;
  }

  return credentials;
};

const isTruthyValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'sandbox'].includes(normalized);
  }
  return false;
};

const normalizeWeGrowCredentials = (rawCredentials = {}) => {
  const credentials = { ...(rawCredentials || {}) };
  const trimMaybe = (value) => (value === undefined || value === null ? value : String(value).trim());
  const sanitizeSecret = (value) => {
    if (value === undefined || value === null) return value;
    return String(value)
      .trim()
      .replace(/^['"]+|['"]+$/g, '')
      .replace(/[\r\n\t]/g, '')
      .trim();
  };

  if (credentials.apiKey === undefined) credentials.apiKey = credentials.xKey ?? credentials.key ?? credentials.api_key;
  if (credentials.bearerToken === undefined) credentials.bearerToken = credentials.authToken ?? credentials.token;
  if (credentials.baseUrl === undefined) credentials.baseUrl = credentials.base_url;
  if (credentials.apiVersion === undefined) credentials.apiVersion = credentials.xVersion ?? credentials.version ?? credentials.x_version;
  if (credentials.serviceCode === undefined) credentials.serviceCode = credentials.service_code;
  if (credentials.serviceCodes === undefined) credentials.serviceCodes = credentials.service_codes;

  if (credentials.apiKey !== undefined) credentials.apiKey = sanitizeSecret(credentials.apiKey);
  if (credentials.bearerToken !== undefined) credentials.bearerToken = sanitizeSecret(credentials.bearerToken);
  if (credentials.baseUrl !== undefined) credentials.baseUrl = trimMaybe(credentials.baseUrl);
  if (credentials.apiVersion !== undefined) credentials.apiVersion = trimMaybe(credentials.apiVersion);
  if (credentials.serviceCode !== undefined) credentials.serviceCode = trimMaybe(credentials.serviceCode);
  if (credentials.returnServiceCode !== undefined) credentials.returnServiceCode = trimMaybe(credentials.returnServiceCode);
  if (credentials.dhlServiceCode !== undefined) credentials.dhlServiceCode = trimMaybe(credentials.dhlServiceCode);
  if (credentials.postnlServiceCode !== undefined) credentials.postnlServiceCode = trimMaybe(credentials.postnlServiceCode);
  if (credentials.dpdServiceCode !== undefined) credentials.dpdServiceCode = trimMaybe(credentials.dpdServiceCode);
  if (credentials.serviceCodes !== undefined) {
    credentials.serviceCodes = normalizeWeGrowServiceCodeMap(credentials.serviceCodes);
  }
  if (credentials.environment !== undefined) credentials.environment = trimMaybe(credentials.environment);

  const hasSandbox = Object.prototype.hasOwnProperty.call(credentials, 'sandbox');
  if (hasSandbox) {
    credentials.sandbox = isTruthyValue(credentials.sandbox);
  }

  if (!hasSandbox && typeof credentials.environment === 'string') {
    credentials.sandbox = credentials.environment.trim().toLowerCase() === 'sandbox';
  }

  return credentials;
};

const normalizeCarrierCredentials = (carrierType, rawCredentials = {}) => {
  if (carrierType === 'dpd') {
    return normalizeDpdCredentials(rawCredentials);
  }
  if (carrierType === 'wegrow') {
    return normalizeWeGrowCredentials(rawCredentials);
  }
  return rawCredentials || {};
};

const getWeGrowAuthConfig = (rawCredentials = {}) => {
  const normalize = (value) => (value === undefined || value === null ? '' : String(value).trim());
  const sanitizeSecret = (value) => normalize(value).replace(/^['"]+|['"]+$/g, '').replace(/[\r\n\t]/g, '').trim();
  const credentials = rawCredentials || {};

  const apiKey = sanitizeSecret(
    credentials.apiKey ||
    credentials.xKey ||
    credentials.key ||
    process.env.WEGROW_API_KEY
  );
  const sanitizedApiKey = apiKey.replace(/^bearer\s+/i, '').trim();

  let bearerToken = sanitizeSecret(
    credentials.bearerToken ||
    credentials.authToken ||
    credentials.token ||
    process.env.WEGROW_BEARER_TOKEN
  );

  bearerToken = bearerToken.replace(/^bearer\s+/i, '').trim();

  if (!bearerToken && /^bearer\s+/i.test(apiKey)) {
    bearerToken = sanitizedApiKey;
  }

  const headers = {
    ...(sanitizedApiKey && { 'x-key': sanitizedApiKey, 'x-api-key': sanitizedApiKey }),
    ...(bearerToken && { Authorization: `Bearer ${bearerToken}` }),
  };

  return { apiKey: sanitizedApiKey, bearerToken, headers };
};

const WEGROW_SERVICE_OPTIONS = {
  'dhl-nl': { label: 'DHL NL', defaultServiceCode: null, fallbackServiceKeys: ['dhl'] },
  'dhl-for-you-envelop': { label: 'DHL For You - Envelop', defaultServiceCode: null, fallbackServiceKeys: ['dhl'] },
  'dhl-for-you-brievenbuspakje': { label: 'DHL For You Brievenbuspakje', defaultServiceCode: null, fallbackServiceKeys: ['dhl'] },
  'dhl-for-you': { label: 'DHL For You', defaultServiceCode: null, fallbackServiceKeys: ['dhl'] },
  'postnl-nederland-brievenbuspakketje-0-2kg': { label: 'PostNL Brievenbuspakketje 0-2kg', defaultServiceCode: null, fallbackServiceKeys: ['postnl'] },
  'postnl-belgie-standaard-0-23kg': { label: 'PostNL België Standaard 0-23kg', defaultServiceCode: null, fallbackServiceKeys: ['postnl'] },
  'dpd-standaard': { label: 'DPD Standaard', defaultServiceCode: null, fallbackServiceKeys: ['dpd'] },
};

const normalizeWeGrowServiceCodeMap = (rawServiceCodeMap) => {
  if (!rawServiceCodeMap) return {};

  // Handle double-serialized JSON (e.g. stored as a string instead of an object)
  let map = rawServiceCodeMap;
  if (typeof map === 'string') {
    try {
      map = JSON.parse(map);
    } catch {
      return {};
    }
  }

  if (typeof map !== 'object' || Array.isArray(map)) return {};

  return Object.entries(map).reduce((accumulator, [key, value]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    const normalizedValue = value === undefined || value === null ? '' : String(value).trim();
    if (!normalizedKey || !normalizedValue) return accumulator;

    accumulator[normalizedKey] = normalizedValue;
    return accumulator;
  }, {});
};

const WEGROW_STANDARD_SERVICE_CODE_BY_COUNTRY = {
  DE: {
    home_premium: 'wegrow_home_premium',
    letterbox_premium: 'wegrow_letterbox_premium',
    domestic_return: 'wegrow_domestic_return',
  },
  FR: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    direct_return: 'wegrow_direct_return',
  },
  NL: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    letterbox_premium: 'wegrow_letterbox_premium',
    letterbox_economy: 'wegrow_letterbox_economy',
    direct_return: 'wegrow_direct_return',
  },
  BE: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    letterbox_premium: 'wegrow_letterbox_premium',
    domestic_return: 'wegrow_domestic_return',
    direct_return: 'wegrow_direct_return',
  },
  AT: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    letterbox_premium: 'wegrow_letterbox_premium',
    direct_return: 'wegrow_direct_return',
  },
  IT: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    direct_return: 'wegrow_direct_return',
  },
  ES: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    domestic_return: 'wegrow_domestic_return',
    direct_return: 'wegrow_direct_return',
  },
  GB: {
    home_economy: 'wegrow_home_economy',
  },
  IE: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
  },
  PT: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    domestic_return: 'wegrow_domestic_return',
    direct_return: 'wegrow_direct_return',
  },
  DK: {
    home_premium: 'wegrow_home_premium',
    pudo_premium: 'wegrow_pudo_premium',
    direct_return: 'wegrow_direct_return',
  },
  SK: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    direct_return: 'wegrow_direct_return',
  },
  SI: {
    home_premium: 'wegrow_home_premium',
    home_economy: 'wegrow_home_economy',
    direct_return: 'wegrow_direct_return',
  },
  SE: {
    home_premium: 'wegrow_home_premium',
    direct_return: 'wegrow_direct_return',
  },
  FI: {
    home_premium: 'wegrow_home_premium',
    pudo_premium: 'wegrow_pudo_premium',
    direct_return: 'wegrow_direct_return',
  },
  NO: {
    home_premium: 'wegrow_home_premium',
  },
  ROW: {
    home_premium: 'wegrow_home_premium',
    direct_return: 'wegrow_direct_return',
  },
};

const WEGROW_STANDARD_SERVICE_CODE_PREFERENCE_BY_COUNTRY = {
  DE: ['home_premium', 'letterbox_premium'],
  FR: ['home_premium', 'home_economy'],
  NL: ['home_premium', 'home_economy', 'letterbox_premium', 'letterbox_economy'],
  BE: ['home_economy', 'home_premium', 'letterbox_premium'],
  AT: ['home_premium', 'home_economy', 'letterbox_premium'],
  IT: ['home_premium', 'home_economy'],
  ES: ['home_premium', 'home_economy'],
  GB: ['home_economy'],
  IE: ['home_premium', 'home_economy'],
  PT: ['home_premium', 'home_economy'],
  DK: ['home_premium', 'pudo_premium'],
  SK: ['home_premium', 'home_economy'],
  SI: ['home_premium', 'home_economy'],
  SE: ['home_premium'],
  FI: ['home_premium', 'pudo_premium'],
  NO: ['home_premium'],
  ROW: ['home_premium'],
};

const WEGROW_COUNTRY_NAME_TO_ISO2 = {
  GERMANY: 'DE',
  DEUTSCHLAND: 'DE',
  FRANCE: 'FR',
  NETHERLANDS: 'NL',
  BELGIUM: 'BE',
  BELGIE: 'BE',
  'BELGIË': 'BE',
  AUSTRIA: 'AT',
  ITALY: 'IT',
  SPAIN: 'ES',
  'UNITED KINGDOM': 'GB',
  UK: 'GB',
  ENGLAND: 'GB',
  IRELAND: 'IE',
  PORTUGAL: 'PT',
  DENMARK: 'DK',
  SLOVAKIA: 'SK',
  SLOVENIA: 'SI',
  SWEDEN: 'SE',
  FINLAND: 'FI',
  NORWAY: 'NO',
};

const normalizeCountryToIso2 = (country) => {
  const normalized = String(country || '').trim().toUpperCase();
  if (!normalized) return '';
  if (normalized.length === 2 && /^[A-Z]{2}$/.test(normalized)) return normalized;
  return WEGROW_COUNTRY_NAME_TO_ISO2[normalized] || normalized;
};

const resolveWeGrowStandardServiceCode = (destinationCountry, options = {}) => {
  const normalizedCountry = normalizeCountryToIso2(destinationCountry);
  if (!normalizedCountry) return '';

  const countryMatrix = WEGROW_STANDARD_SERVICE_CODE_BY_COUNTRY[normalizedCountry] || WEGROW_STANDARD_SERVICE_CODE_BY_COUNTRY.ROW || {};
  const selectedCarrier = String(options.selectedCarrier || '').trim().toLowerCase();
  const isReturnShipment = Boolean(options.isReturnShipment);
  const countryPreference = WEGROW_STANDARD_SERVICE_CODE_PREFERENCE_BY_COUNTRY[normalizedCountry] || WEGROW_STANDARD_SERVICE_CODE_PREFERENCE_BY_COUNTRY.ROW || [];

  const preference = [];
  if (isReturnShipment) {
    preference.push('direct_return', 'domestic_return');
  } else if (
    selectedCarrier.includes('brievenbus') ||
    selectedCarrier.includes('envelop') ||
    selectedCarrier.includes('mailbox') ||
    selectedCarrier.includes('letterbox')
  ) {
    preference.push('letterbox_premium', 'letterbox_economy', ...countryPreference.filter((candidate) => !candidate.startsWith('letterbox_')));
  } else if (selectedCarrier.includes('pudo') || normalizedCountry === 'DK' || normalizedCountry === 'FI') {
    preference.push('pudo_premium', ...countryPreference.filter((candidate) => candidate !== 'pudo_premium'));
  } else {
    preference.push(...countryPreference);
  }

  for (const candidateKey of preference) {
    if (countryMatrix[candidateKey]) return countryMatrix[candidateKey];
  }

  return Object.values(countryMatrix).find(Boolean) || '';
};

const stringifyApiErrorDetail = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value
      .map((entry) => stringifyApiErrorDetail(entry))
      .filter(Boolean)
      .join(' | ');
  }

  if (typeof value === 'object') {
    const prioritized = [
      value.detail,
      value.message,
      value.error,
      value.description,
      value.title,
      value.code,
    ]
      .map((entry) => stringifyApiErrorDetail(entry))
      .filter(Boolean);

    if (prioritized.length > 0) {
      return prioritized.join(' | ');
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const persistNormalizedCredentialsIfChanged = async (carrierId, previousCredentials, normalizedCredentials) => {
  const previous = JSON.stringify(previousCredentials || {});
  const normalized = JSON.stringify(normalizedCredentials || {});
  if (previous === normalized) return;

  try {
    await prisma.carrier.update({
      where: { id: carrierId },
      data: { credentials: normalized },
    });
  } catch (error) {
    if (error?.code === 'P2000') {
      console.warn('Skipping normalized credential persistence due to column length limit', { carrierId });
      return;
    }
    throw error;
  }
};

export const getCarriers = async (req, res) => {
  try {
    const { installationId } = req.query;

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parseInt(installationId) },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const carriers = await prisma.carrier.findMany({
      where: req.user.isGlobalAdmin ? {} : { installationId: parseInt(installationId) },
      orderBy: { createdAt: 'desc' },
    });

    const carriersWithParsedCredentials = carriers.map((carrier) => {
      const parsedCredentials = parseCredentialsSafely(carrier.credentials);
      const normalizedCredentials = normalizeCarrierCredentials(carrier.carrierType, parsedCredentials);
      return { ...carrier, credentials: normalizedCredentials };
    });

    res.json(carriersWithParsedCredentials);
  } catch (error) {
    console.error('Get carriers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createCarrier = async (req, res) => {
  try {
    const { installationId, carrierType, contractName, active, credentials } = req.body;
    const normalizedCredentials = normalizeCarrierCredentials(carrierType, credentials || {});

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parseInt(installationId) },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const carrier = await prisma.carrier.create({
      data: {
        installationId: parseInt(installationId),
        carrierType,
        contractName,
        active: active !== undefined ? active : true,
        credentials: JSON.stringify(normalizedCredentials),
      },
    });

    res.status(201).json({ ...carrier, credentials: JSON.parse(carrier.credentials) });
  } catch (error) {
    console.error('Create carrier error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCarrier = async (req, res) => {
  try {
    const { id } = req.params;
    const { contractName, active, credentials } = req.body;

    const existingCarrier = await prisma.carrier.findUnique({
      where: { id: parseInt(id) },
      select: { id: true, carrierType: true },
    });

    if (!existingCarrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    const updateData = {};
    if (contractName !== undefined) updateData.contractName = contractName;
    if (active !== undefined) updateData.active = active;
    if (credentials !== undefined) {
      const normalizedCredentials = normalizeCarrierCredentials(existingCarrier.carrierType, credentials);
      updateData.credentials = JSON.stringify(normalizedCredentials);
    }

    const carrier = await prisma.carrier.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    res.json({ ...carrier, credentials: JSON.parse(carrier.credentials) });
  } catch (error) {
    console.error('Update carrier error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteCarrier = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.carrier.delete({ where: { id: parseInt(id) } });

    res.json({ message: 'Carrier deleted successfully' });
  } catch (error) {
    console.error('Delete carrier error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const testCarrierConnection = async (req, res) => {
  try {
    const { id } = req.params;

    const carrier = await prisma.carrier.findUnique({ where: { id: parseInt(id) } });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: carrier.installationId },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const credentials = parseCredentialsSafely(carrier.credentials);
    const normalizedCredentials = normalizeCarrierCredentials(carrier.carrierType, credentials);
    await persistNormalizedCredentialsIfChanged(carrier.id, credentials, normalizedCredentials);

    if (carrier.carrierType === 'dhl') {
      const hasRequired = !!normalizedCredentials.userId && !!normalizedCredentials.accountNumber && !!normalizedCredentials.apiKey;
      return res.json({
        success: hasRequired,
        message: hasRequired ? 'DHL verbinding succesvol getest' : 'DHL credentials zijn incompleet',
      });
    }

    if (carrier.carrierType === 'dpd') {
      const hasDelisId = !!(normalizedCredentials.delisId || normalizedCredentials.username);
      const hasAuthToken = !!(normalizedCredentials.authToken || normalizedCredentials.password);
      const hasRequired = hasDelisId && hasAuthToken && !!normalizedCredentials.depotNumber;
      return res.json({
        success: hasRequired,
        message: hasRequired ? 'DPD verbinding succesvol getest' : 'DPD credentials zijn incompleet (Delis ID, Auth Token, Depotnummer)',
      });
    }

    if (carrier.carrierType === 'wegrow') {
      const wegrowCredentials = normalizeWeGrowCredentials(credentials);
      const { apiKey, bearerToken, headers: weGrowAuthHeaders } = getWeGrowAuthConfig(wegrowCredentials);
      const hasAuthCredentials = !!apiKey || !!bearerToken;

      if (!hasAuthCredentials) {
        return res.json({
          success: false,
          message: 'WeGrow credentials zijn incompleet (API key of bearer token ontbreekt)',
        });
      }

      const apiVersion = wegrowCredentials.apiVersion || 'v1';
      const sandboxDefault = process.env.WEGROW_SANDBOX_URL || 'https://api-sandbox.wegrow.eu';
      const productionDefault = process.env.WEGROW_PRODUCTION_URL || 'https://api.wegrow.eu';
      const useSandbox = isTruthyValue(wegrowCredentials.sandbox) || String(wegrowCredentials.environment || '').toLowerCase() === 'sandbox';
      const baseUrl = (wegrowCredentials.baseUrl || process.env.WEGROW_BASE_URL || (useSandbox ? sandboxDefault : productionDefault)).replace(/\/+$/, '');

      const probeEndpoints = [`${baseUrl}/shipments?limit=1`, `${baseUrl}/shipments`];

      for (const endpoint of probeEndpoints) {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { Accept: 'application/json', ...weGrowAuthHeaders, 'x-version': apiVersion },
        });

        const rawBody = await response.text();
        let parsedBody = null;
        try { parsedBody = rawBody ? JSON.parse(rawBody) : null; } catch { parsedBody = null; }

        const detail = parsedBody?.detail || parsedBody?.error || rawBody || null;

        if (response.status === 401 || response.status === 403) {
          return res.json({ success: false, message: 'WeGrow authenticatie mislukt', details: detail || 'Unauthorized' });
        }
        if (response.ok) {
          return res.json({ success: true, message: 'WeGrow authenticatie succesvol' });
        }
        if (response.status >= 400 && response.status < 500) {
          return res.json({ success: true, message: `WeGrow authenticatie succesvol (HTTP ${response.status})`, details: detail });
        }
      }

      return res.json({ success: false, message: 'WeGrow verbindingstest mislukt', details: 'Geen geldig antwoord van WeGrow ontvangen' });
    }

    return res.json({ success: false, message: 'Carrier type wordt momenteel niet ondersteund' });
  } catch (error) {
    console.error('Test carrier error:', error);
    res.status(500).json({ success: false, error: 'Failed to test carrier' });
  }
};

export const generateCarrierLabels = async (req, res) => {
  try {
    const { id } = req.params;
    const { packages = [], shippingMethod, wegrowCarrier } = req.body;

    const carrier = await prisma.carrier.findUnique({ where: { id: parseInt(id) } });

    if (!carrier) return res.status(404).json({ error: 'Carrier not found' });
    if (!carrier.active) return res.status(400).json({ error: 'Carrier contract is inactive' });

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: carrier.installationId },
      });
      if (!hasAccess) return res.status(403).json({ error: 'Access denied to this installation' });
    }

    if (!['dhl', 'dpd', 'wegrow'].includes(carrier.carrierType)) {
      return res.status(400).json({ error: 'Carrier type not supported for labels' });
    }

    const selectedShippingMethod = String(shippingMethod || carrier.id || '').trim() || null;

    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
    const requestHost = forwardedHost || String(req.get('host') || '').trim();
    const protocol =
      req.secure || forwardedProto === 'https' || process.env.FORCE_LABEL_HTTPS === 'true' || process.env.NODE_ENV === 'production'
        ? 'https'
        : req.protocol;

    const buildPublicLabelUrl = (fileName) => `/labels/${fileName}`;

    const resolveStoredLabelUrl = async (labelUrl, orderId) => {
      const normalized = String(labelUrl || '').trim();
      if (!normalized) return null;

      if (normalized.startsWith('data:')) {
        const dataUrlMatch = normalized.match(/^data:([^;]+);base64,(.+)$/i);
        if (!dataUrlMatch) return null;

        const mimeType = String(dataUrlMatch[1] || 'application/octet-stream').toLowerCase();
        const base64Payload = dataUrlMatch[2] || '';
        const extension = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'bin';

        await fs.mkdir(LABEL_STORAGE_DIR, { recursive: true });

        const safeOrderId = Number.isInteger(Number(orderId)) ? Number(orderId) : 'unknown';
        const fileName = `label-${safeOrderId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        const filePath = path.join(LABEL_STORAGE_DIR, fileName);

        await fs.writeFile(filePath, Buffer.from(base64Payload, 'base64'));
        return buildPublicLabelUrl(fileName);
      }

      if (normalized.startsWith('/labels/')) return normalized;

      if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        try {
          const parsedUrl = new URL(normalized);
          const sameHost = parsedUrl.host.toLowerCase() === requestHost.toLowerCase();
          if (sameHost && protocol === 'https' && parsedUrl.protocol === 'http:') {
            parsedUrl.protocol = 'https:';
            return parsedUrl.toString();
          }
        } catch {
          return normalized.length <= 191 ? normalized : null;
        }
        return normalized.length <= 191 ? normalized : null;
      }

      return normalized.length <= 191 ? normalized : null;
    };

    const persistOrderShippingMethodAndLabels = async (generatedLabels = []) => {
      const packageList = Array.isArray(packages) ? packages : [];
      if (packageList.length === 0) return;

      const orderNumbersFromPackages = Array.from(
        new Set(
          packageList.map((pkg) => {
            const explicitOrderNumber = String(pkg?.orderNumber || '').trim();
            if (explicitOrderNumber) return explicitOrderNumber;
            const packageId = pkg?.id;
            if (typeof packageId === 'string') {
              const normalizedPackageId = packageId.trim();
              if (normalizedPackageId) return normalizedPackageId;
            }
            return null;
          }).filter(Boolean)
        )
      );

      const ordersByOrderNumber = new Map();
      if (orderNumbersFromPackages.length > 0) {
        const matchingOrders = await prisma.order.findMany({
          where: { installationId: carrier.installationId, orderNumber: { in: orderNumbersFromPackages } },
          select: { id: true, orderNumber: true },
        });
        matchingOrders.forEach((order) => { ordersByOrderNumber.set(order.orderNumber, order.id); });
      }

      const resolvedPackages = [];
      for (let index = 0; index < packageList.length; index += 1) {
        const pkg = packageList[index] || {};
        const parsedOrderId = Number(pkg.orderId);
        let orderId = Number.isInteger(parsedOrderId) && parsedOrderId > 0 ? parsedOrderId : null;
        if (!orderId) {
          const orderNumberKey = String(pkg.orderNumber || pkg.id || '').trim();
          if (orderNumberKey && ordersByOrderNumber.has(orderNumberKey)) {
            orderId = ordersByOrderNumber.get(orderNumberKey);
          }
        }
        if (!orderId) continue;
        resolvedPackages.push({ orderId, generatedLabel: generatedLabels[index] || null });
      }

      if (resolvedPackages.length === 0) return;

      const shippingMethodColumnRows = await prisma.$queryRaw`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'shippingMethod' LIMIT 1
      `;
      const hasShippingMethodColumn = Array.isArray(shippingMethodColumnRows) && shippingMethodColumnRows.length > 0;

      // Check if this is a return shipment - don't mark order as shipped
      const isReturnBatch = (packages || []).some((pkg) => pkg.isReturn === true);

      const operations = [
        ...resolvedPackages.map(({ orderId, generatedLabel }) => {
          const generatedTrackingCode = String(generatedLabel?.trackingCode || '').trim();

          // Skip status update for return shipments
          if (isReturnBatch) {
            return prisma.$executeRaw`
              UPDATE \`Order\` SET updatedAt = NOW()
              WHERE id = ${orderId} AND installationId = ${carrier.installationId}
            `;
          }

          if (hasShippingMethodColumn) {
            return prisma.$executeRaw`
              UPDATE \`Order\` SET shippingMethod = ${selectedShippingMethod}, orderStatus = 'verzonden',
              status = 'verzonden', orderStatusCode = 'SHIPPED', supplierTracking = ${generatedTrackingCode || null}, updatedAt = NOW()
              WHERE id = ${orderId} AND installationId = ${carrier.installationId}
            `;
          }
          return prisma.$executeRaw`
            UPDATE \`Order\` SET orderStatus = 'verzonden', status = 'verzonden', orderStatusCode = 'SHIPPED',
            supplierTracking = ${generatedTrackingCode || null}, updatedAt = NOW()
            WHERE id = ${orderId} AND installationId = ${carrier.installationId}
          `;
        }),
      ];

      const persistedLabelUrlsByOrderId = new Map();
      await Promise.all(
        resolvedPackages.map(async ({ orderId, generatedLabel }) => {
          const persistedLabelUrl = await resolveStoredLabelUrl(generatedLabel?.labelUrl, orderId);
          persistedLabelUrlsByOrderId.set(orderId, persistedLabelUrl);
        })
      );

      resolvedPackages.forEach(({ orderId, generatedLabel }) => {
        const persistedLabelUrl = persistedLabelUrlsByOrderId.get(orderId) || null;
        const generatedTrackingCode = String(generatedLabel?.trackingCode || '').trim();
        const trackingUrl = String(generatedLabel?.trackingUrl || '').trim();

        if (persistedLabelUrl && generatedLabel) generatedLabel.labelUrl = persistedLabelUrl;

        if (generatedTrackingCode) {
          operations.push(
            prisma.tracking.upsert({
              where: { orderId },
              update: { trackingCode: generatedTrackingCode, supplier: carrier.carrierType, source: 'label_generation', status: 'linked' },
              create: { orderId, trackingCode: generatedTrackingCode, supplier: carrier.carrierType, source: 'label_generation', status: 'linked' },
            })
          );
          if (trackingUrl && generatedLabel) generatedLabel.trackingUrl = trackingUrl;
        }

        operations.push(
          prisma.label.upsert({
            where: { orderId },
            update: { carrierId: carrier.id, labelUrl: persistedLabelUrl, status: 'generated' },
            create: { orderId, carrierId: carrier.id, labelUrl: persistedLabelUrl, status: 'generated' },
          })
        );
      });

      await prisma.$transaction(operations);

      if (!isReturnBatch) {
        for (const { orderId, generatedLabel } of resolvedPackages) {
          const orderRecord = await prisma.order.findUnique({
            where: { id: orderId },
            select: { platform: true, orderNumber: true, installationId: true },
          });
          if (orderRecord?.platform === 'kaufland' && generatedLabel?.trackingCode) {
            await sendKauflandTracking(
              String(orderRecord.installationId),
              orderRecord.orderNumber,
              generatedLabel.trackingCode,
              carrier.carrierType,
              selectedShippingMethod,
            ).catch(err => console.error('[KAUFLAND TRACKING] Async error:', err.message));
          }
        }
      }
    };

    const parseAddress = (address = '') => {
      const parts = String(address).split(',').map(p => p.trim()).filter(Boolean);
      let street = parts.length > 1 ? parts.slice(0, -1).join(', ') : parts[0] || '';
      let zipCode = '';
      let city = '';
      const last = parts[parts.length - 1] || '';
      const match = last.match(/(\d{4}\s?[A-Z]{2})\s+(.+)/i);
      if (match) { zipCode = match[1].replace(/\s+/g, ''); city = match[2].trim(); }
      return { street, zipCode, city };
    };

    const normalizePostalCode = (postalCode, country = 'NL') => {
      const raw = String(postalCode || '').trim();
      if (!raw) return '';
      const countryCode = String(country || 'NL').trim().toUpperCase();
      if (countryCode === 'NL') return raw.replace(/\s+/g, '').toUpperCase();
      return raw.replace(/\s+/g, ' ').trim().toUpperCase();
    };

    const buildDpdRecipientAddress = (pkg) => {
      const address = parseAddress(pkg.address || '');
      const addressText = String(pkg.address || '').trim();
      const country = String(pkg.country || 'NL').trim().toUpperCase() || 'NL';
      let zipCode = normalizePostalCode(pkg.zipCode || address.zipCode, country);
      let city = String(pkg.city || address.city || '').trim();
      let street = String(pkg.street || '').trim();

      const addressParts = addressText.split(',').map((part) => String(part || '').trim()).filter(Boolean);

      if (!street) {
        const postalIndex = addressParts.findIndex((part) => /\d{4}\s?[A-Z]{2}/i.test(part));
        if (postalIndex > 0) street = String(addressParts.slice(0, postalIndex).join(', ') || '').trim();
      }
      if (!street) street = String(addressParts[0] || address.street || pkg.address || '').trim();

      if (!zipCode && country === 'NL') {
        const nlPostalSegment = addressParts.find((part) => /\d{4}\s?[A-Z]{2}/i.test(part));
        if (nlPostalSegment) {
          const postalMatch = nlPostalSegment.match(/(\d{4}\s?[A-Z]{2})/i);
          if (postalMatch?.[1]) zipCode = normalizePostalCode(postalMatch[1], country);
        }
      }

      if (!city) {
        const nlPostalIndex = addressParts.findIndex((part) => /\d{4}\s?[A-Z]{2}/i.test(part));
        if (nlPostalIndex >= 0 && addressParts[nlPostalIndex + 1]) city = String(addressParts[nlPostalIndex + 1] || '').trim();
      }

      if ((!zipCode || !city) && addressText) {
        const escapedCountry = country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const withoutTrailingCountry = addressText.replace(new RegExp(`,?\\s*${escapedCountry}\\s*$`, 'i'), '').trim();
        const nlMatch = withoutTrailingCountry.match(/(\d{4}\s?[A-Z]{2})\s+([^,]+)$/i);
        const intlMatch = withoutTrailingCountry.match(/(\d{4,6})\s+([^,]+)$/i);
        const intlPrefixedMatch = withoutTrailingCountry.match(/(?:[A-Z]{1,3}-)?(\d{4,6})\s+([^,]+)$/i);
        const cityThenZipMatch = withoutTrailingCountry.match(/([^,]+)\s+(?:[A-Z]{1,3}-)?(\d{4,6})$/i);
        const fallbackMatch = country === 'NL' ? (nlMatch || intlPrefixedMatch) : (nlMatch || intlPrefixedMatch || intlMatch);

        if (fallbackMatch) {
          if (!zipCode) zipCode = normalizePostalCode(fallbackMatch[1], country);
          if (!city) city = String(fallbackMatch[2] || '').trim();
        } else if (cityThenZipMatch) {
          if (!city) city = String(cityThenZipMatch[1] || '').trim();
          if (!zipCode) zipCode = normalizePostalCode(cityThenZipMatch[2], country);
        }

        if (!city) {
          const tailSegment = withoutTrailingCountry.split(',').map((part) => part.trim()).filter(Boolean).pop();
          if (tailSegment && /[A-Za-zÀ-ÿ]/.test(tailSegment)) {
            city = tailSegment.replace(/(?:[A-Z]{1,3}-)?\d{4,6}/g, '').trim();
          }
        }

        if (!zipCode) {
          const broadZipMatch = withoutTrailingCountry.match(/(?:^|[\s,.-])(?:[A-Z]{1,3}-)?(\d{4,6})(?=$|[\s,.-])/i);
          if (broadZipMatch?.[1]) zipCode = normalizePostalCode(broadZipMatch[1], country);
        }

        if (!zipCode && country === 'NL') {
          const nlZipMatch = withoutTrailingCountry.match(/(?:^|[\s,.-])(\d{4}\s?[A-Z]{2})(?=$|[\s,.-])/i);
          if (nlZipMatch?.[1]) zipCode = normalizePostalCode(nlZipMatch[1], country);
        }
      }

      if (!street) throw new Error('Straat van ontvanger ontbreekt.');
      if (!city) city = 'Unknown';
      if (!zipCode) zipCode = country === 'NL' ? '0000AA' : '0000';
      if (country === 'NL' && !/^\d{4}[A-Z]{2}$/.test(zipCode)) {
        throw new Error('Postcode van ontvanger is ongeldig voor NL (verwacht formaat 1234AB).');
      }

      return { street, city, country, zipCode };
    };

    const escapeXml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    const isTruthy = (value) => isTruthyValue(value);

    const DPD_SANDBOX_DEFAULT_ENDPOINTS = [
      'https://wsshippertest.dpd.nl/PublicApi/services/ShipmentService/V3_5/',
      'https://wsshippertest.dpd.nl/PublicApi/services/ShipmentService/V3_3/',
      'https://wsshippertest.dpd.nl/soap/services/ShipmentService/V3_5/',
      'https://wsshippertest.dpd.nl/services/ShipmentService/V35',
      'https://wsshippertest.dpd.nl/services/ShipmentService/V3_5',
      'https://wsshippertest.dpd.nl/soap/ShipmentServiceV35',
    ];
    const DPD_PRODUCTION_DEFAULT_ENDPOINTS = [
      'https://wsshipper.dpd.nl/PublicApi/services/ShipmentService/V3_5/',
      'https://wsshipper.dpd.nl/PublicApi/services/ShipmentService/V3_3/',
      'https://wsshipper.dpd.nl/soap/services/ShipmentService/V3_5/',
      'https://wsshipper.dpd.nl/services/ShipmentService/V35',
      'https://wsshipper.dpd.nl/services/ShipmentService/V3_5',
      'https://wsshipper.dpd.nl/soap/ShipmentServiceV35',
    ];

    const normalizeDpdShipmentEndpoint = (value, fallback) => {
      const raw = String(value || '').trim();
      const normalizedFallback = String(fallback || '').trim();
      const endpoint = raw || normalizedFallback;
      if (!endpoint) return '';
      return endpoint.replace(/\/+$/, '');
    };

    const buildDpdEndpointVariants = (endpoint) => {
      const normalized = normalizeDpdShipmentEndpoint(endpoint, '');
      if (!normalized) return [];
      const variants = [normalized];
      if (/\/services\/ShipmentService\/V35$/i.test(normalized)) {
        variants.push(normalized.replace(/\/services\/ShipmentService\/V35$/i, '/services/ShipmentService/V3_5'));
        variants.push(normalized.replace(/\/services\/ShipmentService\/V35$/i, '/soap/ShipmentServiceV35'));
        variants.push(normalized.replace(/\/services\/ShipmentService\/V35$/i, '/soap/services/ShipmentService/V3_5/'));
      } else if (/\/services\/ShipmentService\/V3_5$/i.test(normalized)) {
        variants.push(normalized.replace(/\/services\/ShipmentService\/V3_5$/i, '/services/ShipmentService/V35'));
        variants.push(normalized.replace(/\/services\/ShipmentService\/V3_5$/i, '/soap/ShipmentServiceV35'));
        variants.push(normalized.replace(/\/services\/ShipmentService\/V3_5$/i, '/soap/services/ShipmentService/V3_5/'));
      } else if (/\/soap\/ShipmentServiceV35$/i.test(normalized)) {
        variants.push(normalized.replace(/\/soap\/ShipmentServiceV35$/i, '/services/ShipmentService/V35'));
        variants.push(normalized.replace(/\/soap\/ShipmentServiceV35$/i, '/services/ShipmentService/V3_5'));
        variants.push(normalized.replace(/\/soap\/ShipmentServiceV35$/i, '/soap/services/ShipmentService/V3_5/'));
      } else if (/\/soap\/services\/ShipmentService\/V3_5\/?$/i.test(normalized)) {
        variants.push(normalized.replace(/\/soap\/services\/ShipmentService\/V3_5\/?$/i, '/services/ShipmentService/V35'));
        variants.push(normalized.replace(/\/soap\/services\/ShipmentService\/V3_5\/?$/i, '/services/ShipmentService/V3_5'));
        variants.push(normalized.replace(/\/soap\/services\/ShipmentService\/V3_5\/?$/i, '/soap/ShipmentServiceV35'));
      } else {
        variants.push(`${normalized}/services/ShipmentService/V35`);
        variants.push(`${normalized}/services/ShipmentService/V3_5`);
        variants.push(`${normalized}/soap/ShipmentServiceV35`);
        variants.push(`${normalized}/soap/services/ShipmentService/V3_5/`);
      }
      return variants;
    };

    const getDpdAuthToken = async (credentials) => {
      const endpoint = credentials.sandbox === true
        ? 'https://wsshippertest.dpd.nl/soap/services/LoginService/V2_0'
        : 'https://wsshipper.dpd.nl/soap/services/LoginService/V2_0';

      const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                      xmlns:auth="http://dpd.com/common/service/types/LoginService/2.0">
      <soapenv:Body>
        <auth:getAuth>
          <delisId>${credentials.delisId}</delisId>
          <password>${credentials.password}</password>
          <messageLanguage>nl_NL</messageLanguage>
        </auth:getAuth>
      </soapenv:Body>
    </soapenv:Envelope>`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': 'getAuth' },
        body: soapBody,
      });

      const text = await response.text();
      if (!response.ok) throw new Error(`DPD Login failed: ${text}`);

      const match = text.match(/<authToken>(.*?)<\/authToken>/);
      if (!match) throw new Error(`DPD Login did not return token: ${text}`);

      return match[1];
    };

    const extractLabelBase64 = (soapResponse) => {
      const tags = ['labelData', 'parcelLabel', 'label', 'pdfData', 'labelPdf', 'parcellabelsPDF'];
      for (const tag of tags) {
        const match = soapResponse.match(new RegExp(`<(?:\\w+:)?${tag}>([A-Za-z0-9+/=\\r\\n]+)</(?:\\w+:)?${tag}>`, 'i'));
        if (match?.[1]) return match[1].replace(/\s+/g, '');
      }
      return null;
    };

    const getWeGrowBaseUrl = (credentials) => {
      const sandboxDefault = process.env.WEGROW_SANDBOX_URL || 'https://api-sandbox.wegrow.eu';
      const productionDefault = process.env.WEGROW_PRODUCTION_URL || 'https://api.wegrow.eu';
      const useSandbox = credentials.sandbox === true || credentials.environment === 'sandbox';

      const normalizeBaseUrl = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return raw;
        return raw.replace(/\/+$/, '').replace(/\/shipments\/labels$/i, '').replace(/\/shipments$/i, '');
      };

      if (credentials.baseUrl) return normalizeBaseUrl(credentials.baseUrl);
      if (process.env.WEGROW_BASE_URL) return normalizeBaseUrl(process.env.WEGROW_BASE_URL);
      return useSandbox ? sandboxDefault : productionDefault;
    };

    const getLabelMimeType = (format = 'pdf') => {
      const normalized = String(format).toLowerCase();
      if (normalized === 'pdf') return 'application/pdf';
      if (normalized === 'png') return 'image/png';
      return 'application/octet-stream';
    };

    // ===== DPD =====
    if (carrier.carrierType === 'dpd') {
      const credentials = parseCredentialsSafely(carrier.credentials);
      const delisId = String(credentials.delisId || credentials.username || '').trim();
      const password = String(credentials.password || '').trim();
      const depotNumber = String(credentials.depotNumber || '').trim();
      const isSandbox = credentials.sandbox === true;

      if (!delisId || !password || !depotNumber) {
        return res.status(400).json({
          error: 'DPD credentials zijn incompleet',
          details: 'Vereist: Delis ID, password en depotnummer.',
        });
      }

      let authToken;
      try {
        authToken = await getDpdAuthToken({ delisId, password, sandbox: isSandbox });
      } catch (loginError) {
        console.error('DPD LOGIN FAILED:', loginError.message);
        return res.status(502).json({ error: 'DPD login failed', details: loginError.message });
      }

      const endpoint = isSandbox
        ? 'https://wsshippertest.dpd.nl/soap/services/ShipmentService/V3_5'
        : 'https://wsshipper.dpd.nl/soap/services/ShipmentService/V3_5';

      const buildSoap = (pkg) => {
        const rawWeightGrams = Number(pkg.weight || 1000);
        const weightKgInt = Number.isFinite(rawWeightGrams) && rawWeightGrams > 0
          ? Math.max(1, Math.round(rawWeightGrams / 1000))
          : 1;

        return `<?xml version="1.0" encoding="UTF-8"?>
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                    xmlns:auth="http://dpd.com/common/service/types/Authentication/2.0"
                    xmlns:ship="http://dpd.com/common/service/types/ShipmentService/3.5">
    <soapenv:Header>
      <auth:authentication>
        <delisId>${delisId}</delisId>
        <authToken>${authToken}</authToken>
        <messageLanguage>nl_NL</messageLanguage>
      </auth:authentication>
    </soapenv:Header>
    <soapenv:Body>
      <ship:storeOrders>
        <printOptions>
          <printerLanguage>PDF</printerLanguage>
          <paperFormat>A6</paperFormat>
        </printOptions>
        <order>
          <generalShipmentData>
            <sendingDepot>${depotNumber}</sendingDepot>
            <product>CL</product>
            <sender>
              <name1>Sender Company</name1>
              <street>Warehouse Street 1</street>
              <country>NL</country>
              <zipCode>1012AB</zipCode>
              <city>Amsterdam</city>
            </sender>
            <recipient>
              <name1>${pkg.customerName || 'Recipient'}</name1>
              <street>${pkg.street || pkg.address}</street>
              <country>${pkg.country || 'NL'}</country>
              <zipCode>${pkg.zipCode}</zipCode>
              <city>${pkg.city}</city>
            </recipient>
          </generalShipmentData>
          <parcels>
            <customerReferenceNumber1>${pkg.orderNumber || pkg.id}</customerReferenceNumber1>
            <weight>${weightKgInt}</weight>
          </parcels>
          <productAndServiceData>
            <orderType>consignment</orderType>
          </productAndServiceData>
        </order>
      </ship:storeOrders>
    </soapenv:Body>
  </soapenv:Envelope>`;
      };

      const extractBetween = (xml, tag) => {
        const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
        return match ? match[1].trim() : null;
      };

      const labels = [];

      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i] || {};
        let recipientAddress;
        try {
          recipientAddress = buildDpdRecipientAddress(pkg);
        } catch (addressError) {
          return res.status(400).json({
            error: 'Ongeldig afleveradres voor DPD',
            details: addressError.message,
            packageId: pkg.id || i,
          });
        }

        const soapBody = buildSoap({
          ...pkg,
          street: recipientAddress.street,
          city: recipientAddress.city,
          country: recipientAddress.country,
          zipCode: recipientAddress.zipCode,
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': 'http://dpd.com/common/service/types/ShipmentService/3.5/storeOrders',
          },
          body: soapBody,
        });

        const responseText = await response.text();
        console.log("DPD STATUS:", response.status);
        console.log("DPD RESPONSE:", responseText);

        if (!response.ok || responseText.includes('<Fault>')) {
          return res.status(502).json({ error: 'DPD label request failed', details: responseText.slice(0, 2000) });
        }

        const labelBase64 =
          extractLabelBase64(responseText) ||
          extractBetween(responseText, 'label') ||
          extractBetween(responseText, 'parcelLabel') ||
          extractBetween(responseText, 'labelData') ||
          extractBetween(responseText, 'parcellabelsPDF');

        if (!labelBase64) {
          return res.status(502).json({ error: 'DPD response did not contain label PDF', details: responseText.slice(0, 2000) });
        }

        const trackingNumber =
          extractBetween(responseText, 'parcelLabelNumber') ||
          extractBetween(responseText, 'trackingNumber');

        labels.push({
          packageId: pkg.id || i,
          carrierType: 'dpd',
          shippingMethod: selectedShippingMethod,
          trackingCode: trackingNumber || `DPD-${Date.now()}-${i}`,
          labelUrl: `data:application/pdf;base64,${labelBase64}`,
        });
      }

      await persistOrderShippingMethodAndLabels(labels);

      // For return shipments without orderId, resolve any remaining base64 labels
      const isDpdReturn = (packages || []).some((pkg) => pkg.isReturn === true);
      if (isDpdReturn) {
        for (let i = 0; i < labels.length; i++) {
          const label = labels[i];
          if (label.labelUrl && label.labelUrl.startsWith('data:')) {
            const resolvedUrl = await resolveStoredLabelUrl(label.labelUrl, `dpd-return-${Date.now()}-${i}`);
            if (resolvedUrl) labels[i].labelUrl = resolvedUrl;
          }
        }
      }

      return res.json({ success: true, labels });
    }

    // ===== WEGROW =====
    if (carrier.carrierType === 'wegrow') {
      const credentials = normalizeWeGrowCredentials(parseCredentialsSafely(carrier.credentials));
      const { apiKey } = getWeGrowAuthConfig(credentials);
      const normalizedSelectedShippingMethod = String(selectedShippingMethod || '').trim().toLowerCase();
      const explicitSelectedWeGrowCarrier = String(wegrowCarrier || '').trim().toLowerCase();
      const selectedWeGrowCarrier = explicitSelectedWeGrowCarrier
        || (normalizedSelectedShippingMethod.startsWith('wegrow-')
          ? normalizedSelectedShippingMethod.replace('wegrow-', '').trim()
          : '')
        || (Object.prototype.hasOwnProperty.call(WEGROW_SERVICE_OPTIONS, normalizedSelectedShippingMethod)
          ? normalizedSelectedShippingMethod
          : '');

      const serviceCodeMapFromCredentials = normalizeWeGrowServiceCodeMap(
        credentials.serviceCodes || credentials.serviceCodeMap || credentials.serviceCodeByOption
      );
      const serviceCodeByCarrier = {
        dhl: credentials.dhlServiceCode,
        postnl: credentials.postnlServiceCode,
        bpost: credentials.bpostServiceCode,
        dpd: credentials.dpdServiceCode,
        'dhl-nl': credentials.dhlNlServiceCode,
        'dhl-for-you-envelop': credentials.dhlForYouEnvelopServiceCode,
        'dhl-for-you-brievenbuspakje': credentials.dhlForYouBrievenbuspakjeServiceCode,
        'dhl-for-you': credentials.dhlForYouServiceCode,
        'postnl-nederland-brievenbuspakketje-0-2kg': credentials.postnlNederlandBrievenbuspakketje02kgServiceCode,
        'postnl-belgie-standaard-0-23kg': credentials.postnlBelgieStandaard023kgServiceCode,
        'dpd-standaard': credentials.dpdServiceCode,
      };
      const selectedServiceOption = selectedWeGrowCarrier ? WEGROW_SERVICE_OPTIONS[selectedWeGrowCarrier] : null;
      const optionFallbackServiceCode = selectedServiceOption
        ? (selectedServiceOption.fallbackServiceKeys || []).find((key) => {
          const normalizedKey = String(key || '').trim();
          if (!normalizedKey) return false;
          const candidate = serviceCodeByCarrier[normalizedKey];
          return Boolean(String(candidate || '').trim());
        })
        : null;
      const optionFallbackServiceCodeValue = optionFallbackServiceCode
        ? String(serviceCodeByCarrier[optionFallbackServiceCode]).trim()
        : '';
      const selectedCarrierServiceCode = selectedWeGrowCarrier
        ? (
          serviceCodeMapFromCredentials[selectedWeGrowCarrier]
          || (serviceCodeByCarrier[selectedWeGrowCarrier] ? String(serviceCodeByCarrier[selectedWeGrowCarrier]).trim() : '')
          || optionFallbackServiceCodeValue
          || selectedServiceOption?.defaultServiceCode
          || ''
        )
        : '';
      const genericServiceCode = String(credentials.serviceCode || '').trim();

      // Determine whether any per-carrier service codes have been explicitly configured.
      // When NONE are set the contract is a legacy single-service-code setup: allow the
      // generic serviceCode to act as a universal fallback so existing contracts keep
      // working without requiring migration to the new per-carrier fields.
      // When at least one per-carrier code IS set, disable the generic fallback to prevent
      // accidentally routing a DHL shipment with a DPD service code (or vice-versa).
      const hasAnyCarrierSpecificCode = Boolean(
        (credentials.dhlServiceCode && String(credentials.dhlServiceCode).trim()) ||
        (credentials.postnlServiceCode && String(credentials.postnlServiceCode).trim()) ||
        (credentials.dpdServiceCode && String(credentials.dpdServiceCode).trim()) ||
        Object.keys(serviceCodeMapFromCredentials).length > 0
      );

      // Check if any package is a return shipment
      const isReturnShipment = (packages || []).some((pkg) => pkg.isReturn === true);

      // For return shipments, use the returnServiceCode if available
      const returnServiceCode = String(credentials.returnServiceCode || '').trim();
      const resolvedServiceCode = selectedWeGrowCarrier
        ? (selectedCarrierServiceCode || (!hasAnyCarrierSpecificCode ? genericServiceCode : ''))
        : genericServiceCode;
      const serviceCode = isReturnShipment && returnServiceCode ? returnServiceCode : resolvedServiceCode;

      const getPackageServiceCode = (pkg = {}) => {
        const destinationCountry = normalizeCountryToIso2(pkg.country || pkg.shippingCountry || pkg.shipmentDetails?.countryCode || 'NL') || 'NL';

        if (selectedWeGrowCarrier === 'postnl-belgie-standaard-0-23kg' && destinationCountry === 'BE' && pkg.isReturn !== true) {
          return 'wegrow_home_economy';
        }

        if (selectedWeGrowCarrier === 'dpd-standaard' && destinationCountry === 'NL' && pkg.isReturn !== true) {
          return 'wegrow_home_economy';
        }

        const standardServiceCode = resolveWeGrowStandardServiceCode(destinationCountry, {
          selectedCarrier: selectedWeGrowCarrier,
          isReturnShipment: pkg.isReturn === true,
        });

        if (pkg.isReturn === true && returnServiceCode) {
          return returnServiceCode;
        }

        if (selectedWeGrowCarrier) {
          return standardServiceCode || selectedCarrierServiceCode || (!hasAnyCarrierSpecificCode ? genericServiceCode : '');
        }

        return standardServiceCode || genericServiceCode;
      };

      const hasAnyPackageServiceCode = Array.isArray(packages) && packages.some((pkg) => Boolean(getPackageServiceCode(pkg)));

      if (!apiKey) {
        return res.status(400).json({
          error: 'WeGrow x-key ontbreekt',
          details: 'Voor label generatie is WeGrow API Key (x-key) verplicht.',
        });
      }

      if (selectedWeGrowCarrier && !Object.prototype.hasOwnProperty.call(WEGROW_SERVICE_OPTIONS, selectedWeGrowCarrier)) {
        return res.status(400).json({
          error: 'Ongeldige WeGrow verzendoptie.',
          details: `Kies een geldige optie: ${Object.keys(WEGROW_SERVICE_OPTIONS).join(', ')}`,
        });
      }

      if (!serviceCode && !hasAnyPackageServiceCode) {
        return res.status(400).json({
          error: 'WeGrow service code ontbreekt',
          details: selectedWeGrowCarrier
            ? `Geen service code gevonden voor WeGrow optie ${selectedServiceOption?.label || selectedWeGrowCarrier.toUpperCase()}.`
            : 'Stel een algemene WeGrow service code in, of gebruik de standaard service code mapping voor het land van bestemming.',
        });
      }

      const baseUrl = getWeGrowBaseUrl(credentials).replace(/\/+$/, '');
      const apiVersion = String(credentials.apiVersion || 'v1').trim().toLowerCase() || 'v1';

      const senderName = String(credentials.senderName || 'Dropsyncr Warehouse').trim();
      const senderCountry = String(credentials.senderCountry || 'NL').trim().toUpperCase() || 'NL';
      const senderStreet = String(credentials.senderStreet || 'Warehouse Street 1').trim();
      const senderPostalCode = normalizePostalCode(credentials.senderPostalCode || credentials.senderZipCode || '1012AB', senderCountry);
      const senderCity = String(credentials.senderCity || 'Amsterdam').trim();
      const senderEmail = credentials.senderEmail || 'operations@dropsyncr.local';
      const senderPhone = credentials.senderPhone || '+31000000000';

      const labels = [];

      for (let index = 0; index < (packages || []).length; index += 1) {
        const pkg = packages[index] || {};
        const isReturnPkg = pkg.isReturn === true;
        const address = parseAddress(pkg.address || '');
        const shipmentDetails = pkg.shipmentDetails || pkg.shippingAddress || {};
        const recipientName = pkg.customerName || shipmentDetails.fullName || shipmentDetails.firstName || 'Recipient';
        const destinationCountry = String(pkg.country || pkg.shippingCountry || shipmentDetails.countryCode || 'NL').trim().toUpperCase() || 'NL';
        let parsedRecipientAddress = null;
        try {
          parsedRecipientAddress = buildDpdRecipientAddress({ ...pkg, country: destinationCountry });
        } catch {
          parsedRecipientAddress = null;
        }
        const shipmentStreet = [shipmentDetails.streetName, shipmentDetails.houseNumber, shipmentDetails.houseNumberExtension]
          .filter(Boolean).join(' ').trim();
        const destinationStreet = String(
          pkg.street || pkg.addressLine1 || pkg.shippingStreet || shipmentStreet ||
          shipmentDetails.addressLine1 || shipmentDetails.street || parsedRecipientAddress?.street ||
          address.street || pkg.address || ''
        ).trim();
        const destinationPostalCode = normalizePostalCode(
          pkg.zipCode || pkg.postalCode || pkg.shippingZipCode ||
          shipmentDetails.zipCode || shipmentDetails.postalCode ||
          parsedRecipientAddress?.zipCode || address.zipCode,
          destinationCountry
        );
        const destinationCity = String(
          pkg.city || pkg.town || pkg.shippingCity ||
          shipmentDetails.city || shipmentDetails.town ||
          parsedRecipientAddress?.city || address.city || ''
        ).trim();
        const hasPlaceholderPostalCode = destinationPostalCode === '0000AA' || destinationPostalCode === '0000';

        // For non-return shipments, validate destination address
        if (!isReturnPkg && (!destinationStreet || !destinationPostalCode || !destinationCity || hasPlaceholderPostalCode)) {
          return res.status(400).json({
            error: 'WeGrow ontvangeradres is incompleet',
            details: `Order ${String(pkg.orderNumber || pkg.id || index)} mist een geldige straat, postcode of plaats voor labelgeneratie.`,
            packageId: pkg.id || index,
            address: { street: destinationStreet || null, postalCode: destinationPostalCode || null, city: destinationCity || null, country: destinationCountry, rawAddress: String(pkg.address || '').trim() || null },
          });
        }

        if (!isReturnPkg && destinationCountry === 'NL' && !/^\d{4}[A-Z]{2}$/.test(destinationPostalCode)) {
          return res.status(400).json({
            error: 'WeGrow ontvangerpostcode is ongeldig',
            details: `Order ${String(pkg.orderNumber || pkg.id || index)} heeft geen geldige Nederlandse postcode. Verwacht formaat: 1234AB.`,
            packageId: pkg.id || index,
            postalCode: destinationPostalCode,
          });
        }

        const weightValue = Number(pkg.weightKg ?? pkg.weight ?? 1);
        const packageServiceCode = getPackageServiceCode(pkg);

        if (!packageServiceCode) {
          return res.status(400).json({
            error: 'WeGrow service code ontbreekt',
            details: `Geen WeGrow service code gevonden voor order ${String(pkg.orderNumber || pkg.id || index)} en land ${destinationCountry}.`,
            packageId: pkg.id || index,
            country: destinationCountry,
          });
        }

        // For return shipments: customer is origin (sender), warehouse is destination (receiver)
        // senderStreet/senderZipCode/senderCity/senderCountry are set explicitly on returnPackage from frontend
        const originAddress = isReturnPkg ? {
          address: {
            name: pkg.senderName || recipientName,
            street: String(pkg.senderStreet || '').trim(),
            postal_code: normalizePostalCode(String(pkg.senderZipCode || '').trim(), String(pkg.senderCountry || 'NL').trim().toUpperCase()),
            city: String(pkg.senderCity || '').trim(),
            iso_country: String(pkg.senderCountry || 'NL').trim().toUpperCase(),
          },
          contact: {
            name: pkg.senderName || recipientName,
            email: pkg.senderEmail || null,
            mobile: pkg.senderPhone || null,
          },
        } : {
          address: { name: senderName, street: senderStreet, postal_code: senderPostalCode, city: senderCity, iso_country: senderCountry },
          contact: { name: senderName, email: senderEmail, mobile: senderPhone },
        };

        // For return: destination = warehouse (street/zipCode/city/country set from warehouseAddress on frontend)
        const destinationAddressObj = isReturnPkg ? {
          address: {
            name: pkg.customerName || senderName,
            street: String(pkg.street || senderStreet).trim(),
            postal_code: normalizePostalCode(String(pkg.zipCode || senderPostalCode).trim(), String(pkg.country || senderCountry).trim().toUpperCase()),
            city: String(pkg.city || senderCity).trim(),
            iso_country: String(pkg.country || senderCountry).trim().toUpperCase(),
          },
          contact: {
            name: pkg.customerName || senderName,
            email: pkg.email || senderEmail || null,
            mobile: pkg.phone || senderPhone || null,
          },
        } : {
          address: { name: recipientName, street: destinationStreet, postal_code: destinationPostalCode, city: destinationCity, iso_country: destinationCountry },
          contact: { name: recipientName, email: pkg.email || shipmentDetails.email || null, mobile: pkg.phone || shipmentDetails.phoneNumber || null },
        };

        const payload = {
          label_format: credentials.labelFormat || 'pdf',
          service: { code: packageServiceCode },
          shipment: {
            references: {
              order_reference: String(pkg.orderNumber || pkg.id || `ORD-${Date.now()}-${index}`),
              receiver_reference: pkg.reference2 ? String(pkg.reference2) : null,
            },
            addresses: {
              origin: originAddress,
              destination: destinationAddressObj,
            },
            parcels: [
              {
                uuid_ref: String(pkg.id || `parcel-${Date.now()}-${index}`),
                weight: {
                  value: Number.isFinite(weightValue) && weightValue > 0 ? weightValue : 1,
                  unit: credentials.weightUnit || 'kg',
                },
                package_type: pkg.packageType || 'box',
                goods_description: pkg.goodsDescription || 'General goods',
              },
            ],
          },
          tracking_event_tags: {
            installation_id: String(carrier.installationId),
            carrier_id: String(carrier.id),
          },
        };

        const response = await fetch(`${baseUrl}/shipments/labels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-key': apiKey, 'x-version': apiVersion },
          body: JSON.stringify(payload),
        });

        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          const responseStatus = Number(response?.status || 0);
          const likelyAuthIssue = responseStatus === 401 || responseStatus === 403;
          const normalizedErrorDetail = stringifyApiErrorDetail(responseData?.detail || responseData?.error || responseData);

          let diagnosticDetails = null;
          if (likelyAuthIssue) {
            try {
              const diagnosticResponse = await fetch(`${baseUrl}/locations?iso_country=NL&city=Amsterdam&postal_code=1012%20PH&max_results=1`, {
                method: 'GET',
                headers: { 'x-key': apiKey, 'x-version': apiVersion },
              });
              const diagnosticBodyText = await diagnosticResponse.text();
              let diagnosticBody = null;
              try { diagnosticBody = diagnosticBodyText ? JSON.parse(diagnosticBodyText) : null; } catch { diagnosticBody = diagnosticBodyText || null; }
              diagnosticDetails = {
                endpoint: '/locations',
                statusCode: diagnosticResponse.status,
                body: typeof diagnosticBody === 'string' ? diagnosticBody.slice(0, 300) : diagnosticBody,
              };
            } catch (diagnosticError) {
              diagnosticDetails = { endpoint: '/locations', statusCode: null, body: String(diagnosticError?.message || 'Diagnostic request failed') };
            }
          }

          const diagnosticSummary = diagnosticDetails ? ` | diagnostic ${diagnosticDetails.endpoint} status=${diagnosticDetails.statusCode ?? 'n/a'}` : '';

          return res.status(502).json({
            error: 'Failed to generate WeGrow label',
            details: `${normalizedErrorDetail || (likelyAuthIssue ? 'Unauthorized - controleer WeGrow API key (x-key), live endpoint, API version (v1) en service code permissies' : 'Unknown WeGrow error')}${diagnosticSummary}`,
            statusCode: responseStatus || null,
            baseUrl,
            serviceCode: packageServiceCode,
            selectedWeGrowCarrier: selectedWeGrowCarrier || null,
            usedHeaders: ['x-key', 'x-version'],
            diagnostic: diagnosticDetails,
          });
        }

        const shippingLabels = responseData?.labels?.shipping_labels || [];
        const paperlessLabel = responseData?.labels?.paperless_digital_label;
        const firstLabel = shippingLabels[0] || paperlessLabel;

        if (!firstLabel?.base64_label) {
          return res.status(502).json({ error: 'WeGrow label response did not include a label' });
        }

        const format = firstLabel.format || payload.label_format || 'pdf';
        const mimeType = getLabelMimeType(format);

        labels.push({
          packageId: pkg.id || index,
          carrierType: carrier.carrierType,
          shippingMethod: selectedShippingMethod || selectedWeGrowCarrier || packageServiceCode,
          trackingCode: firstLabel.carrier_tracking_id || `${carrier.carrierType.toUpperCase()}-${Date.now()}-${index}`,
          labelUrl: `data:${mimeType};base64,${firstLabel.base64_label}`,
          trackingUrl: firstLabel.carrier_tracking_url || null,
          shipmentId: responseData?.id || null,
        });
      }

      await persistOrderShippingMethodAndLabels(labels);

      // For return shipments without orderId, resolve any remaining base64 labels
      if (isReturnShipment) {
        for (let i = 0; i < labels.length; i++) {
          const label = labels[i];
          if (label.labelUrl && label.labelUrl.startsWith('data:')) {
            const resolvedUrl = await resolveStoredLabelUrl(label.labelUrl, `wegrow-return-${Date.now()}-${i}`);
            if (resolvedUrl) labels[i].labelUrl = resolvedUrl;
          }
        }
      }

      return res.json({ success: true, labels });
    }

    // Fallback
    const labels = (packages || []).map((pkg, index) => ({
      packageId: pkg.id || index,
      carrierType: carrier.carrierType,
      shippingMethod: selectedShippingMethod,
      trackingCode: `${carrier.carrierType.toUpperCase()}-${Date.now()}-${index}`,
      labelUrl: null,
    }));

    await persistOrderShippingMethodAndLabels(labels);
    res.json({ success: true, labels });

  } catch (error) {
    console.error('Generate carrier labels error:', error);
    const errorMessage = String(error?.message || 'Failed to generate labels');
    const isMissingShippingMethodColumn = errorMessage.includes('Unknown column') && errorMessage.includes('shippingMethod');
    if (isMissingShippingMethodColumn) {
      return res.status(500).json({
        error: 'Failed to persist shipping method on order',
        details: 'Kolom shippingMethod ontbreekt in de Order tabel. Voer de migratie uit en probeer opnieuw.',
      });
    }
    res.status(500).json({ error: 'Failed to generate labels', details: errorMessage });
  }
};