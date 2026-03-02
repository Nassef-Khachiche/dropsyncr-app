import prisma from '../config/database.js';
import fetch from 'node-fetch';

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

  if (credentials.apiKey === undefined) credentials.apiKey = credentials.xKey ?? credentials.key ?? credentials.api_key;
  if (credentials.baseUrl === undefined) credentials.baseUrl = credentials.base_url;
  if (credentials.apiVersion === undefined) credentials.apiVersion = credentials.xVersion ?? credentials.version ?? credentials.x_version;
  if (credentials.serviceCode === undefined) credentials.serviceCode = credentials.service_code;

  if (credentials.apiKey !== undefined) credentials.apiKey = trimMaybe(credentials.apiKey);
  if (credentials.baseUrl !== undefined) credentials.baseUrl = trimMaybe(credentials.baseUrl);
  if (credentials.apiVersion !== undefined) credentials.apiVersion = trimMaybe(credentials.apiVersion);
  if (credentials.serviceCode !== undefined) credentials.serviceCode = trimMaybe(credentials.serviceCode);
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
  const credentials = rawCredentials || {};

  const apiKey = normalize(
    credentials.apiKey ||
    credentials.xKey ||
    credentials.key ||
    process.env.WEGROW_API_KEY
  );
  const sanitizedApiKey = apiKey.replace(/^bearer\s+/i, '').trim();

  let bearerToken = normalize(
    credentials.bearerToken ||
    credentials.authToken ||
    credentials.token ||
    process.env.WEGROW_BEARER_TOKEN
  );

  if (!bearerToken && /^bearer\s+/i.test(apiKey)) {
    bearerToken = sanitizedApiKey;
  }

  const headers = {
    ...(sanitizedApiKey && { 'x-key': sanitizedApiKey, 'x-api-key': sanitizedApiKey }),
    ...(bearerToken && { Authorization: `Bearer ${bearerToken}` }),
  };

  return { apiKey: sanitizedApiKey, bearerToken, headers };
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
      console.warn('Skipping normalized credential persistence due to column length limit', {
        carrierId,
      });
      return;
    }
    throw error;
  }
};

export const getCarriers = async (req, res) => {
  try {
    const { installationId } = req.query;

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const carriers = await prisma.carrier.findMany({
      where: {
        installationId: parseInt(installationId),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse credentials JSON
    const carriersWithParsedCredentials = carriers.map((carrier) => {
      const parsedCredentials = parseCredentialsSafely(carrier.credentials);
      const normalizedCredentials = normalizeCarrierCredentials(carrier.carrierType, parsedCredentials);
      return {
        ...carrier,
        credentials: normalizedCredentials,
      };
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

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
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

    res.status(201).json({
      ...carrier,
      credentials: JSON.parse(carrier.credentials),
    });
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

    res.json({
      ...carrier,
      credentials: JSON.parse(carrier.credentials),
    });
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

    await prisma.carrier.delete({
      where: { id: parseInt(id) },
    });

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

    const carrier = await prisma.carrier.findUnique({
      where: { id: parseInt(id) },
    });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: carrier.installationId,
        },
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

      const probeEndpoints = [
        `${baseUrl}/shipments?limit=1`,
        `${baseUrl}/shipments`,
      ];

      for (const endpoint of probeEndpoints) {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...weGrowAuthHeaders,
            'x-version': apiVersion,
          },
        });

        const rawBody = await response.text();
        let parsedBody = null;
        try {
          parsedBody = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          parsedBody = null;
        }

        const detail = parsedBody?.detail || parsedBody?.error || rawBody || null;

        if (response.status === 401 || response.status === 403) {
          return res.json({
            success: false,
            message: 'WeGrow authenticatie mislukt',
            details: detail || 'Unauthorized',
          });
        }

        if (response.ok) {
          return res.json({
            success: true,
            message: 'WeGrow authenticatie succesvol',
          });
        }

        if (response.status >= 400 && response.status < 500) {
          return res.json({
            success: true,
            message: `WeGrow authenticatie succesvol (HTTP ${response.status})`,
            details: detail,
          });
        }
      }

      return res.json({
        success: false,
        message: 'WeGrow verbindingstest mislukt',
        details: 'Geen geldig antwoord van WeGrow ontvangen',
      });
    }

    return res.json({
      success: false,
      message: 'Carrier type wordt momenteel niet ondersteund',
    });
  } catch (error) {
    console.error('Test carrier error:', error);
    res.status(500).json({ success: false, error: 'Failed to test carrier' });
  }
};

export const generateCarrierLabels = async (req, res) => {
  try {
    const { id } = req.params;
    const { packages = [], shippingMethod } = req.body;

    const carrier = await prisma.carrier.findUnique({
      where: { id: parseInt(id) },
    });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    if (!carrier.active) {
      return res.status(400).json({ error: 'Carrier contract is inactive' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: carrier.installationId,
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    if (!['dhl', 'dpd', 'wegrow'].includes(carrier.carrierType)) {
      return res.status(400).json({ error: 'Carrier type not supported for labels' });
    }

    const selectedShippingMethod = String(shippingMethod || carrier.id || '').trim() || null;

    const persistOrderShippingMethodAndLabels = async (generatedLabels = []) => {
      const packageList = Array.isArray(packages) ? packages : [];
      if (packageList.length === 0) return;

      const orderNumbersFromPackages = Array.from(
        new Set(
          packageList
            .map((pkg) => {
              const explicitOrderNumber = String(pkg?.orderNumber || '').trim();
              if (explicitOrderNumber) return explicitOrderNumber;

              const packageId = pkg?.id;
              if (typeof packageId === 'string') {
                const normalizedPackageId = packageId.trim();
                if (normalizedPackageId) return normalizedPackageId;
              }

              return null;
            })
            .filter(Boolean)
        )
      );

      const ordersByOrderNumber = new Map();
      if (orderNumbersFromPackages.length > 0) {
        const matchingOrders = await prisma.order.findMany({
          where: {
            installationId: carrier.installationId,
            orderNumber: { in: orderNumbersFromPackages },
          },
          select: {
            id: true,
            orderNumber: true,
          },
        });

        matchingOrders.forEach((order) => {
          ordersByOrderNumber.set(order.orderNumber, order.id);
        });
      }

      const resolvedPackages = [];
      for (let index = 0; index < packageList.length; index += 1) {
        const pkg = packageList[index] || {};
        const parsedOrderId = Number(pkg.orderId);

        let orderId = Number.isInteger(parsedOrderId) && parsedOrderId > 0
          ? parsedOrderId
          : null;

        if (!orderId) {
          const orderNumberKey = String(pkg.orderNumber || pkg.id || '').trim();
          if (orderNumberKey && ordersByOrderNumber.has(orderNumberKey)) {
            orderId = ordersByOrderNumber.get(orderNumberKey);
          }
        }

        if (!orderId) continue;

        resolvedPackages.push({
          orderId,
          generatedLabel: generatedLabels[index] || null,
        });
      }

      if (resolvedPackages.length === 0) return;

      const shippingMethodColumnRows = await prisma.$queryRaw`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Order'
          AND COLUMN_NAME = 'shippingMethod'
        LIMIT 1
      `;
      const hasShippingMethodColumn = Array.isArray(shippingMethodColumnRows) && shippingMethodColumnRows.length > 0;

      const operations = [
        ...resolvedPackages.map(({ orderId, generatedLabel }) => {
          const trackingCodeValue = String(generatedLabel?.trackingCode || '').trim();

          if (hasShippingMethodColumn) {
            return prisma.$executeRaw`
              UPDATE \`Order\`
              SET
                shippingMethod = ${selectedShippingMethod},
                supplierTracking = CASE
                  WHEN ${trackingCodeValue} = '' THEN supplierTracking
                  ELSE ${generatedLabel?.trackingCode || null}
                END,
                updatedAt = NOW()
              WHERE id = ${orderId} AND installationId = ${carrier.installationId}
            `;
          }

          return prisma.$executeRaw`
            UPDATE \`Order\`
            SET
              supplierTracking = CASE
                WHEN ${trackingCodeValue} = '' THEN supplierTracking
                ELSE ${generatedLabel?.trackingCode || null}
              END,
              updatedAt = NOW()
            WHERE id = ${orderId} AND installationId = ${carrier.installationId}
          `;
        }),
      ];

      const getPersistedLabelUrl = (labelUrl) => {
        const normalized = String(labelUrl || '').trim();
        if (!normalized) return null;

        if (normalized.startsWith('data:')) {
          return null;
        }

        return normalized.length <= 191 ? normalized : null;
      };

      resolvedPackages.forEach(({ orderId, generatedLabel }) => {
        const persistedLabelUrl = getPersistedLabelUrl(generatedLabel?.labelUrl);

        operations.push(
          prisma.label.upsert({
            where: { orderId },
            update: {
              carrierId: carrier.id,
              labelUrl: persistedLabelUrl,
              status: 'generated',
            },
            create: {
              orderId,
              carrierId: carrier.id,
              labelUrl: persistedLabelUrl,
              status: 'generated',
            },
          })
        );
      });

      await prisma.$transaction(operations);
    };

    const parseAddress = (address = '') => {
      const parts = String(address).split(',').map(p => p.trim()).filter(Boolean);
      let street = parts.length > 1 ? parts.slice(0, -1).join(', ') : parts[0] || '';
      let zipCode = '';
      let city = '';

      const last = parts[parts.length - 1] || '';
      const match = last.match(/(\d{4}\s?[A-Z]{2})\s+(.+)/i);
      if (match) {
        zipCode = match[1].replace(/\s+/g, '');
        city = match[2].trim();
      }

      return { street, zipCode, city };
    };

    const normalizePostalCode = (postalCode, country = 'NL') => {
      const raw = String(postalCode || '').trim();
      if (!raw) return '';

      const countryCode = String(country || 'NL').trim().toUpperCase();
      if (countryCode === 'NL') {
        const compact = raw.replace(/\s+/g, '').toUpperCase();
        return compact;
      }

      return raw.replace(/\s+/g, ' ').trim().toUpperCase();
    };

    const buildDpdRecipientAddress = (pkg) => {
      const address = parseAddress(pkg.address || '');
      const addressText = String(pkg.address || '').trim();
      const country = String(pkg.country || 'NL').trim().toUpperCase() || 'NL';
      let zipCode = normalizePostalCode(pkg.zipCode || address.zipCode, country);
      let city = String(pkg.city || address.city || '').trim();
      let street = String(pkg.street || '').trim();

      const addressParts = addressText
        .split(',')
        .map((part) => String(part || '').trim())
        .filter(Boolean);

      if (!street) {
        street = String(addressParts[0] || address.street || pkg.address || '').trim();
      }

      if ((!zipCode || !city) && addressText) {
        const escapedCountry = country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const withoutTrailingCountry = addressText
          .replace(new RegExp(`,?\\s*${escapedCountry}\\s*$`, 'i'), '')
          .trim();

        const nlMatch = withoutTrailingCountry.match(/(\d{4}\s?[A-Z]{2})\s+([^,]+)$/i);
        const intlMatch = withoutTrailingCountry.match(/(\d{4,6})\s+([^,]+)$/i);
        const intlPrefixedMatch = withoutTrailingCountry.match(/(?:[A-Z]{1,3}-)?(\d{4,6})\s+([^,]+)$/i);
        const cityThenZipMatch = withoutTrailingCountry.match(/([^,]+)\s+(?:[A-Z]{1,3}-)?(\d{4,6})$/i);
        const fallbackMatch = country === 'NL'
          ? (nlMatch || intlPrefixedMatch)
          : (nlMatch || intlPrefixedMatch || intlMatch);

        if (fallbackMatch) {
          if (!zipCode) zipCode = normalizePostalCode(fallbackMatch[1], country);
          if (!city) city = String(fallbackMatch[2] || '').trim();
        } else if (cityThenZipMatch) {
          if (!city) city = String(cityThenZipMatch[1] || '').trim();
          if (!zipCode) zipCode = normalizePostalCode(cityThenZipMatch[2], country);
        }

        if (!city) {
          const tailSegment = withoutTrailingCountry
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .pop();
          if (tailSegment && /[A-Za-zÀ-ÿ]/.test(tailSegment)) {
            city = tailSegment
              .replace(/(?:[A-Z]{1,3}-)?\d{4,6}/g, '')
              .trim();
          }
        }

        if (!zipCode) {
          const broadZipMatch = withoutTrailingCountry.match(/(?:^|[\s,.-])(?:[A-Z]{1,3}-)?(\d{4,6})(?=$|[\s,.-])/i);
          if (broadZipMatch?.[1]) {
            zipCode = normalizePostalCode(broadZipMatch[1], country);
          }
        }
      }

      if (!street) {
        throw new Error('Straat van ontvanger ontbreekt.');
      }

      if (!city) city = 'Unknown';

      if (!zipCode) {
        zipCode = country === 'NL' ? '0000AA' : '0000';
      }

      if (country === 'NL' && !/^\d{4}[A-Z]{2}$/.test(zipCode)) {
        throw new Error('Postcode van ontvanger is ongeldig voor NL (verwacht formaat 1234AB).');
      }

      return {
        street,
        city,
        country,
        zipCode,
      };
    };

    const escapeXml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

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

      if (!endpoint) {
        return '';
      }

      const withoutTrailingSlash = endpoint.replace(/\/+$/, '');
      return withoutTrailingSlash;
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
    const getDpdShipmentEndpoint = (credentials) => {
      const isSandbox = isTruthy(credentials?.sandbox) || String(credentials?.environment || '').toLowerCase() === 'sandbox';
      const sandboxEndpoint = normalizeDpdShipmentEndpoint(
        process.env.DPD_SHIPMENT_URL_SANDBOX,
        DPD_SANDBOX_DEFAULT_ENDPOINTS[0]
      );
      const productionEndpoint = normalizeDpdShipmentEndpoint(
        process.env.DPD_SHIPMENT_URL,
        DPD_PRODUCTION_DEFAULT_ENDPOINTS[0]
      );
      if (credentials?.endpointUrl) {
        return normalizeDpdShipmentEndpoint(credentials.endpointUrl, isSandbox ? sandboxEndpoint : productionEndpoint);
      }
      return isSandbox ? sandboxEndpoint : productionEndpoint;
    };

    const getDpdEndpointCandidates = (credentials) => {
      const toUnique = (items) => items.filter((value, index, arr) => value && arr.indexOf(value) === index);

      const isSandbox = isTruthy(credentials?.sandbox) || String(credentials?.environment || '').toLowerCase() === 'sandbox';

      const sandboxConfigured = normalizeDpdShipmentEndpoint(process.env.DPD_SHIPMENT_URL_SANDBOX, DPD_SANDBOX_DEFAULT_ENDPOINTS[0]);
      const productionConfigured = normalizeDpdShipmentEndpoint(process.env.DPD_SHIPMENT_URL, DPD_PRODUCTION_DEFAULT_ENDPOINTS[0]);
      const customConfigured = normalizeDpdShipmentEndpoint(credentials?.endpointUrl, '');

      const primaryBaseEndpoints = isSandbox
        ? [customConfigured, sandboxConfigured, ...DPD_SANDBOX_DEFAULT_ENDPOINTS]
        : [customConfigured, productionConfigured, ...DPD_PRODUCTION_DEFAULT_ENDPOINTS];

      const fallbackBaseEndpoints = isSandbox
        ? [productionConfigured, ...DPD_PRODUCTION_DEFAULT_ENDPOINTS]
        : [sandboxConfigured, ...DPD_SANDBOX_DEFAULT_ENDPOINTS];

      return toUnique([
        ...primaryBaseEndpoints.flatMap((endpoint) => buildDpdEndpointVariants(endpoint)),
        ...fallbackBaseEndpoints.flatMap((endpoint) => buildDpdEndpointVariants(endpoint)),
      ]);
    };

    const extractSoapFault = (soapResponse = '') => {
      const candidates = [
        /<(?:\w+:)?faultstring>([\s\S]*?)<\/(?:\w+:)?faultstring>/i,
        /<(?:\w+:)?errorMessage>([\s\S]*?)<\/(?:\w+:)?errorMessage>/i,
        /<(?:\w+:)?message>([\s\S]*?)<\/(?:\w+:)?message>/i,
        /<(?:\w+:)?Text>([\s\S]*?)<\/(?:\w+:)?Text>/i,
      ];

      const authErrorCode = soapResponse.match(/<(?:\w+:)?errorCode>([\s\S]*?)<\/(?:\w+:)?errorCode>/i)?.[1]?.replace(/\s+/g, ' ').trim();
      const authErrorMessage = soapResponse.match(/<(?:\w+:)?errorMessage>([\s\S]*?)<\/(?:\w+:)?errorMessage>/i)?.[1]?.replace(/\s+/g, ' ').trim();

      if (authErrorCode || authErrorMessage) {
        return [authErrorCode, authErrorMessage].filter(Boolean).join(': ');
      }

      let message = null;
      for (const regex of candidates) {
        const match = soapResponse.match(regex)?.[1];
        if (match) {
          message = match;
          break;
        }
      }

      if (!message && /<(?:\w+:)?Fault\b/i.test(soapResponse)) {
        message = 'SOAP Fault returned by DPD';
      }

      return message ? message.replace(/\s+/g, ' ').trim() : null;
    };

    const buildDpdSoapEnvelope = async (credentials, pkg) => {
      const delisId = String(credentials.delisId || credentials.username || '').trim();
      const authToken = await getDpdAuthToken(credentials);
      const sendingDepot = String(credentials.depotNumber || '').trim();

      const recipientName = pkg.customerName || 'Recipient';
      const recipientCountry = pkg.country || 'NL';
      const address = parseAddress(pkg.address || '');
      const zipCode = pkg.zipCode || address.zipCode || '0000AA';
      const city = pkg.city || address.city || 'Unknown';
      const street = pkg.street || address.street || pkg.address || 'Unknown';

      const reference1 = pkg.reference1 || pkg.orderNumber || pkg.id || 'Order';
      const reference2 = pkg.reference2 || pkg.trackingCode || '';
      const weight = String(pkg.weight || 500);
      const volume = String(pkg.volume || '000000000');

      const senderName1 = credentials.senderName1 || credentials.contractName || carrier.contractName || 'Dropsyncr';
      const senderName2 = credentials.senderName2 || '';
      const senderStreet = credentials.senderStreet || 'Warehouse Street 1';
      const senderStreet2 = credentials.senderStreet2 || '';
      const senderCountry = credentials.senderCountry || 'NL';
      const senderZipCode = credentials.senderZipCode || '1012AB';
      const senderCity = credentials.senderCity || 'Amsterdam';
      const senderPhone = credentials.senderPhone || '';
      const senderEmail = credentials.senderEmail || '';

      return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://dpd.com/common/service/types/Authentication/2.0" xmlns:ns1="http://dpd.com/common/service/types/ShipmentService/3.5">
  <soapenv:Header>
    <ns:authentication>
      <delisId>${escapeXml(delisId)}</delisId>
      <authToken>${escapeXml(authToken)}</authToken>
      <messageLanguage>nl_NL</messageLanguage>
    </ns:authentication>
  </soapenv:Header>
  <soapenv:Body>
    <ns1:storeOrders>
      <printOptions>
        <printerLanguage>PDF</printerLanguage>
        <paperFormat>A6</paperFormat>
      </printOptions>
      <order>
        <generalShipmentData>
          <sendingDepot>${escapeXml(sendingDepot)}</sendingDepot>
          <product>B2B</product>
          <sender>
            <name1>${escapeXml(senderName1)}</name1>
            <name2>${escapeXml(senderName2)}</name2>
            <street>${escapeXml(senderStreet)}</street>
            <street2>${escapeXml(senderStreet2)}</street2>
            <country>${escapeXml(senderCountry)}</country>
            <zipCode>${escapeXml(senderZipCode)}</zipCode>
            <city>${escapeXml(senderCity)}</city>
            <phone>${escapeXml(senderPhone)}</phone>
            <email>${escapeXml(senderEmail)}</email>
          </sender>
          <recipient>
            <name1>${escapeXml(recipientName)}</name1>
            <name2>${escapeXml(pkg.companyName || '')}</name2>
            <street>${escapeXml(street)}</street>
            <street2>${escapeXml(pkg.street2 || '')}</street2>
            <country>${escapeXml(recipientCountry)}</country>
            <zipCode>${escapeXml(zipCode)}</zipCode>
            <city>${escapeXml(city)}</city>
            <contact>${escapeXml(pkg.contact || recipientName)}</contact>
            <phone>${escapeXml(pkg.phone || '')}</phone>
            <email>${escapeXml(pkg.email || '')}</email>
          </recipient>
        </generalShipmentData>
        <parcels>
          <customerReferenceNumber1>${escapeXml(reference1)}</customerReferenceNumber1>
          <customerReferenceNumber2>${escapeXml(reference2)}</customerReferenceNumber2>
          <volume>${escapeXml(volume)}</volume>
          <weight>${escapeXml(weight)}</weight>
        </parcels>
        <productAndServiceData>
          <orderType>consignment</orderType>
        </productAndServiceData>
      </order>
    </ns1:storeOrders>
  </soapenv:Body>
</soapenv:Envelope>`;
    };

    const extractLabelBase64 = (soapResponse) => {
      const tags = [
        'labelData',
        'parcelLabel',
        'label',
        'pdfData',
        'labelPdf',
        'parcellabelsPDF',
      ];
      for (const tag of tags) {
        const match = soapResponse.match(new RegExp(`<(?:\\w+:)?${tag}>([A-Za-z0-9+/=\\r\\n]+)</(?:\\w+:)?${tag}>`, 'i'));
        if (match?.[1]) {
          return match[1].replace(/\s+/g, '');
        }
      }
      return null;
    };

    const getWeGrowBaseUrl = (credentials) => {
      const sandboxDefault = process.env.WEGROW_SANDBOX_URL || 'https://api-sandbox.wegrow.eu';
      const productionDefault = process.env.WEGROW_PRODUCTION_URL || 'https://api.wegrow.eu';
      const useSandbox = credentials.sandbox === true || credentials.environment === 'sandbox';

      if (credentials.baseUrl) {
        return credentials.baseUrl;
      }

      if (process.env.WEGROW_BASE_URL) {
        return process.env.WEGROW_BASE_URL;
      }

      return useSandbox ? sandboxDefault : productionDefault;
    };

    const getLabelMimeType = (format = 'pdf') => {
      const normalized = String(format).toLowerCase();
      if (normalized === 'pdf') return 'application/pdf';
      if (normalized === 'png') return 'image/png';
      return 'application/octet-stream';
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
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
          'SOAPAction': 'getAuth',
        },
        body: soapBody,
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(`DPD Login failed: ${text}`);
      }

      const match = text.match(/<authToken>(.*?)<\/authToken>/);
      if (!match) {
        throw new Error(`DPD Login did not return token: ${text}`);
      }

      return match[1];
    };

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

    // ✅ STEP 1: LOGIN TO GET AUTH TOKEN
    let authToken;
    try {
      authToken = await getDpdAuthToken({
        delisId,
        password,
        sandbox: isSandbox,
      });
    } catch (loginError) {
      console.error('DPD LOGIN FAILED:', loginError.message);
      return res.status(502).json({
        error: 'DPD login failed',
        details: loginError.message,
      });
    }

    // ✅ STEP 2: USE CORRECT SHIPMENT ENDPOINT
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
        return res.status(502).json({
          error: 'DPD label request failed',
          details: responseText.slice(0, 2000),
        });
      }

      const labelBase64 =
        extractLabelBase64(responseText) ||
        extractBetween(responseText, 'label') ||
        extractBetween(responseText, 'parcelLabel') ||
        extractBetween(responseText, 'labelData') ||
        extractBetween(responseText, 'parcellabelsPDF');

      if (!labelBase64) {
        return res.status(502).json({
          error: 'DPD response did not contain label PDF',
          details: responseText.slice(0, 2000),
        });
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

    return res.json({ success: true, labels });
  }

    if (carrier.carrierType === 'wegrow') {
      const credentials = normalizeWeGrowCredentials(parseCredentialsSafely(carrier.credentials));
      const { apiKey, headers: weGrowAuthHeaders } = getWeGrowAuthConfig(credentials);
      const serviceCode = credentials.serviceCode || shippingMethod;

      if (!apiKey) {
        return res.status(400).json({ error: 'WeGrow API key ontbreekt' });
      }

      if (!serviceCode) {
        return res.status(400).json({ error: 'WeGrow service code ontbreekt' });
      }

      const baseUrl = getWeGrowBaseUrl(credentials).replace(/\/+$/, '');
      const apiVersion = credentials.apiVersion || 'v1';

      const senderName = credentials.senderName || 'Dropsyncr Warehouse';
      const senderStreet = credentials.senderStreet || 'Warehouse Street 1';
      const senderPostalCode = credentials.senderPostalCode || '1012AB';
      const senderCity = credentials.senderCity || 'Amsterdam';
      const senderCountry = credentials.senderCountry || 'NL';
      const senderEmail = credentials.senderEmail || 'operations@dropsyncr.local';
      const senderPhone = credentials.senderPhone || '+31000000000';

      const labels = [];
      for (let index = 0; index < (packages || []).length; index += 1) {
        const pkg = packages[index] || {};
        const address = parseAddress(pkg.address || '');
        const recipientName = pkg.customerName || 'Recipient';
        const destinationStreet = pkg.street || address.street || pkg.address || 'Unknown';
        const destinationPostalCode = pkg.zipCode || address.zipCode || pkg.postalCode || '0000AA';
        const destinationCity = pkg.city || address.city || 'Unknown';
        const destinationCountry = pkg.country || 'NL';

        const weightValue = Number(pkg.weightKg ?? pkg.weight ?? 1);
        const payload = {
          label_format: credentials.labelFormat || 'pdf',
          service: {
            code: serviceCode,
          },
          shipment: {
            references: {
              order_reference: String(pkg.orderNumber || pkg.id || `ORD-${Date.now()}-${index}`),
              receiver_reference: pkg.reference2 ? String(pkg.reference2) : null,
            },
            addresses: {
              origin: {
                address: {
                  name: senderName,
                  street: senderStreet,
                  postal_code: senderPostalCode,
                  city: senderCity,
                  iso_country: senderCountry,
                },
                contact: {
                  name: senderName,
                  email: senderEmail,
                  mobile: senderPhone,
                },
              },
              destination: {
                address: {
                  name: recipientName,
                  street: destinationStreet,
                  postal_code: destinationPostalCode,
                  city: destinationCity,
                  iso_country: destinationCountry,
                },
                contact: {
                  name: recipientName,
                  email: pkg.email || null,
                  mobile: pkg.phone || null,
                },
              },
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
          headers: {
            'Content-Type': 'application/json',
            ...weGrowAuthHeaders,
            'x-version': apiVersion,
          },
          body: JSON.stringify(payload),
        });

        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          return res.status(502).json({
            error: 'Failed to generate WeGrow label',
            details: responseData?.detail || responseData?.error || 'Unknown WeGrow error',
          });
        }

        const shippingLabels = responseData?.labels?.shipping_labels || [];
        const paperlessLabel = responseData?.labels?.paperless_digital_label;
        const firstLabel = shippingLabels[0] || paperlessLabel;

        if (!firstLabel?.base64_label) {
          return res.status(502).json({
            error: 'WeGrow label response did not include a label',
          });
        }

        const format = firstLabel.format || payload.label_format || 'pdf';
        const mimeType = getLabelMimeType(format);

        labels.push({
          packageId: pkg.id || index,
          carrierType: carrier.carrierType,
          shippingMethod: selectedShippingMethod || serviceCode,
          trackingCode: firstLabel.carrier_tracking_id || `${carrier.carrierType.toUpperCase()}-${Date.now()}-${index}`,
          labelUrl: `data:${mimeType};base64,${firstLabel.base64_label}`,
          trackingUrl: firstLabel.carrier_tracking_url || null,
          shipmentId: responseData?.id || null,
        });
      }

      await persistOrderShippingMethodAndLabels(labels);

      return res.json({ success: true, labels });
    }

    const labels = (packages || []).map((pkg, index) => {
      const timestamp = Date.now();
      const trackingCode = `${carrier.carrierType.toUpperCase()}-${timestamp}-${index}`;
      return {
        packageId: pkg.id || index,
        carrierType: carrier.carrierType,
        shippingMethod: selectedShippingMethod,
        trackingCode,
        labelUrl: null,
      };
    });

    await persistOrderShippingMethodAndLabels(labels);

    res.json({ success: true, labels });
  } catch (error) {
    console.error('Generate carrier labels error:', error);

    const errorMessage = String(error?.message || 'Failed to generate labels');
    const isMissingShippingMethodColumn =
      errorMessage.includes('Unknown column') && errorMessage.includes('shippingMethod');

    if (isMissingShippingMethodColumn) {
      return res.status(500).json({
        error: 'Failed to persist shipping method on order',
        details: 'Kolom shippingMethod ontbreekt in de Order tabel. Voer de migratie uit en probeer opnieuw.',
      });
    }

    res.status(500).json({
      error: 'Failed to generate labels',
      details: errorMessage,
    });
  }
};

