import prisma from '../config/database.js';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { getJwtSecret } from '../utils/security.js';

/**
 * Shopify Admin API Integration Controller
 * Uses the REST Admin API (2024-04) with private-app access tokens.
 */

const SHOPIFY_API_VERSION = '2024-04';
const SHOPIFY_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseIntegrationCredentials(rawCredentials, contextLabel = 'Shopify integration') {
  if (rawCredentials === null || rawCredentials === undefined || rawCredentials === '') {
    return {};
  }

  if (typeof rawCredentials === 'object') {
    return rawCredentials;
  }

  try {
    const parsed = JSON.parse(rawCredentials);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw createHttpError(
      400,
      `${contextLabel} credentials contain invalid JSON. Please save the integration credentials again.`
    );
  }
}

function normalizeShopDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Accept either bare domain or full URL and always keep only the hostname.
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return String(parsed.hostname || '')
      .trim()
      .replace(/\.$/, '')
      .toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .trim()
      .replace(/\.$/, '')
      .toLowerCase();
  }
}

function isValidShopifyDomain(shopDomain) {
  const normalized = normalizeShopDomain(shopDomain);
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(normalized);
}

function buildOAuthRedirectUri(req) {
  const explicitRedirectUri = String(process.env.SHOPIFY_OAUTH_REDIRECT_URI || '').trim();
  if (explicitRedirectUri) {
    return explicitRedirectUri;
  }

  const backendBaseUrlFromEnv = String(process.env.BACKEND_URL || '').trim();
  if (backendBaseUrlFromEnv) {
    try {
      const parsed = new URL(backendBaseUrlFromEnv);
      const normalizedPath = parsed.pathname
        .replace(/\/+$/, '')
        .replace(/\/api$/i, '');
      parsed.pathname = normalizedPath || '';
      const normalizedOrigin = parsed.toString().replace(/\/$/, '');
      return `${normalizedOrigin}/api/shopify/oauth/callback`;
    } catch {
      const normalizedBase = backendBaseUrlFromEnv
        .replace(/\/$/, '')
        .replace(/\/api$/i, '');
      return `${normalizedBase}/api/shopify/oauth/callback`;
    }
  }

  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');
  const backendBaseUrl = `${protocol}://${host}`;

  return `${String(backendBaseUrl).replace(/\/$/, '')}/api/shopify/oauth/callback`;
}

function buildSignedOauthState(payload) {
  const serialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(serialized)
    .digest('base64url');
  return `${serialized}.${signature}`;
}

function verifySignedOauthState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid OAuth state');
  }

  const [serialized, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(serialized)
    .digest('base64url');

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Invalid OAuth state signature');
  }

  const payload = JSON.parse(Buffer.from(serialized, 'base64url').toString('utf8'));
  if (!payload?.integrationId || !payload?.iat) {
    throw new Error('Invalid OAuth state payload');
  }

  const stateAgeMs = Date.now() - Number(payload.iat);
  if (!Number.isFinite(stateAgeMs) || stateAgeMs < 0 || stateAgeMs > SHOPIFY_OAUTH_STATE_TTL_MS) {
    throw new Error('OAuth state expired');
  }

  return payload;
}

function isValidShopifyOauthHmac(query, clientSecret) {
  const { hmac, signature, ...rest } = query;
  if (!hmac || !clientSecret) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => {
      const rawValue = rest[key];
      if (Array.isArray(rawValue)) {
        return `${key}=${rawValue.join(',')}`;
      }
      return `${key}=${rawValue}`;
    })
    .join('&');

  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
  const digestBuffer = Buffer.from(digest);
  const hmacBuffer = Buffer.from(String(hmac));

  return digestBuffer.length === hmacBuffer.length && crypto.timingSafeEqual(digestBuffer, hmacBuffer);
}

async function exchangeShopifyOAuthCode({ shopDomain, clientId, clientSecret, code }) {
  const domain = normalizeShopDomain(shopDomain);
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(`Shopify OAuth token exchange failed (${response.status}): ${responseText}`);
  }

  const accessToken = payload?.access_token;
  if (!accessToken) {
    throw new Error('Shopify OAuth token exchange did not return an access token');
  }

  return {
    accessToken,
    scope: payload?.scope || null,
  };
}

// ---------------------------------------------------------------------------
// Currency conversion helpers (same rates as kauflandController)
// ---------------------------------------------------------------------------
const CURRENCY_TO_EUR = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  CAD: 0.68,
  AUD: 0.61,
  CHF: 1.05,
  SEK: 0.088,
  DKK: 0.134,
  NOK: 0.087,
  PLN: 0.23,
  CZK: 0.040,
  HUF: 0.0026,
  RON: 0.20,
};

function convertToEur(amount, currency) {
  const rate = CURRENCY_TO_EUR[String(currency || 'EUR').toUpperCase()] ?? 1;
  return parseFloat((amount * rate).toFixed(2));
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function mapShopifyOrderToInternalStatus(order) {
  if (order.cancelled_at) return 'geannuleerd';
  const financial = String(order.financial_status || '').toLowerCase();
  if (financial === 'refunded' || financial === 'voided') return 'geannuleerd';

  const fulfillment = String(order.fulfillment_status || '').toLowerCase();
  if (fulfillment === 'fulfilled') return 'verzonden';
  if (fulfillment === 'partial') return 'openstaand';

  return 'openstaand';
}

function mapToOrderStatusCode(internalStatus) {
  if (internalStatus === 'geannuleerd') return 'CANCELLED';
  if (internalStatus === 'verzonden' || internalStatus === 'afgeleverd') return 'SHIPPED';
  return 'OPEN';
}

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

// ---------------------------------------------------------------------------
// Integration retrieval
// ---------------------------------------------------------------------------
async function getShopifyIntegration(installationId, integrationId = null) {
  const installationIdNumber = parseInt(installationId, 10);
  if (!Number.isFinite(installationIdNumber)) {
    throw new Error('Invalid installation ID');
  }

  const where = {
    installationId: installationIdNumber,
    platform: 'shopify',
    active: true,
    ...(integrationId ? { id: parseInt(integrationId, 10) } : {}),
  };

  const integration = await prisma.integration.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  if (!integration) {
    throw new Error('Shopify integration not found or not active');
  }

  const credentials = parseIntegrationCredentials(integration.credentials, 'Shopify integration');

  return { integration, credentials };
}

// ---------------------------------------------------------------------------
// Low-level API request
// ---------------------------------------------------------------------------
async function shopifyApiRequest(credentials, path, method = 'GET', body = null) {
  const { shopDomain, accessToken } = credentials;

  if (!shopDomain || !accessToken) {
    throw new Error('Missing Shopify access token. Complete Shopify OAuth authorization first.');
  }

  // Normalise domain — strip protocol if accidentally included
  const domain = normalizeShopDomain(shopDomain);
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': accessToken,
  };

  const options = {
    method: method.toUpperCase(),
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Shopify API error ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      console.error('[SHOPIFY API ERROR]', JSON.stringify(errorJson, null, 2));
      errorMessage += ` - ${JSON.stringify(errorJson)}`;
    } catch {
      console.error('[SHOPIFY API ERROR] Raw:', errorText);
      errorMessage += ` - ${errorText}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Fetch orders with cursor-based pagination
// ---------------------------------------------------------------------------
async function fetchShopifyOrders(credentials, { status = 'open', limit = 250, sinceId = null } = {}) {
  const allOrders = [];
  const params = new URLSearchParams({ status, limit: String(limit) });
  if (sinceId) params.set('since_id', String(sinceId));

  let nextUrl = `/orders.json?${params.toString()}`;

  while (nextUrl) {
    let response;
    try {
      // After the first page nextUrl may be a full URL; handle both cases
      if (nextUrl.startsWith('http')) {
        const parsedUrl = new URL(nextUrl);
        const path = parsedUrl.pathname.replace(`/admin/api/${SHOPIFY_API_VERSION}`, '') + parsedUrl.search;
        response = await shopifyApiRequest(credentials, path);
      } else {
        response = await shopifyApiRequest(credentials, nextUrl);
      }
    } catch (err) {
      console.error('[SHOPIFY FETCH] Failed to fetch orders page:', err.message);
      break;
    }

    const orders = response?.orders || [];
    allOrders.push(...orders);

    console.log('[SHOPIFY FETCH] page', { count: orders.length, total: allOrders.length });

    // Shopify uses Link header pagination; the API response doesn't return
    // a next cursor in the JSON body for the REST API — we rely on page_info
    // but since we can't access response headers here, we stop when the page
    // is smaller than the requested limit.
    if (orders.length < limit) break;

    // Move to the next page using the last order id as since_id
    const lastOrder = orders[orders.length - 1];
    const newParams = new URLSearchParams({ status, limit: String(limit), since_id: String(lastOrder.id) });
    nextUrl = `/orders.json?${newParams.toString()}`;
  }

  return allOrders;
}

// ---------------------------------------------------------------------------
// Core sync logic (reusable by HTTP handler and cron job)
// ---------------------------------------------------------------------------
export async function syncShopifyOrdersForInstallation({ installationId, integrationId, userId = null }) {
  const { integration, credentials } = await getShopifyIntegration(installationId, integrationId);
  const shopName = credentials.shopName || `Shopify #${integration.id}`;

  await ensureOrderStatusCodes();

  // Fetch open + any order that may need status reconciliation (any status)
  const [openOrders, closedOrders] = await Promise.all([
    fetchShopifyOrders(credentials, { status: 'open' }),
    fetchShopifyOrders(credentials, { status: 'closed' }),
  ]);

  const allOrders = [...openOrders, ...closedOrders];
  console.log('[SHOPIFY SYNC] Total fetched:', { open: openOrders.length, closed: closedOrders.length });

  let importedCount = 0;
  let updatedCount = 0;

  for (const order of allOrders) {
    const orderNumber = `shopify-${order.order_number || order.id}`;
    const internalStatus = mapShopifyOrderToInternalStatus(order);
    const orderStatusCode = mapToOrderStatusCode(internalStatus);

    const shippingAddress = order.shipping_address || order.billing_address || {};
    const customer = order.customer || {};

    const firstName = shippingAddress.first_name || customer.first_name || '';
    const lastName = shippingAddress.last_name || customer.last_name || '';
    const customerName = `${firstName} ${lastName}`.trim() || order.email || 'Unknown';

    const currency = order.currency || 'EUR';
    const orderValue = convertToEur(parseFloat(order.total_price || 0), currency);

    const addressParts = [
      shippingAddress.address1,
      shippingAddress.address2,
      shippingAddress.zip,
      shippingAddress.city,
    ].filter(Boolean);
    const address = addressParts.join(', ') || 'Unknown';
    const country = shippingAddress.country_code || shippingAddress.country || 'NL';

    const existingOrder = await prisma.order.findFirst({
      where: { orderNumber, installationId: parseInt(installationId) },
      select: { id: true, fulfillmentType: true },
    });

    const orderData = {
      orderNumber,
      installationId: parseInt(installationId),
      userId: userId || null,
      customerName,
      customerEmail: order.email || null,
      address,
      country,
      storeName: shopName,
      platform: 'shopify',
      orderDate: new Date(order.created_at || Date.now()),
      deliveryDate: null,
      orderStatus: internalStatus,
      orderStatusCode,
      orderValue: parseFloat(orderValue.toFixed(2)),
      itemCount: (order.line_items || []).length,
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

    for (const item of order.line_items || []) {
      const sku = String(item.sku || `shopify-${order.id}-${item.id}`).trim();
      const ean = null; // EAN not available in standard Shopify line items
      const productName = String(item.name || item.title || 'Unknown Product').trim();
      const itemPrice = convertToEur(parseFloat(item.price || 0) * (item.quantity || 1), currency);
      const unitPrice = convertToEur(parseFloat(item.price || 0), currency);

      let existingProduct = await prisma.product.findFirst({
        where: { installationId: parseInt(installationId), sku },
        select: { id: true },
      });

      if (existingProduct) {
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: { name: productName, price: unitPrice },
        });
      } else {
        existingProduct = await prisma.product.create({
          data: {
            installationId: parseInt(installationId),
            sku,
            ean,
            name: productName,
            price: unitPrice,
            brand: item.vendor || 'Shopify',
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
          quantity: item.quantity || 1,
          price: itemPrice,
          unitPrice,
          externalId: String(item.id),
        },
      });
    }

    existingOrder ? updatedCount++ : importedCount++;
  }

  console.log('[SHOPIFY SYNC] Done', { imported: importedCount, updated: updatedCount, total: allOrders.length });

  return {
    success: true,
    imported: importedCount,
    updated: updatedCount,
    total: allOrders.length,
  };
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/shopify/sync-orders
 */
export async function syncShopifyOrders(req, res) {
  const { installationId, integrationId } = req.query;

  if (!installationId) {
    return res.status(400).json({ error: 'installationId is required' });
  }

  try {
    const result = await syncShopifyOrdersForInstallation({
      installationId,
      integrationId: integrationId || null,
      userId: req.user?.id || null,
    });
    return res.json(result);
  } catch (error) {
    console.error('[SHOPIFY] syncShopifyOrders error:', error.message);
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error.message });
  }
}

/**
 * POST /api/shopify/oauth/start
 * Body: { installationId, integrationId }
 * Returns Shopify authorization URL for the merchant to approve app scopes.
 */
export async function startShopifyOAuth(req, res) {
  const { installationId, integrationId } = req.body || {};

  if (!installationId || !integrationId) {
    return res.status(400).json({ error: 'installationId and integrationId are required' });
  }

  try {
    const integration = await prisma.integration.findUnique({
      where: { id: parseInt(integrationId, 10) },
      select: {
        id: true,
        installationId: true,
        platform: true,
        credentials: true,
      },
    });

    if (!integration || integration.platform !== 'shopify') {
      return res.status(404).json({ error: 'Shopify integration not found' });
    }

    if (parseInt(installationId, 10) !== integration.installationId) {
      return res.status(400).json({ error: 'installationId does not match integration' });
    }

    if (!req.user?.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: integration.installationId,
        },
      });

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const credentials = parseIntegrationCredentials(integration.credentials, 'Shopify integration');

    const shopDomain = normalizeShopDomain(credentials.shopDomain);
    const clientId = String(credentials.clientId || '').trim();
    const clientSecret = String(credentials.clientSecret || '').trim();

    if (!shopDomain || !clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Shop Domain, Client ID, and Client Secret are required before Shopify OAuth can start',
      });
    }

    if (!isValidShopifyDomain(shopDomain)) {
      return res.status(400).json({
        error: 'Invalid Shopify shop domain. Use the format: your-shop.myshopify.com',
      });
    }

    const state = buildSignedOauthState({
      integrationId: integration.id,
      installationId: integration.installationId,
      iat: Date.now(),
    });

    const redirectUri = buildOAuthRedirectUri(req);
    const scopes = process.env.SHOPIFY_API_SCOPES || 'read_orders,read_all_orders,write_fulfillments,read_fulfillments';

    const authUrl = `https://${shopDomain}/admin/oauth/authorize?${new URLSearchParams({
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
    }).toString()}`;

    return res.json({ success: true, authUrl });
  } catch (error) {
    console.error('[SHOPIFY] startShopifyOAuth error:', error.message);
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error.message });
  }
}

/**
 * GET /api/shopify/oauth/callback
 * Public callback route hit by Shopify after merchant approves app scopes.
 */
export async function handleShopifyOAuthCallback(req, res) {
  const frontendBase = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const successRedirect = `${frontendBase}/?shopify_oauth=success`;

  try {
    const { code, state, shop } = req.query || {};

    if (!code || !state || !shop) {
      return res.status(400).send('Missing required Shopify OAuth callback parameters.');
    }

    const parsedState = verifySignedOauthState(state);

    const integration = await prisma.integration.findUnique({
      where: { id: parseInt(parsedState.integrationId, 10) },
      select: {
        id: true,
        installationId: true,
        platform: true,
        credentials: true,
      },
    });

    if (!integration || integration.platform !== 'shopify') {
      return res.status(404).send('Shopify integration not found.');
    }

    const credentials = parseIntegrationCredentials(integration.credentials, 'Shopify integration');

    const shopDomain = normalizeShopDomain(credentials.shopDomain);
    const callbackShopDomain = normalizeShopDomain(shop);
    const clientId = String(credentials.clientId || '').trim();
    const clientSecret = String(credentials.clientSecret || '').trim();

    if (!shopDomain || !clientId || !clientSecret) {
      return res.status(400).send('Integration credentials are incomplete for OAuth callback.');
    }

    if (!isValidShopifyDomain(shopDomain) || !isValidShopifyDomain(callbackShopDomain)) {
      return res.status(400).send('Invalid Shopify shop domain format for OAuth callback.');
    }

    if (shopDomain !== callbackShopDomain) {
      return res.status(400).send('Shop domain mismatch during Shopify OAuth callback.');
    }

    if (!isValidShopifyOauthHmac(req.query, clientSecret)) {
      return res.status(401).send('Invalid Shopify OAuth callback signature.');
    }

    const tokenResult = await exchangeShopifyOAuthCode({
      shopDomain,
      clientId,
      clientSecret,
      code,
    });

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        active: true,
        credentials: JSON.stringify({
          ...credentials,
          shopDomain,
          accessToken: tokenResult.accessToken,
          oauthScope: tokenResult.scope,
          oauthConnectedAt: new Date().toISOString(),
        }),
      },
    });

    return res.redirect(successRedirect);
  } catch (error) {
    console.error('[SHOPIFY] handleShopifyOAuthCallback error:', error.message);
    const errorRedirect = `${frontendBase}/?shopify_oauth=error&message=${encodeURIComponent(error.message || 'OAuth failed')}`;
    return res.redirect(errorRedirect);
  }
}

/**
 * POST /api/shopify/fulfill-order
 * Marks an order as fulfilled in Shopify and optionally sets tracking.
 * Body: { installationId, shopifyOrderId, trackingNumber?, trackingCompany?, integrationId? }
 */
export async function fulfillShopifyOrder(req, res) {
  const { installationId, shopifyOrderId, trackingNumber, trackingCompany, integrationId } = req.body;

  if (!installationId || !shopifyOrderId) {
    return res.status(400).json({ error: 'installationId and shopifyOrderId are required' });
  }

  try {
    const { credentials } = await getShopifyIntegration(installationId, integrationId);

    // Get fulfillment orders for this order
    const fulfillmentOrdersResponse = await shopifyApiRequest(
      credentials,
      `/orders/${shopifyOrderId}/fulfillment_orders.json`
    );

    const fulfillmentOrders = fulfillmentOrdersResponse?.fulfillment_orders || [];
    const openFulfillmentOrder = fulfillmentOrders.find(
      (fo) => fo.status === 'open' || fo.status === 'in_progress'
    );

    if (!openFulfillmentOrder) {
      return res.status(400).json({ error: 'No open fulfillment order found for this Shopify order' });
    }

    const fulfillmentPayload = {
      fulfillment: {
        line_items_by_fulfillment_order: [
          { fulfillment_order_id: openFulfillmentOrder.id },
        ],
        ...(trackingNumber
          ? {
              tracking_info: {
                number: trackingNumber,
                company: trackingCompany || null,
                url: null,
              },
              notify_customer: true,
            }
          : {}),
      },
    };

    const result = await shopifyApiRequest(credentials, '/fulfillments.json', 'POST', fulfillmentPayload);

    return res.json({ success: true, fulfillment: result?.fulfillment });
  } catch (error) {
    console.error('[SHOPIFY] fulfillShopifyOrder error:', error.message);
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error.message });
  }
}

/**
 * POST /api/shopify/webhook/:topic
 * Validates HMAC and processes incoming Shopify webhooks.
 * topic: orders-create | orders-updated | orders-cancelled
 */
export async function handleShopifyWebhook(req, res) {
  const { topic } = req.params;
  const shopDomain = req.headers['x-shopify-shop-domain'];
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const rawBody = req.rawBody; // populated by raw-body middleware in routes

  // Verify HMAC signature
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (webhookSecret && rawBody && hmacHeader) {
    const digest = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('base64');

    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))) {
      console.warn('[SHOPIFY WEBHOOK] Invalid HMAC signature from', shopDomain);
      return res.status(401).json({ error: 'Invalid HMAC signature' });
    }
  }

  const order = req.body;
  console.log('[SHOPIFY WEBHOOK]', { topic, shopDomain, orderId: order?.id, orderNumber: order?.order_number });

  try {
    // Find integration by shop domain
    const rawCredentials = await prisma.$queryRaw`
      SELECT i.id, i."installationId", i.credentials
      FROM "Integration" i
      WHERE i.platform = 'shopify' AND i.active = true
    `;

    const matchingIntegration = rawCredentials.find((row) => {
      try {
        const creds = typeof row.credentials === 'string'
          ? JSON.parse(row.credentials)
          : row.credentials;
        const domain = String(creds.shopDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        return domain === shopDomain;
      } catch {
        return false;
      }
    });

    if (!matchingIntegration) {
      console.warn('[SHOPIFY WEBHOOK] No matching integration for shop:', shopDomain);
      return res.status(200).json({ received: true }); // Always 200 to Shopify
    }

    if (topic === 'orders-cancelled' || order.cancelled_at) {
      const orderNumber = `shopify-${order.order_number || order.id}`;
      await prisma.order.updateMany({
        where: {
          orderNumber,
          installationId: matchingIntegration.installationId,
        },
        data: { status: 'geannuleerd', orderStatus: 'geannuleerd', orderStatusCode: 'CANCELLED' },
      });
    } else if (topic === 'orders-create' || topic === 'orders-updated') {
      await syncShopifyOrdersForInstallation({
        installationId: matchingIntegration.installationId,
        integrationId: matchingIntegration.id,
      });
    }
  } catch (err) {
    console.error('[SHOPIFY WEBHOOK] Processing error:', err.message);
    // Still return 200 so Shopify doesn't retry
  }

  return res.status(200).json({ received: true });
}

/**
 * GET /api/shopify/shop-info
 * Returns basic shop information to validate credentials.
 */
export async function getShopifyShopInfo(req, res) {
  const { installationId, integrationId } = req.query;

  if (!installationId) {
    return res.status(400).json({ error: 'installationId is required' });
  }

  try {
    const { credentials } = await getShopifyIntegration(installationId, integrationId);
    const data = await shopifyApiRequest(credentials, '/shop.json');
    const shop = data?.shop || {};

    return res.json({
      name: shop.name,
      domain: shop.domain,
      myshopifyDomain: shop.myshopify_domain,
      currency: shop.currency,
      country: shop.country_code,
      email: shop.email,
      planName: shop.plan_name,
    });
  } catch (error) {
    console.error('[SHOPIFY] getShopifyShopInfo error:', error.message);
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({ error: error.message });
  }
}
