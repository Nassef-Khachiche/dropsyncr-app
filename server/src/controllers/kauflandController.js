import prisma from '../config/database.js';
import fetch from 'node-fetch';
import crypto from 'crypto';

/**
 * Kaufland API Integration Controller
 */

const CURRENCY_TO_EUR = {
  EUR: 1,
  CZK: 0.040,
  PLN: 0.23,
  HUF: 0.0026,
  RON: 0.20,
  SEK: 0.088,
  DKK: 0.134,
  CHF: 1.05,
  GBP: 1.17,
};

function convertToEur(amount, currency) {
  const rate = CURRENCY_TO_EUR[currency] || 1;
  return parseFloat((amount * rate).toFixed(2));
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
//
// Kaufland v2 order-unit statuses: open | need_to_be_sent | sent | received
// Cancellations are signalled by a non-null `cancel_reason` field on the unit.
//
// Interne Dropsyncr-statussen (string-veld `status` / `orderStatus`) — gelijk
// aan wat de Bol-controller gebruikt: openstaand | verzonden | afgeleverd | geannuleerd
//
// De `orderStatus`-codetabel kende alleen OPEN en SHIPPED. We voegen CANCELLED
// toe zodat een geannuleerde order niet langer als OPEN gecodeerd hoeft te staan.

const ensureOrderStatusCodes = async () => {
  await Promise.all(
    ['OPEN', 'SHIPPED', 'CANCELLED'].map((code) =>
      prisma.orderStatus.upsert({
        where: { code },
        update: {},
        create: { code },
      })
    )
  );
};

const toKauflandOrderStatusCode = (internalStatus) => {
  const normalized = String(internalStatus || '').trim().toLowerCase();
  if (normalized === 'geannuleerd') return 'CANCELLED';
  if (normalized === 'verzonden' || normalized === 'verstuurd' || normalized === 'afgeleverd') {
    return 'SHIPPED';
  }
  return 'OPEN';
};

// Bepaal de interne status van één Kaufland order unit.
function mapKauflandUnitToInternalStatus(unit) {
  const cancelReason = unit?.cancel_reason;
  if (cancelReason !== null && cancelReason !== undefined && String(cancelReason).trim() !== '') {
    return 'geannuleerd';
  }

  const status = String(unit?.status || '').trim().toLowerCase();
  switch (status) {
    case 'received':
      return 'afgeleverd';
    case 'sent':
      return 'verzonden';
    case 'need_to_be_sent':
    case 'open':
    default:
      return 'openstaand';
  }
}

const isUnitCancelled = (unit) => {
  const cancelReason = unit?.cancel_reason;
  return cancelReason !== null && cancelReason !== undefined && String(cancelReason).trim() !== '';
};

const isUnitShippedOrDelivered = (unit) => {
  const internal = mapKauflandUnitToInternalStatus(unit);
  return internal === 'verzonden' || internal === 'afgeleverd';
};

async function getKauflandIntegration(installationId, integrationId = null) {
  const installationIdNumber = parseInt(installationId, 10);
  if (!Number.isFinite(installationIdNumber)) {
    throw new Error('Invalid installation ID');
  }

  const integrationIdNumber = integrationId ? parseInt(integrationId, 10) : null;
  if (integrationId && !Number.isFinite(integrationIdNumber)) {
    throw new Error('Invalid integration ID');
  }

  const where = {
    installationId: installationIdNumber,
    platform: 'kaufland',
    active: true,
    ...(integrationIdNumber ? { id: integrationIdNumber } : {}),
  };

  const integration = await prisma.integration.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  if (!integration) {
    throw new Error('Kaufland integration not found or not active');
  }

  const credentials = JSON.parse(integration.credentials);
  return { integration, credentials };
}

async function resolveKauflandIntegrationForOrder(installationId, orderNumber, integrationId = null) {
  const installationIdNumber = parseInt(installationId, 10);
  if (!Number.isFinite(installationIdNumber)) {
    throw new Error('Invalid installation ID');
  }

  const normalizedOrderNumber = String(orderNumber || '').trim();
  let resolvedIntegrationId = integrationId ? parseInt(integrationId, 10) : null;

  if (!resolvedIntegrationId && normalizedOrderNumber) {
    const dbOrder = await prisma.order.findFirst({
      where: { orderNumber: normalizedOrderNumber, installationId: installationIdNumber },
      select: { storeName: true },
    });

    if (dbOrder?.storeName) {
      const integrations = await prisma.integration.findMany({
        where: { installationId: installationIdNumber, platform: 'kaufland', active: true },
      });

      const matchedIntegration = integrations.find((integration) => {
        const credentials = JSON.parse(integration.credentials || '{}');
        const shopName = credentials.shopName || `Kaufland #${integration.id}`;
        return shopName === dbOrder.storeName;
      });

      if (matchedIntegration) resolvedIntegrationId = matchedIntegration.id;
    }
  }

  return getKauflandIntegration(installationIdNumber, resolvedIntegrationId);
}

async function kauflandApiRequest(credentials, endpoint, method = 'GET', body = null) {
  const { clientId, clientSecret } = credentials;
  const baseUrl = 'https://sellerapi.kaufland.com/v2';
  const uri = `${baseUrl}${endpoint}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyString = body ? JSON.stringify(body) : '';

  const stringToSign = [method.toUpperCase(), uri, bodyString, timestamp].join('\n');

  const signature = crypto
    .createHmac('sha256', clientSecret)
    .update(stringToSign)
    .digest('hex');

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Shop-Client-Key': clientId,
    'Shop-Timestamp': timestamp,
    'Shop-Signature': signature,
  };

  const options = {
    method: method.toUpperCase(),
    headers,
    ...(bodyString ? { body: bodyString } : {}),
  };

  const response = await fetch(uri, options);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Kaufland API error: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      console.error('[KAUFLAND API ERROR] Full response:', JSON.stringify(errorJson, null, 2));
      errorMessage += ` - ${JSON.stringify(errorJson)}`;
    } catch {
      console.error('[KAUFLAND API ERROR] Raw response:', errorText);
      errorMessage += ` - ${errorText}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Haal order units op voor één of meerdere statussen, met paginering.
 * Optioneel beperken tot units die ná een bepaald moment zijn bijgewerkt
 * (ts_updated_from_iso) om de hoeveelheid data te beperken bij reconciliatie.
 */
async function fetchKauflandOrderUnitsByStatuses(
  credentials,
  statuses = ['need_to_be_sent'],
  { tsUpdatedFromIso = null } = {}
) {
  const allUnits = [];
  const limit = 100;

  for (const status of statuses) {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        status,
        limit: String(limit),
        offset: String(offset),
      });
      if (tsUpdatedFromIso) {
        params.set('ts_updated_from_iso', tsUpdatedFromIso);
      }

      let response;
      try {
        response = await kauflandApiRequest(credentials, `/order-units?${params.toString()}`);
      } catch (error) {
        console.warn('[KAUFLAND FETCH] Failed to fetch order units', {
          status,
          offset,
          message: error.message,
        });
        break; // ga door met de volgende status, faal niet de hele sync
      }

      const units = response?.data || [];
      allUnits.push(...units);

      console.log('[KAUFLAND FETCH] page', { status, offset, count: units.length });

      if (units.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }
  }

  return allUnits;
}

async function fetchAllKauflandOrders(credentials) {
  // Behoudt het oorspronkelijke gedrag: alleen orders die verstuurd moeten worden.
  return fetchKauflandOrderUnitsByStatuses(credentials, ['need_to_be_sent']);
}

export async function syncKauflandOrdersForInstallation({ installationId, integrationId, userId = null, reconcile = true }) {
  const { integration, credentials } = await getKauflandIntegration(installationId, integrationId);
  const integrationCredentials = JSON.parse(integration.credentials || '{}');
  const shopName = integrationCredentials.shopName || `Kaufland #${integration.id}`;

  await ensureOrderStatusCodes();

  const kauflandOrderUnits = await fetchAllKauflandOrders(credentials);

  console.log('[KAUFLAND SYNC] Total fetched:', { total: kauflandOrderUnits.length });

  const orderGroups = new Map();
  for (const unit of kauflandOrderUnits) {
    const orderId = String(unit?.id_order || unit?.order_id || '').trim();
    if (!orderId) continue;
    if (!orderGroups.has(orderId)) {
      orderGroups.set(orderId, []);
    }
    orderGroups.get(orderId).push(unit);
  }

  console.log('[KAUFLAND SYNC] Unique orders:', { total: orderGroups.size });

  let importedCount = 0;
  let updatedCount = 0;

  for (const [orderId, orderUnits] of orderGroups) {
    const orderNumber = orderId;
    const order = orderUnits[0];

    const billingAddress = order?.billing_address || {};
    const shippingAddress = order?.shipping_address || billingAddress;
    const firstName = shippingAddress?.first_name || billingAddress?.first_name || '';
    const lastName = shippingAddress?.last_name || billingAddress?.last_name || '';
    const customerName = `${firstName} ${lastName}`.trim() || 'Unknown';
    const currency = order?.currency || 'EUR';

    const orderValue = orderUnits.reduce((sum, unit) => {
      const priceInCents = parseFloat(unit?.price || 0);
      const priceInCurrency = priceInCents / 100;
      return sum + convertToEur(priceInCurrency, currency);
    }, 0);

    // Haal bestaande order op inclusief fulfillmentType zodat we die kunnen behouden
    const existingOrder = await prisma.order.findFirst({
      where: {
        orderNumber,
        installationId: parseInt(installationId),
      },
      select: { id: true, fulfillmentType: true },
    });

    const defaultImportedStatus = 'verzonden';
    const effectiveStatus = existingOrder ? 'openstaand' : defaultImportedStatus;

    const orderData = {
      orderNumber,
      installationId: parseInt(installationId),
      // userId null als de cron job sync doet — alleen vullen als een echte user het triggert
      userId: userId || null,
      customerName,
      customerEmail: order?.buyer?.email || null,
      address: [
        shippingAddress?.street,
        shippingAddress?.house_number,
        shippingAddress?.postcode,
        shippingAddress?.city,
      ].filter(Boolean).join(', '),
      country: shippingAddress?.country || 'DE',
      storeName: shopName,
      platform: 'kaufland',
      orderDate: new Date(order?.ts_created_iso || order?.ts_created || Date.now()),
      deliveryDate: order?.delivery_time_expires_iso ? new Date(order.delivery_time_expires_iso) : null,
      orderStatus: effectiveStatus,
      orderStatusCode: toKauflandOrderStatusCode(effectiveStatus),
      orderValue: parseFloat(orderValue.toFixed(2)),
      itemCount: orderUnits.length,
      status: effectiveStatus,
      // Nieuwe orders krijgen null zodat de reserveringsjob ze oppikt
      // Bestaande orders behouden hun huidige fulfillmentType
      fulfillmentType: existingOrder ? existingOrder.fulfillmentType : null,
    };

    const savedOrder = existingOrder
      ? await prisma.order.update({
          where: { id: existingOrder.id },
          data: orderData,
          select: { id: true },
        })
      : await prisma.order.create({
          data: orderData,
          select: { id: true },
        });

    await prisma.orderItem.deleteMany({ where: { orderId: savedOrder.id } });

    for (const unit of orderUnits) {
      const product = unit?.product || {};
      const ean = String(product?.eans?.[0] || unit?.ean || '').trim() || null;
      const sku = String(unit?.id_offer || ean || `kaufland-${orderNumber}-${unit?.id_order_unit}`).trim();
      const productName = String(product?.title || unit?.title || unit?.name || 'Unknown Product').trim();
      const productImage = product?.main_picture || null;
      const productBrand = product?.manufacturer || 'Kaufland';
      const quantity = 1;
      const priceInCurrency = parseFloat(unit?.price || 0) / 100;
      const itemPrice = convertToEur(priceInCurrency, currency);

      let existingProduct = await prisma.product.findFirst({
        where: {
          installationId: parseInt(installationId),
          OR: [
            { sku },
            ...(ean ? [{ ean }] : []),
          ],
        },
        select: { id: true },
      });

      if (existingProduct) {
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: {
            name: productName,
            ean: ean || undefined,
            price: itemPrice,
            image: productImage || undefined,
            brand: productBrand,
          },
        });
      } else {
        existingProduct = await prisma.product.create({
          data: {
            installationId: parseInt(installationId),
            sku,
            ean,
            name: productName,
            price: itemPrice,
            brand: productBrand,
            image: productImage,
            sizeCategory: null,
            weight: null,
            dimensionL: null,
            dimensionW: null,
            dimensionH: null,
          },
          select: { id: true },
        });
      }

      await prisma.orderItem.create({
        data: {
          orderId: savedOrder.id,
          productId: existingProduct.id,
          productName,
          productImage,
          ean,
          sku,
          quantity,
          price: itemPrice,
          unitPrice: itemPrice,
          externalId: String(unit?.id_order_unit || '').trim() || null,
        },
      });
    }

    existingOrder ? updatedCount++ : importedCount++;
  }

  // Na het importeren van need_to_be_sent: verzoen orders die bij ons nog open
  // staan maar die intussen elders verzonden of geannuleerd zijn.
  let reconciliation = null;
  if (reconcile) {
    try {
      reconciliation = await reconcileKauflandOrderStatusesForInstallation({
        installationId,
        integrationId,
      });
    } catch (reconcileError) {
      console.warn('[KAUFLAND SYNC] Reconciliation failed (non-fatal):', reconcileError.message);
    }
  }

  return {
    success: true,
    imported: importedCount,
    updated: updatedCount,
    total: importedCount + updatedCount,
    reconciliation,
  };
}

export const syncKauflandOrders = async (req, res) => {
  try {
    const { installationId, integrationId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await syncKauflandOrdersForInstallation({
      installationId,
      integrationId,
      userId: req.user.id,
    });

    res.json(result);
  } catch (error) {
    console.error('[KAUFLAND SYNC] Error:', error);
    res.status(500).json({
      error: 'Failed to sync orders from Kaufland',
      details: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// Order status reconciliation
// ---------------------------------------------------------------------------

/**
 * Bepaal de nieuwe interne status van een Dropsyncr-order op basis van de
 * huidige Kaufland-units. `unitInfos` is een array van { externalId, unit }
 * waarbij `unit` null is als de unit niet (meer) in de opgehaalde lijsten zit.
 *
 * Retourneert { internalStatus, reason }. internalStatus === null betekent:
 * niets wijzigen (order blijft openstaand / is gedeeltelijk afgehandeld).
 */
function resolveKauflandOrderReconciliation(unitInfos, { treatMissingAsCancelled = false } = {}) {
  const matched = unitInfos.filter((info) => info.unit);
  const missing = unitInfos.filter((info) => !info.unit);

  // Geen enkele unit teruggevonden in Kaufland.
  if (matched.length === 0) {
    if (treatMissingAsCancelled) {
      return { internalStatus: 'geannuleerd', reason: 'all-missing-assumed-cancelled' };
    }
    return { internalStatus: null, reason: 'all-missing' };
  }

  // Alle teruggevonden units geannuleerd (en geen ontbrekende units) → geannuleerd.
  if (missing.length === 0 && matched.every((info) => isUnitCancelled(info.unit))) {
    return { internalStatus: 'geannuleerd', reason: 'cancelled' };
  }

  // Alle teruggevonden units verzonden/afgeleverd (en geen ontbrekende) → verzonden/afgeleverd.
  if (
    missing.length === 0 &&
    matched.every((info) => !isUnitCancelled(info.unit) && isUnitShippedOrDelivered(info.unit))
  ) {
    const allDelivered = matched.every(
      (info) => mapKauflandUnitToInternalStatus(info.unit) === 'afgeleverd'
    );
    return {
      internalStatus: allDelivered ? 'afgeleverd' : 'verzonden',
      reason: 'shipped-elsewhere',
    };
  }

  // Gemengd (deels verzonden / deels nog open) of nog volledig open → niets wijzigen.
  return { internalStatus: null, reason: 'partial-or-open' };
}

/**
 * Verzoen de status van Dropsyncr Kaufland-orders die nog op `openstaand` staan
 * met de actuele status bij Kaufland.
 *
 * - shipped-elsewhere: order is in het andere systeem verstuurd (Kaufland: sent/received)
 * - cancelled: order is geannuleerd (Kaufland: cancel_reason gevuld)
 *
 * @param updatedSinceDays         Beperk de Kaufland-fetch tot units die in de
 *                                 laatste N dagen zijn bijgewerkt (null = alles).
 * @param treatMissingAsCancelled  Behandel een order waarvan álle units uit alle
 *                                 lijsten verdwenen zijn als geannuleerd. Standaard
 *                                 uit, omdat dit anders bij een API-fout orders zou
 *                                 kunnen annuleren. Test eerst op de Playground of
 *                                 geannuleerde units met cancel_reason terugkomen.
 * @param minAgeHoursForMissingCancel  Veiligheidsmarge: pas treatMissingAsCancelled
 *                                 alleen toe op orders die ouder zijn dan dit.
 */
export async function reconcileKauflandOrderStatusesForInstallation({
  installationId,
  integrationId,
  updatedSinceDays = 45,
  treatMissingAsCancelled = false,
  minAgeHoursForMissingCancel = 1,
} = {}) {
  const { credentials } = await getKauflandIntegration(installationId, integrationId);
  await ensureOrderStatusCodes();

  const tsUpdatedFromIso =
    Number.isFinite(updatedSinceDays) && updatedSinceDays > 0
      ? new Date(Date.now() - updatedSinceDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z')
      : null;

  // 1. Haal de huidige status op van alle units die "verder" zijn dan need_to_be_sent.
  const units = await fetchKauflandOrderUnitsByStatuses(
    credentials,
    ['need_to_be_sent', 'sent', 'received'],
    { tsUpdatedFromIso }
  );

  const unitMap = new Map();
  for (const unit of units) {
    const unitId = String(unit?.id_order_unit || '').trim();
    if (unitId) unitMap.set(unitId, unit);
  }

  // 2. Laad Dropsyncr Kaufland-orders die bij ons nog open staan.
  const openOrders = await prisma.order.findMany({
    where: {
      installationId: parseInt(installationId, 10),
      platform: 'kaufland',
      status: { in: ['openstaand'] },
    },
    select: { id: true, orderNumber: true, status: true, createdAt: true },
  });

  if (openOrders.length === 0) {
    return { success: true, checked: 0, shipped: 0, delivered: 0, cancelled: 0, missing: 0, unchanged: 0 };
  }

  const orderIds = openOrders.map((o) => o.id);
  const items = await prisma.orderItem.findMany({
    where: { orderId: { in: orderIds } },
    select: { orderId: true, externalId: true },
  });

  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId).push(item);
  }

  let shipped = 0;
  let delivered = 0;
  let cancelled = 0;
  let missing = 0;
  let unchanged = 0;

  for (const order of openOrders) {
    const orderItems = itemsByOrder.get(order.id) || [];
    const unitInfos = orderItems
      .map((item) => String(item.externalId || '').trim())
      .filter(Boolean)
      .map((externalId) => ({ externalId, unit: unitMap.get(externalId) || null }));

    // Geen opgeslagen id_order_unit → kunnen we niet matchen.
    if (unitInfos.length === 0) {
      unchanged++;
      continue;
    }

    const ageHours = order.createdAt
      ? (Date.now() - new Date(order.createdAt).getTime()) / 3600000
      : Infinity;

    const resolution = resolveKauflandOrderReconciliation(unitInfos, {
      treatMissingAsCancelled: treatMissingAsCancelled && ageHours >= minAgeHoursForMissingCancel,
    });

    if (resolution.reason === 'all-missing' && resolution.internalStatus === null) {
      missing++;
      continue;
    }

    if (!resolution.internalStatus || resolution.internalStatus === order.status) {
      unchanged++;
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: resolution.internalStatus,
        orderStatus: resolution.internalStatus,
        orderStatusCode: toKauflandOrderStatusCode(resolution.internalStatus),
      },
    });

    if (resolution.internalStatus === 'geannuleerd') cancelled++;
    else if (resolution.internalStatus === 'afgeleverd') delivered++;
    else if (resolution.internalStatus === 'verzonden') shipped++;

    console.log('[KAUFLAND RECONCILE] Order status bijgewerkt', {
      orderNumber: order.orderNumber,
      from: order.status,
      to: resolution.internalStatus,
      reason: resolution.reason,
    });
  }

  return {
    success: true,
    checked: openOrders.length,
    shipped,
    delivered,
    cancelled,
    missing,
    unchanged,
  };
}

export const reconcileKauflandOrderStatuses = async (req, res) => {
  try {
    const { installationId, integrationId, updatedSinceDays, treatMissingAsCancelled } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await reconcileKauflandOrderStatusesForInstallation({
      installationId,
      integrationId,
      ...(updatedSinceDays != null && updatedSinceDays !== ''
        ? { updatedSinceDays: parseInt(updatedSinceDays, 10) }
        : {}),
      treatMissingAsCancelled: String(treatMissingAsCancelled || '').toLowerCase() === 'true',
    });

    res.json(result);
  } catch (error) {
    console.error('[KAUFLAND RECONCILE] Error:', error);
    res.status(500).json({
      error: 'Failed to reconcile Kaufland order statuses',
      details: error.message,
    });
  }
};

// WeGrow kiest de carrier op basis van het bestemmingsland. Kaufland kent per
// land aparte codes (kaal `DPD` = DPD Duitsland), dus we mappen op land.
// Toegestane waarden: https://sellerapi.kaufland.com/?page=order-files#carrier-codes
const KAUFLAND_CARRIER_CODE_BY_COUNTRY = {
  DE: 'DHL',
  AT: 'Austrian Post',
  IT: 'Post Italiane',
  NL: 'DPD Netherlands',
  PL: 'DPD Poland',
  FR: 'DPD France',
  CZ: 'DPD Czech Republic',
  SK: 'DPD Slovakia',
  ES: 'Seur',
};

const resolveKauflandCarrierCode = (country) => {
  const normalized = String(country || '').trim().toUpperCase();
  return KAUFLAND_CARRIER_CODE_BY_COUNTRY[normalized] || 'Other';
};

const resolveKauflandStorefront = (country) => {
  const normalized = String(country || '').trim().toLowerCase();
  return normalized || null;
};

export async function sendKauflandTracking(installationId, orderNumber, trackingCode, carrierType, shippingMethod, integrationId = null) {
  try {
    const { integration, credentials } = await resolveKauflandIntegrationForOrder(installationId, orderNumber, integrationId);

    const order = await prisma.order.findFirst({
      where: { orderNumber, installationId: parseInt(installationId) },
      include: { orderItems: true },
    });

    if (!order) {
      console.warn('[KAUFLAND TRACKING] Order not found:', orderNumber);
      return;
    }

    const carrierCode = resolveKauflandCarrierCode(order.country);
    const storefront = resolveKauflandStorefront(order.country);
    console.log('[KAUFLAND TRACKING] Carrier code:', { orderNumber, integrationId: integration.id, storeName: order.storeName, country: order.country, carrierCode, storefront });

    const orderUnits = order.orderItems
      .map(item => item.externalId)
      .filter(Boolean);

    if (orderUnits.length === 0) {
      console.warn('[KAUFLAND TRACKING] No order unit IDs found for order:', orderNumber);
      return;
    }

    const storefrontQuery = storefront ? `?storefront=${encodeURIComponent(storefront)}` : '';

    for (const orderUnitId of orderUnits) {
      try {
        await kauflandApiRequest(
          credentials,
          `/order-units/${orderUnitId}/send${storefrontQuery}`,
          'PATCH',
          {
            carrier_code: carrierCode,
            tracking_numbers: trackingCode,
          }
        );
        console.log('[KAUFLAND TRACKING] Sent tracking for order unit:', orderUnitId);
      } catch (error) {
        console.error('[KAUFLAND TRACKING] Failed for order unit:', orderUnitId, error.message);
      }
    }
  } catch (error) {
    console.error('[KAUFLAND TRACKING] Error:', error.message);
  }
}