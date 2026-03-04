import prisma from '../config/database.js';
import fetch from 'node-fetch';
import {
  resolveShippingAutomationForOrder,
  inferBolShippingMethodFromOrderData,
  inferIsMailboxFromOrderData,
} from '../utils/shippingAutomation.js';

/**
 * Bol.com API Integration Controller
 * Handles orders, tracking, labels, and returns from Bol.com
 */

// Helper function to get Bol credentials for an installation/integration
async function getBolIntegration(installationId, integrationId = null) {
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
    platform: 'bol.com',
    active: true,
    ...(integrationIdNumber ? { id: integrationIdNumber } : {}),
  };

  const integration = await prisma.integration.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  if (!integration) {
    throw new Error('Bol.com integration not found or not active');
  }

  const credentials = JSON.parse(integration.credentials);
  return { integration, credentials };
}

// Helper function to make authenticated Bol API requests
async function bolApiRequest(credentials, endpoint, method = 'GET', body = null) {
  const { clientId, clientSecret } = credentials;
  
  // Get access token (in production, implement token caching)
  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenResponse = await fetch('https://login.bol.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authString}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    if (tokenResponse.status === 401) {
      throw new Error('Ongeldige Bol.com API credentials. Controleer je Client ID en Client Secret.');
    }
    throw new Error(`Failed to authenticate with Bol.com API: ${tokenResponse.status} - ${errorText}`);
  }

  const { access_token } = await tokenResponse.json();

  // Make the actual API request
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/vnd.retailer.v10+json',
      'Content-Type': 'application/vnd.retailer.v10+json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`https://api.bol.com/retailer${endpoint}`, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Bol API error: ${response.status}`;
    
    // Parse error details if available
    try {
      const errorJson = JSON.parse(errorText);
      if (response.status === 403) {
        const bolDetail = errorJson?.detail || errorJson?.title || 'Unauthorized request';
        errorMessage = `Geen toegang tot Bol endpoint ${endpoint}: ${bolDetail}`;
      } else if (errorJson.detail) {
        errorMessage += ` - ${errorJson.detail}`;
      }
    } catch (e) {
      errorMessage += ` - ${errorText}`;
    }
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  console.log('[BOL API] Response', {
    endpoint,
    method,
    status: response.status,
    data,
  });
  return data;
}

async function fetchAllBolOrders(credentials) {
  const allOrders = [];
  const maxPages = 200;

  for (let page = 1; page <= maxPages; page++) {
    const response = await bolApiRequest(credentials, `/orders?fulfilment-method=FBR&page=${page}`);
    const pageOrders = response?.orders || [];

    if (pageOrders.length === 0) {
      break;
    }

    allOrders.push(...pageOrders);

    if (pageOrders.length < 50) {
      break;
    }
  }

  return allOrders;
}

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstNonEmptyString = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
};

const isLikelyImageUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;

  return (
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(trimmed) ||
    /(image|images|thumbnail|photo|picture|media)/i.test(trimmed)
  );
};

const collectImageUrlsFromObject = (input) => {
  const urls = [];
  const visited = new Set();

  const visit = (node, parentKey = '') => {
    if (!node) return;

    if (typeof node === 'string') {
      if (isLikelyImageUrl(node) || /(image|thumbnail|photo|picture)/i.test(parentKey)) {
        urls.push(node.trim());
      }
      return;
    }

    if (typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, parentKey));
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (isLikelyImageUrl(value) || /(image|thumbnail|photo|picture|url|href|link)/i.test(key)) {
          urls.push(value.trim());
        }
      } else {
        visit(value, key);
      }
    }
  };

  visit(input);
  return urls.filter(Boolean);
};

const toValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const collectDeliveryDatesFromSource = (input, keyRegex = /(delivery|deliver|promis|expected|eta|arrival)/i) => {
  const collected = [];
  const visited = new Set();

  const visit = (node, parentKey = '') => {
    if (!node) return;

    if (typeof node === 'string' || typeof node === 'number') {
      if (parentKey && keyRegex.test(parentKey)) {
        const date = toValidDate(node);
        if (date) collected.push(date);
      }
      return;
    }

    if (typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, parentKey));
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' || typeof value === 'number') {
        if (keyRegex.test(key)) {
          const date = toValidDate(value);
          if (date) collected.push(date);
        }
      } else {
        visit(value, key);
      }
    }
  };

  visit(input);
  return collected;
};

const resolveBolDeliveryDate = (orderPayload = {}, orderItems = [], shipmentPayload = null) => {
  const orderLevelCandidates = [
    orderPayload.deliveryPromise,
    orderPayload.latestDeliveryDate,
    orderPayload.deliveryDate,
    orderPayload.promisedDeliveryDate,
    orderPayload.promisedDeliveryDateTime,
    orderPayload.deliveryDateTime,
  ];

  for (const candidate of orderLevelCandidates) {
    const validDate = toValidDate(candidate);
    if (validDate) return validDate;
  }

  const itemDates = (Array.isArray(orderItems) ? orderItems : [])
    .flatMap((item) => [
      item?.deliveryPromise,
      item?.latestDeliveryDate,
      item?.deliveryDate,
      item?.promisedDeliveryDate,
      item?.promisedDeliveryDateTime,
      item?.deliveryDateTime,
    ])
    .map((candidate) => toValidDate(candidate))
    .filter(Boolean);

  const nestedOrderDates = collectDeliveryDatesFromSource(orderPayload);
  const nestedItemsDates = collectDeliveryDatesFromSource(orderItems);
  const nestedShipmentDates = collectDeliveryDatesFromSource(shipmentPayload);

  const allDates = [
    ...itemDates,
    ...nestedOrderDates,
    ...nestedItemsDates,
    ...nestedShipmentDates,
  ];

  if (allDates.length === 0) return null;

  return allDates.reduce((latest, current) => {
    if (!latest) return current;
    return current.getTime() > latest.getTime() ? current : latest;
  }, null);
};

const findStringValueByKey = (input, keyRegex) => {
  if (!input) return null;

  if (Array.isArray(input)) {
    for (const entry of input) {
      const found = findStringValueByKey(entry, keyRegex);
      if (found) return found;
    }
    return null;
  }

  if (typeof input !== 'object') {
    return null;
  }

  for (const [key, rawValue] of Object.entries(input)) {
    if (typeof rawValue === 'string' && keyRegex.test(key) && rawValue.trim()) {
      return rawValue.trim();
    }

    if (Array.isArray(rawValue)) {
      for (const nested of rawValue) {
        const found = findStringValueByKey(nested, keyRegex);
        if (found) return found;
      }
      continue;
    }

    if (rawValue && typeof rawValue === 'object') {
      const found = findStringValueByKey(rawValue, keyRegex);
      if (found) return found;
    }
  }

  return null;
};

const extractProductImage = (item = {}) => {
  const images = item?.product?.images;

  console.log('[BOL SYNC] Extracting product image from item:', {
    itemId: item?.orderItemId || null,
    productId: item?.product?.id || null,
    images,
  }); 

  if (Array.isArray(images) && images.length > 0) {
    const firstImage = images[0];
    if (typeof firstImage === 'string') return firstImage;
    if (firstImage && typeof firstImage === 'object') {
      return firstNonEmptyString(firstImage.url, firstImage.href, firstImage.link);
    }
  }

  const directImage = firstNonEmptyString(
    item?.product?.image,
    item?.product?.imageUrl,
    item?.product?.mainImage,
    item?.product?.thumbnail,
    item?.productImage,
    item?.imageUrl,
    item?.image,
  );

  if (directImage) {
    return directImage;
  }

  const imageFromLinks = firstNonEmptyString(
    item?.product?.links?.[0]?.href,
    item?.links?.[0]?.href,
  );

  if (imageFromLinks && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(imageFromLinks)) {
    return imageFromLinks;
  }

  return findStringValueByKey(item, /(image|imageUrl|thumbnail|photo|picture)/i);
};

const mergeBolOrderItems = (baseItems = [], detailItems = []) => {
  if (!Array.isArray(detailItems) || detailItems.length === 0) {
    return Array.isArray(baseItems) ? baseItems : [];
  }

  if (!Array.isArray(baseItems) || baseItems.length === 0) {
    return detailItems;
  }

  return detailItems.map((detailItem) => {
    const match = baseItems.find((baseItem) =>
      (baseItem?.orderItemId && detailItem?.orderItemId && String(baseItem.orderItemId) === String(detailItem.orderItemId)) ||
      (baseItem?.ean && detailItem?.ean && String(baseItem.ean) === String(detailItem.ean)) ||
      (baseItem?.offerId && detailItem?.offerId && String(baseItem.offerId) === String(detailItem.offerId))
    );

    return {
      ...(match || {}),
      ...detailItem,
      product: {
        ...((match && match.product) || {}),
        ...(detailItem.product || {}),
      },
    };
  });
};

const tryBolApiRequest = async (credentials, endpoints = []) => {
  for (const endpoint of endpoints) {
    try {
      const data = await bolApiRequest(credentials, endpoint);
      if (data) {
        return { endpoint, data };
      }
    } catch (error) {
      console.warn('[BOL SYNC] Optional enrichment request failed', {
        endpoint,
        message: error.message,
      });
    }
  }

  return null;
};

const resolveImageFromBolEnrichment = (enrichmentData = {}) => {
  const directCandidates = [
    ...(Array.isArray(enrichmentData?.images) ? enrichmentData.images : []),
    ...(Array.isArray(enrichmentData?.product?.images) ? enrichmentData.product.images : []),
    ...(Array.isArray(enrichmentData?.media?.images) ? enrichmentData.media.images : []),
    ...(Array.isArray(enrichmentData?.assets?.images) ? enrichmentData.assets.images : []),
    enrichmentData?.mainImage,
    enrichmentData?.image,
    enrichmentData?.thumbnail,
  ].filter(Boolean);

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && isLikelyImageUrl(candidate)) {
      return candidate;
    }

    if (candidate && typeof candidate === 'object') {
      const explicitUrl = firstNonEmptyString(
        candidate.url,
        candidate.href,
        candidate.link,
        candidate.uri,
        candidate.secureUrl,
        candidate.location
      );

      if (explicitUrl && isLikelyImageUrl(explicitUrl)) {
        return explicitUrl;
      }
    }
  }

  const discoveredUrls = collectImageUrlsFromObject(enrichmentData);
  return discoveredUrls.find((url) => isLikelyImageUrl(url)) || discoveredUrls[0] || null;
};

const fetchBolProductAssetsByUsage = async ({ credentials, ean, usage }) => {
  const eanValue = firstNonEmptyString(ean);
  const usageValue = firstNonEmptyString(usage);

  if (!eanValue || !usageValue) {
    return null;
  }

  try {
    const endpoint = `/products/${encodeURIComponent(eanValue)}/assets?usage=${encodeURIComponent(usageValue)}`;
    const data = await bolApiRequest(credentials, endpoint);
    return { endpoint, usage: usageValue, data };
  } catch (error) {
    console.warn('[BOL ENRICHMENT] Product asset request failed', {
      ean: eanValue,
      usage: usageValue,
      message: error.message,
    });
    return null;
  }
};

// --- ENRICH PRODUCT VIA CONTENT API ONLY ---
const enrichBolProductData = async ({ credentials, ean }) => {
  const eanValue = firstNonEmptyString(ean);

  if (!eanValue) {
    console.log('[BOL ENRICHMENT] No EAN available, skipping enrichment');
    return null;
  }

  try {
    const catalogPath = `/content/catalog-products/${encodeURIComponent(eanValue)}`;
    const fallbackProductPath = `/content/products/${encodeURIComponent(eanValue)}`;

    const enrichmentResponse = await tryBolApiRequest(credentials, [
      `${catalogPath}`,
      `${catalogPath}?country-code=NL`,
      `${fallbackProductPath}`,
      `${fallbackProductPath}?country-code=NL`,
    ]);

    if (!enrichmentResponse) {
      throw new Error(`No response from Bol content endpoints for EAN ${eanValue}`);
    }

    const { endpoint, data } = enrichmentResponse;

    const [primaryAssets, additionalAssets, imageAssets] = await Promise.all([
      fetchBolProductAssetsByUsage({ credentials, ean: eanValue, usage: 'PRIMARY' }),
      fetchBolProductAssetsByUsage({ credentials, ean: eanValue, usage: 'ADDITIONAL' }),
      fetchBolProductAssetsByUsage({ credentials, ean: eanValue, usage: 'IMAGE' }),
    ]);

    const assetResponses = [primaryAssets, additionalAssets, imageAssets].filter(Boolean);
    const mergedEnrichmentData = {
      ...data,
      product: {
        ...(data?.product || {}),
      },
      assetsByUsage: assetResponses,
      assets: assetResponses.map((assetResponse) => assetResponse.data).filter(Boolean),
    };

    const resolvedImage = resolveImageFromBolEnrichment(mergedEnrichmentData);

    console.log('[BOL ENRICHMENT SUCCESS]', {
      ean: eanValue,
      hasImages: Array.isArray(data?.images),
      imageCount: data?.images?.length || 0,
      assetResponseCount: assetResponses.length,
      resolvedImage: !!resolvedImage,
      brand: data?.brand,
    });

    return { endpoint, data: mergedEnrichmentData, resolvedImage };
  } catch (error) {
    console.warn('[BOL ENRICHMENT FAILED]', {
      ean: eanValue,
      message: error.message,
    });

    return null;
  }
};

/**
 * Sync orders from Bol.com
 */
export const syncBolOrders = async (req, res) => {
  try {
    const { installationId, integrationId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }

    // Check if user has access to this installation
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

    const { integration, credentials } = await getBolIntegration(installationId, integrationId);
    const integrationCredentials = JSON.parse(integration.credentials || '{}');
    const integrationShopName = integrationCredentials.shopName || `Bol.com #${integration.id}`;
    
    // Fetch all order pages from Bol.com
    const bolOrders = await fetchAllBolOrders(credentials);

    console.log('[BOL SYNC] Fetched orders from Bol.com:', {
      totalOrders: bolOrders.length,
    });
    
    let importedCount = 0;
    let updatedCount = 0;
    const enrichmentCache = new Map();

    for (const bolOrder of bolOrders) {
      // Log the complete order data for debugging
      console.log('[BOL SYNC] ========================================');
      console.log('[BOL SYNC] Processing order:', bolOrder.orderId);
      console.log('[BOL SYNC] Full Bol Order Object:', JSON.stringify(bolOrder, null, 2));
      console.log('[BOL SYNC] ========================================');
      
      // Fetch and log detailed Bol data for this order
      let bolOrderDetails = null;
      let bolOrderItemsDetails = null;
      let bolShipmentDetails = null;

      try {
        bolOrderDetails = await bolApiRequest(credentials, `/orders/${bolOrder.orderId}`);
        console.log('[BOL SYNC] Order details:', JSON.stringify(bolOrderDetails, null, 2));
      } catch (detailError) {
        console.warn('[BOL SYNC] Failed to fetch order details:', detailError.message);
      }

      try {
        bolOrderItemsDetails = await bolApiRequest(credentials, `/orders/${bolOrder.orderId}/order-items`);
        console.log('[BOL SYNC] Order items details:', JSON.stringify(bolOrderItemsDetails, null, 2));
      } catch (detailError) {
        console.warn('[BOL SYNC] Failed to fetch order items details:', detailError.message);
      }

      try {
        bolShipmentDetails = await bolApiRequest(credentials, `/shipments?order-id=${bolOrder.orderId}`);
        console.log('[BOL SYNC] Shipment details:', JSON.stringify(bolShipmentDetails, null, 2));
      } catch (detailError) {
        console.warn('[BOL SYNC] Failed to fetch shipment details:', detailError.message);
      }

      const orderPayload = bolOrderDetails || bolOrder;
      const baseOrderItems = orderPayload.orderItems || bolOrder.orderItems || [];
      const detailedOrderItems = bolOrderItemsDetails?.orderItems || [];
      const orderItems = mergeBolOrderItems(baseOrderItems, detailedOrderItems);
      const shipmentDetails = orderPayload.shipmentDetails || orderPayload.billingDetails || {};
      const deliveryDate = resolveBolDeliveryDate(orderPayload, orderItems, bolShipmentDetails);
      const resolvedBolShippingMethod = inferBolShippingMethodFromOrderData({
        orderPayload,
        bolOrder,
        orderItems,
        shippingMethod: orderPayload?.shippingMethod,
        bolShippingMethod: orderPayload?.bolShippingMethod,
      });
      const mailboxOrder = inferIsMailboxFromOrderData({
        orderPayload,
        orderItems,
        shippingDescription: shipmentDetails?.deliveryMethod,
      });

      // Check if order already exists (for import/update counters)
      const existingOrder = await prisma.order.findFirst({
        where: {
          orderNumber: bolOrder.orderId,
          installationId: parseInt(installationId),
        },
        select: {
          id: true,
          storeName: true,
          installationId: true,
        },
      });

      const conflictingOrder = await prisma.order.findFirst({
        where: {
          orderNumber: bolOrder.orderId,
          NOT: {
            installationId: parseInt(installationId),
          },
        },
        select: {
          id: true,
          installationId: true,
          storeName: true,
        },
      });

      if (!existingOrder && conflictingOrder) {
        console.warn('[BOL SYNC] Skipping conflicting orderNumber from another installation', {
          orderNumber: bolOrder.orderId,
          targetInstallationId: parseInt(installationId),
          conflictingInstallationId: conflictingOrder.installationId,
          conflictingStoreName: conflictingOrder.storeName,
        });
        continue;
      }

      if (!integrationId && existingOrder && existingOrder.storeName && existingOrder.storeName !== integrationShopName) {
        console.warn('[BOL SYNC] Skipping conflicting orderNumber from another integration/store', {
          orderNumber: bolOrder.orderId,
          existingStoreName: existingOrder.storeName,
          incomingStoreName: integrationShopName,
          installationId: parseInt(installationId),
        });
        continue;
      }

      const firstName = shipmentDetails?.firstName || '';
      const surname = shipmentDetails?.surname || '';
      const customerName = `${firstName} ${surname}`.trim() || 'Unknown';
      const shippingAutomationResult = await resolveShippingAutomationForOrder({
        prisma,
        installationId: parseInt(installationId, 10),
        storeName: existingOrder?.storeName || integrationShopName,
        country: shipmentDetails?.countryCode || 'NL',
        bolShippingMethod: resolvedBolShippingMethod,
        isBrievenbus: mailboxOrder,
      });

      const orderData = {
        orderNumber: bolOrder.orderId,
        installationId: parseInt(installationId),
        userId: req.user.id,
        customerName: customerName,
        customerEmail: shipmentDetails?.email || null,
        address: [
          shipmentDetails?.streetName,
          shipmentDetails?.houseNumber,
          shipmentDetails?.zipCode,
          shipmentDetails?.city,
        ].filter(Boolean).join(', '),
        country: shipmentDetails?.countryCode || 'NL',
        storeName: existingOrder?.storeName || integrationShopName,
        platform: 'bol.com',
        orderDate: new Date(orderPayload.orderPlacedDateTime),
        deliveryDate,
        orderStatus: mapBolStatusToInternal(orderItems?.[0]?.fulfilmentStatus || bolOrder.orderItems?.[0]?.fulfilmentStatus),
        shippingStatus: orderItems?.[0]?.fulfilmentStatus || bolOrder.orderItems?.[0]?.fulfilmentStatus || null,
        orderValue: parseFloat(orderItems?.reduce((sum, item) => {
          const unitPrice = parseFloat(item.unitPrice ?? item.totalPrice ?? item.offerPrice ?? 0) || 0;
          return sum + (unitPrice * (item.quantity || 1));
        }, 0) || 0),
        itemCount: orderItems?.length || 1,
        status: mapBolStatusToInternal(orderItems?.[0]?.fulfilmentStatus || bolOrder.orderItems?.[0]?.fulfilmentStatus),
        shippingMethod: shippingAutomationResult.shippingAssignment,
      };

      console.log('[BOL SYNC] Mapped order data:', {
        customerName: orderData.customerName,
        orderValue: orderData.orderValue,
        status: orderData.status,
        orderStatus: orderData.orderStatus
      });

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

      if (existingOrder) {
        updatedCount++;
      } else {
        importedCount++;
      }

      if (Array.isArray(orderItems)) {
        await prisma.orderItem.deleteMany({
          where: { orderId: savedOrder.id },
        });

        for (let index = 0; index < orderItems.length; index++) {
          const item = orderItems[index];

          const productName = firstNonEmptyString(
            item?.product?.title,
            item?.title,
            item?.productTitle,
            'Unknown Product'
          );
          const productBrand = firstNonEmptyString(
            item?.product?.brand,
            item?.product?.brandName,
            item?.brand,
            findStringValueByKey(item?.product, /brand/i),
            findStringValueByKey(item, /brand/i)
          );
          const ean = firstNonEmptyString(item?.ean, item?.product?.ean);
          const offerId = firstNonEmptyString(item?.offerId, item?.offer?.offerId);
          const sku = firstNonEmptyString(
            item?.sku,
            item?.product?.sku,
            item?.offerId,
            item?.offer?.offerId,
            item?.offerReference,
            item?.offer?.reference,
            ean,
            `bol-${bolOrder.orderId}-${item?.orderItemId || index + 1}`
          );
          const internalRef = firstNonEmptyString(
            item?.internalReference,
            item?.internalRef,
            item?.product?.internalReference,
            item?.reference,
            item?.offerReference,
            item?.offerId,
            item?.offer?.reference,
            item?.offer?.offerId,
            item?.orderItemId,
            sku
          );
          const quantity = Math.max(1, parseInt(item?.quantity || 1, 10) || 1);
          const unitPrice = toNumber(item?.unitPrice ?? item?.price ?? item?.offerPrice);
          const totalPrice = toNumber(item?.totalPrice);
          const effectiveUnitPrice = unitPrice > 0
            ? unitPrice
            : (totalPrice > 0 ? totalPrice / quantity : 0);
          const productImage = extractProductImage(item);
          let resolvedProductImage = productImage;
          let resolvedProductBrand = productBrand;

          const enrichmentCacheKey = firstNonEmptyString(ean, sku, offerId, item?.orderItemId);
          if ((!resolvedProductImage || !resolvedProductBrand) && enrichmentCacheKey) {
            if (!enrichmentCache.has(enrichmentCacheKey)) {
            const enrichment = await enrichBolProductData({
              credentials,
              ean,
            });
              enrichmentCache.set(enrichmentCacheKey, enrichment || null);
            }

            const enrichmentResponse = enrichmentCache.get(enrichmentCacheKey);
            if (enrichmentResponse) {
              const enrichmentData = enrichmentResponse.data;
              const enrichmentEndpoint = enrichmentResponse.endpoint;

              if (!resolvedProductImage) {
                resolvedProductImage = firstNonEmptyString(
                  enrichmentResponse.resolvedImage,
                  resolveImageFromBolEnrichment(enrichmentData)
                );

                if (resolvedProductImage) {
                  console.log('[BOL IMAGE RESOLVED]', {
                    ean,
                    endpoint: enrichmentEndpoint,
                    resolvedProductImage,
                  });
                }
              }
            }
          }

          if (!resolvedProductBrand) {
            resolvedProductBrand = 'Bol.com';
          }

          const installationIdNumber = parseInt(installationId);
          let product = await prisma.product.findFirst({
            where: {
              installationId: installationIdNumber,
              OR: [
                { sku },
                ...(ean ? [{ ean }] : []),
              ],
            },
            select: {
              id: true,
              image: true,
            },
          });

          if (product) {
            product = await prisma.product.update({
              where: { id: product.id },
              data: {
                ean: ean || undefined,
                name: productName,
                image: resolvedProductImage || undefined,
                brand: resolvedProductBrand || undefined,
                internalRef: internalRef || sku,
                price: effectiveUnitPrice,
              },
              select: {
                id: true,
                image: true,
              },
            });
          } else {
            product = await prisma.product.create({
              data: {
                installationId: installationIdNumber,
                sku,
                ean,
                name: productName,
                image: resolvedProductImage,
                brand: resolvedProductBrand,
                internalRef: internalRef || sku,
                price: effectiveUnitPrice,
              },
              select: {
                id: true,
                image: true,
              },
            });
          }

          await prisma.orderItem.create({
            data: {
              orderId: savedOrder.id,
              productId: product.id,
              productName,
              productImage: resolvedProductImage || product.image || null,
              ean,
              sku,
              quantity,
              price: effectiveUnitPrice,
              unitPrice: effectiveUnitPrice,
            },
          });
        }
      }
    }

    res.json({
      success: true,
      imported: importedCount,
      updated: updatedCount,
      total: importedCount + updatedCount,
    });
  } catch (error) {
    console.error('Sync Bol orders error:', error);
    res.status(500).json({ 
      error: 'Failed to sync orders from Bol.com',
      details: error.message 
    });
  }
};

/**
 * Get shipping label from Bol.com
 */
export const getBolShippingLabel = async (req, res) => {
  try {
    const { installationId, orderId, integrationId } = req.query;

    if (!installationId || !orderId) {
      return res.status(400).json({ error: 'Installation ID and Order ID are required' });
    }

    const { credentials } = await getBolIntegration(installationId, integrationId);
    
    // Request shipping label from Bol
    const labelData = await bolApiRequest(credentials, `/orders/${orderId}/shipment-label`);

    res.json(labelData);
  } catch (error) {
    console.error('Get Bol shipping label error:', error);
    res.status(500).json({ 
      error: 'Failed to get shipping label from Bol.com',
      details: error.message 
    });
  }
};

/**
 * Update order shipment status
 */
export const updateBolShipment = async (req, res) => {
  try {
    const { installationId, integrationId } = req.query;
    const { orderId, shipmentReference, transporterCode, trackAndTrace } = req.body;

    if (!installationId || !orderId) {
      return res.status(400).json({ error: 'Installation ID and Order ID are required' });
    }

    const { credentials } = await getBolIntegration(installationId, integrationId);
    
    // Update shipment in Bol
    const shipmentData = {
      shipmentReference,
      transport: {
        transporterCode,
        trackAndTrace,
      },
    };

    const result = await bolApiRequest(
      credentials, 
      `/orders/${orderId}/shipment`,
      'PUT',
      shipmentData
    );

    // Update in our database
    await prisma.order.update({
      where: { orderNumber: orderId },
      data: {
        status: 'verstuurd',
        shippingStatus: 'SHIPPED',
      },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Update Bol shipment error:', error);
    res.status(500).json({ 
      error: 'Failed to update shipment on Bol.com',
      details: error.message 
    });
  }
};

/**
 * Get returns from Bol.com
 */
export const getBolReturns = async (req, res) => {
  try {
    const { installationId, page = 1, integrationId } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }

    const { credentials } = await getBolIntegration(installationId, integrationId);
    
    // Fetch returns from Bol
    const returns = await bolApiRequest(credentials, `/returns?page=${page}`);

    res.json(returns);
  } catch (error) {
    console.error('Get Bol returns error:', error);
    res.status(500).json({ 
      error: 'Failed to get returns from Bol.com',
      details: error.message 
    });
  }
};

/**
 * Handle return request
 */
export const handleBolReturn = async (req, res) => {
  try {
    const { installationId, integrationId } = req.query;
    const { returnId, quantityReturned, handlingResult } = req.body;

    if (!installationId || !returnId) {
      return res.status(400).json({ error: 'Installation ID and Return ID are required' });
    }

    const { credentials } = await getBolIntegration(installationId, integrationId);
    
    // Handle return in Bol
    const returnData = {
      quantityReturned,
      handlingResult, // 'RETURN_RECEIVED', 'EXCHANGE_PRODUCT', 'RETURN_DOES_NOT_MEET_CONDITIONS', etc.
    };

    const result = await bolApiRequest(
      credentials,
      `/returns/${returnId}`,
      'PUT',
      returnData
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Handle Bol return error:', error);
    res.status(500).json({ 
      error: 'Failed to handle return on Bol.com',
      details: error.message 
    });
  }
};

async function getFallbackSyncUserId(installationId) {
  const installationUser = await prisma.userInstallation.findFirst({
    where: { installationId },
    select: { userId: true },
    orderBy: { id: 'asc' },
  });

  if (installationUser?.userId) {
    return installationUser.userId;
  }

  const globalAdmin = await prisma.user.findFirst({
    where: { isGlobalAdmin: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  if (globalAdmin?.id) {
    return globalAdmin.id;
  }

  throw new Error('No user available to assign imported Bol.com orders');
}

export const syncBolOrdersForInstallation = async ({ installationId, integrationId } = {}) => {
  if (!installationId) {
    throw new Error('Installation ID is required');
  }

  const installationIdNumber = parseInt(installationId, 10);
  if (!Number.isFinite(installationIdNumber)) {
    throw new Error('Invalid Installation ID');
  }

  const syncUserId = await getFallbackSyncUserId(installationIdNumber);
  let statusCode = 200;
  let payload = null;

  await syncBolOrders(
    {
      query: {
        installationId: String(installationIdNumber),
        ...(integrationId ? { integrationId: String(integrationId) } : {}),
      },
      user: { id: syncUserId, isGlobalAdmin: true },
    },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        payload = data;
        return data;
      },
    }
  );

  if (statusCode >= 400) {
    throw new Error(payload?.details || payload?.error || 'Failed to sync orders from Bol.com');
  }

  return payload || {
    success: true,
    imported: 0,
    updated: 0,
    total: 0,
  };
};

// Helper function to map Bol status to internal status
function mapBolStatusToInternal(bolStatus) {
  const statusMap = {
    'OPEN': 'openstaand',
    'NEW': 'openstaand',
    'ANNOUNCED': 'onderweg-ffm',
    'ARRIVED_AT_WH': 'binnengekomen-ffm',
    'SHIPPED': 'verstuurd',
    'DELIVERED': 'afgeleverd',
    'CANCELLED': 'geannuleerd',
  };
  console.log('[BOL SYNC] Mapping status:', bolStatus, '->', statusMap[bolStatus] || 'openstaand');
  return statusMap[bolStatus] || 'openstaand';
}
