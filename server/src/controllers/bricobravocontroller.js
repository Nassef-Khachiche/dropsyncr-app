import prisma from '../config/database.js';
import fetch from 'node-fetch';

/**
 * BricoBravo (Seller Hub) API Integration Controller
 *
 * API-basis: https://sellerhub.bricobravo.com/api
 * Authenticatie: API Key in de header `sh-token` (opgeslagen als credentials.clientId,
 * zodat we het bestaande integration-model kunnen hergebruiken zonder schemawijziging).
 *
 * Endpoints:
 *   GET   /orders                     — lijst (default alleen acquired=0)
 *   GET   /orders/{id}                — order details
 *   PATCH /orders/{id}/acquired       — markeer als acquired (zodat 'ie niet dubbel komt)
 *   PATCH /orders/{id}/shipped        — verzendinfo (courier + tracking) terugmelden
 *
 * BricoBravo order-statussen:
 *   0 = paid       (betaald, klaar om te verwerken)  -> openstaand
 *   1 = completed  (voltooid en verzonden)           -> verzonden
 *   2 = to_refund  (wacht op terugbetaling)          -> openstaand (niets wijzigen)
 *   3 = refunded   (terugbetaald)                    -> geannuleerd
 *
 * Interne Dropsyncr-statussen (string-veld `status` / `orderStatus`):
 *   openstaand | verzonden | afgeleverd | geannuleerd
 */

const BRICOBRAVO_BASE_URL = 'https://sellerhub.bricobravo.com/api';

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

const toBricoBravoOrderStatusCode = (internalStatus) => {
  const normalized = String(internalStatus || '').trim().toLowerCase();
  if (normalized === 'geannuleerd') return 'CANCELLED';
  if (normalized === 'verzonden' || normalized === 'verstuurd' || normalized === 'afgeleverd') {
    return 'SHIPPED';
  }
  return 'OPEN';
};

// Map een BricoBravo status-code (0..3) naar de interne Dropsyncr-status.
function mapBricoBravoStatusToInternal(statusCode) {
  const code = Number(statusCode);
  switch (code) {
    case 1:
      return 'verzonden';
    case 3:
      return 'geannuleerd';
    case 0: // paid
    case 2: // to_refund — nog niets definitiefs, blijft openstaand
    default:
      return 'openstaand';
  }
}

async function getBricoBravoIntegration(installationId, integrationId = null) {
  const installationIdNumber = parseInt(installationId, 10);
  if (!Number.isFinite(installationIdNumber)) {
    throw new Error('Invalid installation ID');
  }

  const where = {
    installationId: installationIdNumber,
    platform: 'bricobravo',
    active: true,
    ...(integrationId ? { id: parseInt(integrationId, 10) } : {}),
  };

  const integration = await prisma.integration.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  if (!integration) {
    throw new Error('BricoBravo integration not found or not active');
  }

  const credentials = JSON.parse(integration.credentials);
  return { integration, credentials };
}

async function bricoBravoApiRequest(credentials, endpoint, method = 'GET', body = null) {
  // De API Key wordt opgeslagen als credentials.clientId (hergebruik bestaand model).
  const apiKey = String(credentials?.clientId || credentials?.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('BricoBravo API key ontbreekt in de integratie-credentials');
  }

  const uri = `${BRICOBRAVO_BASE_URL}${endpoint}`;
  const bodyString = body ? JSON.stringify(body) : null;

  const options = {
    method: method.toUpperCase(),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'sh-token': apiKey,
    },
    ...(bodyString ? { body: bodyString } : {}),
  };

  const response = await fetch(uri, options);
  const rawText = await response.text();
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  // BricoBravo geeft in sommige gevallen fouten terug met HTTP 200 en een `errors`-veld.
  const hasApiError = parsed && parsed.errors;

  if (!response.ok || hasApiError) {
    const detail = hasApiError
      ? (parsed.errors.title || JSON.stringify(parsed.errors))
      : (rawText || `HTTP ${response.status}`);
    throw new Error(`BricoBravo API error (${response.status}): ${detail}`);
  }

  return parsed;
}

/**
 * Haal alle nog niet-verwerkte orders op met paginering.
 * `acquired=0` is de default van de API, maar we zetten 'm expliciet.
 * Met { all: true } halen we álle orders op (voor reconciliatie).
 */
async function fetchBricoBravoOrders(credentials, { all = false } = {}) {
  const perPage = 100;
  const allOrders = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (all) {
      params.set('all', 'true');
    } else {
      params.set('acquired', '0');
    }

    let payload;
    try {
      payload = await bricoBravoApiRequest(credentials, `/orders?${params.toString()}`);
    } catch (error) {
      console.warn('[BRICOBRAVO FETCH] Failed to fetch orders', { page, message: error.message });
      break;
    }

    const orders = Array.isArray(payload?.data) ? payload.data : [];
    allOrders.push(...orders);

    const pages = Number(payload?.pagination?.pages) || 1;
    totalPages = Number.isFinite(pages) && pages > 0 ? pages : 1;

    console.log('[BRICOBRAVO FETCH] page', { page, count: orders.length, totalPages });

    page += 1;
  } while (page <= totalPages);

  return allOrders;
}

/**
 * Markeer een order als acquired bij BricoBravo, zodat 'ie niet opnieuw in de
 * default lijst (acquired=0) verschijnt. Non-fataal: als dit faalt loggen we het.
 */
async function markBricoBravoOrderAcquired(credentials, bricoBravoOrderId) {
  const orderId = String(bricoBravoOrderId || '').trim();
  if (!orderId) return;

  try {
    await bricoBravoApiRequest(credentials, `/orders/${encodeURIComponent(orderId)}/acquired`, 'PATCH', {
      acquired: 1,
    });
    console.log('[BRICOBRAVO ACQUIRED] Order marked acquired:', orderId);
  } catch (error) {
    console.error('[BRICOBRAVO ACQUIRED] Failed to mark acquired:', orderId, error.message);
  }
}

export async function syncBricoBravoOrdersForInstallation({ installationId, integrationId, userId = null, reconcile = true }) {
  const { integration, credentials } = await getBricoBravoIntegration(installationId, integrationId);
  const integrationCredentials = JSON.parse(integration.credentials || '{}');
  const shopName = integrationCredentials.shopName || `BricoBravo #${integration.id}`;

  await ensureOrderStatusCodes();

  const bricoBravoOrders = await fetchBricoBravoOrders(credentials, { all: false });

  console.log('[BRICOBRAVO SYNC] Total fetched:', { total: bricoBravoOrders.length });

  let importedCount = 0;
  let updatedCount = 0;

  for (const order of bricoBravoOrders) {
    const bricoBravoOrderId = String(order?.id_order || '').trim();
    if (!bricoBravoOrderId) continue;

    // We slaan het externe (VTEX) ordernummer op als orderNumber; dat is wat de
    // klant/marketplace herkent. Fallback op het interne id_order.
    const orderNumber = String(order?.vtex_id_order || order?.id_order || '').trim();

    const shipping = order?.shipping_info || {};
    const items = Array.isArray(order?.items) ? order.items : [];

    const firstName = shipping?.customer_first_name || '';
    const lastName = shipping?.customer_last_name || '';
    const customerName = (shipping?.receiver_name || `${firstName} ${lastName}`).trim() || 'Unknown';

    const orderValue = parseFloat(order?.total || 0) || 0;
    const internalStatus = mapBricoBravoStatusToInternal(order?.status);

    // Haal bestaande order op zodat we fulfillmentType kunnen behouden.
    const existingOrder = await prisma.order.findFirst({
      where: {
        orderNumber,
        installationId: parseInt(installationId),
      },
      select: { id: true, fulfillmentType: true },
    });

    const orderData = {
      orderNumber,
      installationId: parseInt(installationId),
      userId: userId || null,
      customerName,
      customerEmail: shipping?.customer_first_email || null,
      address: [
        shipping?.street,
        shipping?.number,
        shipping?.postal_code,
        shipping?.city,
      ].filter(Boolean).join(', '),
      country: shipping?.country || 'ITA',
      storeName: shopName,
      platform: 'bricobravo',
      orderDate: new Date(order?.creation_date || Date.now()),
      deliveryDate: null,
      orderStatus: internalStatus,
      orderStatusCode: toBricoBravoOrderStatusCode(internalStatus),
      orderValue: parseFloat(orderValue.toFixed(2)),
      itemCount: items.length,
      status: internalStatus,
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

    for (const item of items) {
      const ean = String(item?.ean || '').trim() || null;
      const sku = String(item?.product_code || ean || `bricobravo-${orderNumber}-${item?.id_order_item}`).trim();
      const productName = String(item?.name || 'Unknown Product').trim();
      const quantity = Math.max(1, parseInt(item?.quantity || 1, 10) || 1);
      const itemPrice = parseFloat(item?.price || 0) || 0;

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
            brand: 'BricoBravo',
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
            brand: 'BricoBravo',
            image: null,
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
          productImage: null,
          ean,
          sku,
          quantity,
          price: itemPrice,
          unitPrice: itemPrice,
          externalId: String(item?.id_order_item || '').trim() || null,
        },
      });
    }

    // Markeer de order als acquired bij BricoBravo zodat 'ie niet dubbel binnenkomt.
    // We bewaren de acquired-status NIET in onze DB — die leeft bij BricoBravo.
    await markBricoBravoOrderAcquired(credentials, bricoBravoOrderId);

    existingOrder ? updatedCount++ : importedCount++;
  }

  // Verzoen orders die bij ons nog open staan maar intussen elders verzonden/terugbetaald zijn.
  let reconciliation = null;
  if (reconcile) {
    try {
      reconciliation = await reconcileBricoBravoOrderStatusesForInstallation({
        installationId,
        integrationId,
      });
    } catch (reconcileError) {
      console.warn('[BRICOBRAVO SYNC] Reconciliation failed (non-fatal):', reconcileError.message);
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

export const syncBricoBravoOrders = async (req, res) => {
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

    const result = await syncBricoBravoOrdersForInstallation({
      installationId,
      integrationId,
      userId: req.user.id,
    });

    res.json(result);
  } catch (error) {
    console.error('[BRICOBRAVO SYNC] Error:', error);
    res.status(500).json({
      error: 'Failed to sync orders from BricoBravo',
      details: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// Order status reconciliation
// ---------------------------------------------------------------------------

/**
 * Verzoen de status van Dropsyncr BricoBravo-orders die nog op `openstaand` staan
 * met de actuele status bij BricoBravo (completed -> verzonden, refunded -> geannuleerd).
 *
 * We halen alle orders op (all=true) en indexeren op het externe ordernummer.
 */
export async function reconcileBricoBravoOrderStatusesForInstallation({
  installationId,
  integrationId,
} = {}) {
  const { credentials } = await getBricoBravoIntegration(installationId, integrationId);
  await ensureOrderStatusCodes();

  const allOrders = await fetchBricoBravoOrders(credentials, { all: true });

  // Indexeer BricoBravo-orders op het externe ordernummer (zoals wij het opslaan).
  const bricoBravoByOrderNumber = new Map();
  for (const order of allOrders) {
    const orderNumber = String(order?.vtex_id_order || order?.id_order || '').trim();
    if (orderNumber) bricoBravoByOrderNumber.set(orderNumber, order);
  }

  const openOrders = await prisma.order.findMany({
    where: {
      installationId: parseInt(installationId, 10),
      platform: 'bricobravo',
      status: { in: ['openstaand'] },
    },
    select: { id: true, orderNumber: true, status: true },
  });

  if (openOrders.length === 0) {
    return { success: true, checked: 0, shipped: 0, cancelled: 0, missing: 0, unchanged: 0 };
  }

  let shipped = 0;
  let cancelled = 0;
  let missing = 0;
  let unchanged = 0;

  for (const order of openOrders) {
    const bricoBravoOrder = bricoBravoByOrderNumber.get(order.orderNumber);

    if (!bricoBravoOrder) {
      missing++;
      continue;
    }

    const newInternalStatus = mapBricoBravoStatusToInternal(bricoBravoOrder.status);

    if (newInternalStatus === order.status || newInternalStatus === 'openstaand') {
      unchanged++;
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: newInternalStatus,
        orderStatus: newInternalStatus,
        orderStatusCode: toBricoBravoOrderStatusCode(newInternalStatus),
      },
    });

    if (newInternalStatus === 'geannuleerd') cancelled++;
    else if (newInternalStatus === 'verzonden') shipped++;

    console.log('[BRICOBRAVO RECONCILE] Order status bijgewerkt', {
      orderNumber: order.orderNumber,
      from: order.status,
      to: newInternalStatus,
    });
  }

  return {
    success: true,
    checked: openOrders.length,
    shipped,
    cancelled,
    missing,
    unchanged,
  };
}

export const reconcileBricoBravoOrderStatuses = async (req, res) => {
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

    const result = await reconcileBricoBravoOrderStatusesForInstallation({
      installationId,
      integrationId,
    });

    res.json(result);
  } catch (error) {
    console.error('[BRICOBRAVO RECONCILE] Error:', error);
    res.status(500).json({
      error: 'Failed to reconcile BricoBravo order statuses',
      details: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// Tracking terugkoppeling
// ---------------------------------------------------------------------------

/**
 * Meld verzendinfo terug aan BricoBravo via PATCH /orders/{id}/shipped.
 *
 * Wordt aangeroepen vanuit carrierController.js na labelgeneratie, net als
 * sendKauflandTracking. Voor Italië gebruiken we alleen DPD via WeGrow, dus
 * de courier-mapping mapt naar BricoBravo's code `dpd`.
 *
 * BricoBravo vereist courier + tracking_number + tracking_url (alle drie verplicht).
 * We halen het order-id (id_order) op via het externe ordernummer.
 */
export async function sendBricoBravoTracking(installationId, orderNumber, trackingCode, carrierType, shippingMethod, trackingUrl = null) {
  try {
    const { credentials } = await getBricoBravoIntegration(installationId);

    // Alleen DPD (via WeGrow) is relevant voor Italië. Overige mappings zijn
    // aanwezig voor de volledigheid; onbekende carriers vallen terug op 'other'.
    const courierCodeMap = {
      dpd: 'dpd',
      dhl: 'dhl',
      'wegrow-dpd-standaard': 'dpd',
      'dpd-standaard': 'dpd',
      wegrow: 'dpd',
    };

    const normalizedShippingMethod = String(shippingMethod || '').toLowerCase();
    const normalizedCarrierType = String(carrierType || '').toLowerCase();
    const courier = courierCodeMap[normalizedShippingMethod]
      || courierCodeMap[normalizedCarrierType]
      || 'other';

    const trackingNumber = String(trackingCode || '').trim();
    if (!trackingNumber) {
      console.warn('[BRICOBRAVO TRACKING] No tracking code for order:', orderNumber);
      return;
    }

    // tracking_url is verplicht bij BricoBravo. Als er geen expliciete URL is,
    // bouwen we een DPD-trackingslink op basis van de trackingcode.
    let resolvedTrackingUrl = String(trackingUrl || '').trim();
    if (!resolvedTrackingUrl) {
      if (courier === 'dpd') {
        resolvedTrackingUrl = `https://tracking.dpd.de/status/nl_NL/parcel/${encodeURIComponent(trackingNumber)}`;
      } else {
        resolvedTrackingUrl = trackingNumber;
      }
    }

    // We hebben het BricoBravo-order-id (id_order) nodig voor de /shipped call.
    // Dat staat niet in onze DB (we bewaren het externe vtex_id_order als orderNumber),
    // dus we resolven het via de orderlijst (all=true) op het externe nummer.
    const allOrders = await fetchBricoBravoOrders(credentials, { all: true });
    const matched = allOrders.find(
      (o) => String(o?.vtex_id_order || o?.id_order || '').trim() === String(orderNumber).trim()
    );

    const bricoBravoOrderId = matched
      ? String(matched.id_order || '').trim()
      : String(orderNumber).trim();

    if (!bricoBravoOrderId) {
      console.warn('[BRICOBRAVO TRACKING] Could not resolve BricoBravo order id for:', orderNumber);
      return;
    }

    await bricoBravoApiRequest(
      credentials,
      `/orders/${encodeURIComponent(bricoBravoOrderId)}/shipped`,
      'PATCH',
      {
        courier,
        tracking_number: trackingNumber,
        tracking_url: resolvedTrackingUrl,
      }
    );

    console.log('[BRICOBRAVO TRACKING] Shipment info sent for order:', orderNumber, 'courier:', courier);
  } catch (error) {
    console.error('[BRICOBRAVO TRACKING] Error:', error.message);
  }
}