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

async function getKauflandIntegration(installationId, integrationId = null) {
  const installationIdNumber = parseInt(installationId, 10);
  if (!Number.isFinite(installationIdNumber)) {
    throw new Error('Invalid installation ID');
  }

  const where = {
    installationId: installationIdNumber,
    platform: 'kaufland',
    active: true,
    ...(integrationId ? { id: parseInt(integrationId, 10) } : {}),
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

async function fetchAllKauflandOrders(credentials) {
  const allOrders = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await kauflandApiRequest(
      credentials,
      `/order-units?status=need_to_be_sent&limit=${limit}&offset=${offset}`
    );

    const orders = response?.data || [];
    allOrders.push(...orders);

    console.log('[KAUFLAND SYNC] Fetched page:', { offset, count: orders.length });

    if (orders.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  return allOrders;
}

export async function syncKauflandOrdersForInstallation({ installationId, integrationId, userId = null }) {
  const { integration, credentials } = await getKauflandIntegration(installationId, integrationId);
  const integrationCredentials = JSON.parse(integration.credentials || '{}');
  const shopName = integrationCredentials.shopName || `Kaufland #${integration.id}`;

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
      orderStatus: 'openstaand',
      orderValue: parseFloat(orderValue.toFixed(2)),
      itemCount: orderUnits.length,
      status: 'openstaand',
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
        },
      });
    }

    existingOrder ? updatedCount++ : importedCount++;
  }

  return {
    success: true,
    imported: importedCount,
    updated: updatedCount,
    total: importedCount + updatedCount,
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