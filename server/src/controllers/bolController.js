import prisma from '../config/database.js';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveShippingAutomationForOrder,
  inferBolShippingMethodFromOrderData,
  inferIsMailboxFromOrderData,
} from '../utils/shippingAutomation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LABEL_STORAGE_DIR = path.resolve(__dirname, '../../storage/labels');

const normalizeProductName = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || 'Onbekend product';
};

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

async function getBolIntegrationCandidates(installationId, integrationId = null) {
  const installationIdNumber = parseInt(installationId, 10);

  if (!Number.isFinite(installationIdNumber)) {
    throw new Error('Invalid installation ID');
  }

  const integrationIdNumber = integrationId ? parseInt(integrationId, 10) : null;
  if (integrationId && !Number.isFinite(integrationIdNumber)) {
    throw new Error('Invalid integration ID');
  }

  const integrations = await prisma.integration.findMany({
    where: {
      installationId: installationIdNumber,
      platform: 'bol.com',
      active: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (integrations.length === 0) {
    throw new Error('Bol.com integration not found or not active');
  }

  const prioritized = integrationIdNumber
    ? [
        ...integrations.filter((entry) => entry.id === integrationIdNumber),
        ...integrations.filter((entry) => entry.id !== integrationIdNumber),
      ]
    : integrations;

  const deduplicated = Array.from(new Map(prioritized.map((entry) => [entry.id, entry])).values());

  return deduplicated.map((integration) => ({
    integration,
    credentials: JSON.parse(integration.credentials),
  }));
}

// Helper function to make authenticated Bol API requests
async function getBolAccessToken(credentials) {
  const { clientId, clientSecret } = credentials;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  let tokenResponse;
  try {
    tokenResponse = await fetch('https://login.bol.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`,
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Timeout bij ophalen van Bol access token');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    if (tokenResponse.status === 401) {
      throw new Error('Ongeldige Bol.com API credentials. Controleer je Client ID en Client Secret.');
    }
    throw new Error(`Failed to authenticate with Bol.com API: ${tokenResponse.status} - ${errorText}`);
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

async function bolApiRequestRaw(
  credentials,
  endpoint,
  {
    method = 'GET',
    body = null,
    accept = 'application/vnd.retailer.v10+json',
    contentType = 'application/vnd.retailer.v10+json',
  } = {},
) {
  const accessToken = await getBolAccessToken(credentials);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': accept,
      'Content-Type': contentType,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  // Allow callers to pass a full URL (e.g. https://api.bol.com/shared/process-status/...).
  // Those endpoints are NOT under /retailer, so we must not prepend it.
  const url = /^https?:\/\//i.test(endpoint)
    ? endpoint
    : `https://api.bol.com/retailer${endpoint}`;

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Timeout bij Bol endpoint ${endpoint}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function bolApiRequest(credentials, endpoint, method = 'GET', body = null) {
  const response = await bolApiRequestRaw(credentials, endpoint, { method, body });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Bol API error: ${response.status}`;

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
  return data;
}

const extractShipmentIdsFromResponse = (payload) => {
  const shipmentIds = new Set();

  const collect = (value) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry));
      return;
    }

    if (typeof value !== 'object') return;

    const directCandidates = [
      value.shipmentId,
      value.shipmentID,
      value.id,
    ];

    directCandidates.forEach((candidate) => {
      const normalized = String(candidate || '').trim();
      if (normalized) shipmentIds.add(normalized);
    });

    if (value.shipments) collect(value.shipments);
    if (value.results) collect(value.results);
    if (value.items) collect(value.items);
  };

  collect(payload);
  return Array.from(shipmentIds);
};

const extractShippingLabelIdsFromResponse = (payload) => {
  const shippingLabelIds = new Set();

  const collect = (value) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry));
      return;
    }

    if (typeof value !== 'object') return;

    const directCandidates = [
      value.shippingLabelId,
      value.shippingLabelID,
      value.shippingLabel?.id,
      value.labelId,
      value.labelID,
    ];

    directCandidates.forEach((candidate) => {
      const normalized = String(candidate || '').trim();
      if (normalized) shippingLabelIds.add(normalized);
    });

    if (value.shipments) collect(value.shipments);
    if (value.results) collect(value.results);
    if (value.items) collect(value.items);
    if (value.shippingLabels) collect(value.shippingLabels);
    if (value.labels) collect(value.labels);
  };

  collect(payload);
  return Array.from(shippingLabelIds);
};

const extractBolOrderItemsForLabel = (payload) => {
  const resolvedItems = new Map();

  const collect = (value) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry));
      return;
    }

    if (typeof value !== 'object') return;

    if (value.orderItems && Array.isArray(value.orderItems)) {
      value.orderItems.forEach((item) => {
        const orderItemId = String(item?.orderItemId || item?.orderItemID || item?.id || '').trim();
        if (!orderItemId) return;

        const parsedQuantity = Number(item?.quantity || item?.amount || item?.quantityOrdered || 1);
        const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0
          ? Math.max(1, Math.floor(parsedQuantity))
          : 1;

        if (!resolvedItems.has(orderItemId)) {
          resolvedItems.set(orderItemId, quantity);
        }
      });
    }

    Object.values(value).forEach((nested) => collect(nested));
  };

  collect(payload);

  return Array.from(resolvedItems.entries()).map(([orderItemId, quantity]) => ({
    orderItemId,
    quantity,
  }));
};

const fetchBolDeliveryOptionHandoverWindow = async (
  credentials,
  orderItems = [],
  preferredShippingLabelOfferId = null,
) => {
  const normalizedOrderItems = Array.isArray(orderItems) ? orderItems : [];
  if (normalizedOrderItems.length === 0) {
    return {
      deliveryOptionsPayload: null,
      selectedDeliveryOption: null,
      earliestHandoverDateTime: null,
      latestHandoverDateTime: null,
    };
  }

  const deliveryOptionsPayload = await bolApiRequest(
    credentials,
    '/shipping-labels/delivery-options',
    'POST',
    { orderItems: normalizedOrderItems },
  );

  const deliveryOptions = Array.isArray(deliveryOptionsPayload?.deliveryOptions)
    ? deliveryOptionsPayload.deliveryOptions
    : [];

  const normalizedPreferredShippingLabelOfferId = String(preferredShippingLabelOfferId || '').trim();

  const selectedDeliveryOption = (normalizedPreferredShippingLabelOfferId
    ? deliveryOptions.find((option) => String(option?.shippingLabelOfferId || '').trim() === normalizedPreferredShippingLabelOfferId)
    : null)
    || deliveryOptions.find((option) => option?.recommended)
    || deliveryOptions[0]
    || null;

  const earliestHandoverDateTime = selectedDeliveryOption?.handoverDetails?.earliestHandoverDateTime
    || null;
  const latestHandoverDateTime = selectedDeliveryOption?.handoverDetails?.latestHandoverDateTime
    || null;

  return {
    deliveryOptionsPayload,
    selectedDeliveryOption,
    earliestHandoverDateTime,
    latestHandoverDateTime,
  };
};

const validateBolDeliveryOptionAttachment = ({
  selectedDeliveryOption = null,
  labelData = null,
  earliestHandoverDateTime = null,
  latestHandoverDateTime = null,
} = {}) => {
  const expectedShippingLabelOfferId = String(selectedDeliveryOption?.shippingLabelOfferId || '').trim() || null;
  const expectedTransporterCode = String(selectedDeliveryOption?.transporterCode || '').trim().toUpperCase() || null;

  const actualShippingLabelOfferId = String(
    labelData?.shippingLabelOfferId
    || labelData?.shippingLabelOffer?.id
    || ''
  ).trim() || null;
  const actualTransporterCode = String(labelData?.transporterCode || '').trim().toUpperCase() || null;

  const matchesShippingLabelOfferId = expectedShippingLabelOfferId && actualShippingLabelOfferId
    ? expectedShippingLabelOfferId === actualShippingLabelOfferId
    : null;
  const matchesTransporterCode = expectedTransporterCode && actualTransporterCode
    ? expectedTransporterCode === actualTransporterCode
    : null;

  const hasSelectedDeliveryOption = Boolean(selectedDeliveryOption);
  const hasHandoverWindow = Boolean(earliestHandoverDateTime && latestHandoverDateTime);

  const offerIdCheckPass = matchesShippingLabelOfferId === null || matchesShippingLabelOfferId === true;
  const transporterCheckPass = matchesTransporterCode === null || matchesTransporterCode === true;
  const isDeliveryOptionAttached = hasSelectedDeliveryOption && hasHandoverWindow && offerIdCheckPass && transporterCheckPass;

  return {
    isDeliveryOptionAttached,
    hasSelectedDeliveryOption,
    hasHandoverWindow,
    expectedShippingLabelOfferId,
    actualShippingLabelOfferId,
    matchesShippingLabelOfferId,
    expectedTransporterCode,
    actualTransporterCode,
    matchesTransporterCode,
    collectionMethod: selectedDeliveryOption?.handoverDetails?.collectionMethod || null,
    recommended: Boolean(selectedDeliveryOption?.recommended),
  };
};

const extractFirstLinkId = (payload, fragment) => {
  const links = Array.isArray(payload?.links) ? payload.links : [];
  for (const link of links) {
    const href = String(link?.href || '').trim();
    if (!href) continue;
    const regex = new RegExp(`${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/([^/?#]+)`, 'i');
    const match = href.match(regex);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
};

/**
 * Poll for shipping label ID from process status.
 * Bol's label creation is async — the process status may not resolve immediately.
 */
async function pollShippingLabelIdFromProcessStatus(
  credentials,
  processStatusId,
  { maxAttempts = 6, delayMs = 2500 } = {},
) {
  const normalizedId = String(processStatusId || '').trim();
  if (!normalizedId) return null;

  // The Bol process-status endpoint lives at https://api.bol.com/shared/process-status/ (no /retailer prefix).
  // Use the full URL so bolApiRequestRaw doesn't incorrectly prepend /retailer.
  const endpoints = [
    `https://api.bol.com/shared/process-status/${encodeURIComponent(normalizedId)}`,
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    for (const endpoint of endpoints) {
      try {
        const payload = await bolApiRequest(credentials, endpoint);
        const processStatus = String(payload?.status || '').trim().toUpperCase();
        console.log(`[BOL POLL] attempt ${attempt}, endpoint ${endpoint}, status=${processStatus}, entityId=${payload?.entityId}, links=${JSON.stringify(payload?.links)}`);
        if (processStatus === 'PENDING' || processStatus === 'IN_PROGRESS') {
          break; // Break inner loop, try again after delay
        }
        if (processStatus === 'FAILURE' || processStatus === 'ERROR' || processStatus === 'FAILED') {
          console.warn('[BOL POLL] Process status FAILED', JSON.stringify(payload));
          return null;
        }
        if (processStatus === 'SUCCESS') {
          console.log('[BOL POLL] Process SUCCESS full payload', JSON.stringify(payload));
        }

        const directEntityId = String(payload?.entityId || '').trim();
        if (directEntityId) return directEntityId;

        // Try all link relations, not just /shipping-labels/
        const links = Array.isArray(payload?.links) ? payload.links : [];
        for (const link of links) {
          const href = String(link?.href || '').trim();
          const rel = String(link?.rel || '').trim().toLowerCase();
          if (!href) continue;
          // Skip self-referencing process status links
          if (href.includes('/process-status')) continue;
          const idMatch = href.match(/\/([^/]+)\/?$/);
          if (idMatch?.[1] && rel !== 'self') {
            console.log('[BOL POLL] Extracted entity ID from link', { href, rel, id: idMatch[1] });
            return idMatch[1];
          }
        }
        const linkedEntityId = extractFirstLinkId(payload, '/shipping-labels');
        if (linkedEntityId) return linkedEntityId;
      } catch (err) {
        console.warn(`[BOL POLL] attempt ${attempt}, endpoint ${endpoint} failed:`, err?.message);
        // ignore endpoint error, try next endpoint
      }
    }
  }

  return null;
}

async function fetchBolShippingLabelById(credentials, shippingLabelId) {
  const normalizedShippingLabelId = String(shippingLabelId || '').trim();
  if (!normalizedShippingLabelId) {
    throw new Error('Shipping label ID is required');
  }

  const endpoint = `/shipping-labels/${encodeURIComponent(normalizedShippingLabelId)}`;

  // FIX: Request PDF format for actual label PDF — not JSON metadata
  const response = await bolApiRequestRaw(credentials, endpoint, {
    method: 'GET',
    accept: 'application/vnd.retailer.v10+pdf',
    contentType: 'application/vnd.retailer.v10+json',
  });

  if (!response.ok) {
    // If PDF not available, try JSON for metadata/tracking info
    if (response.status === 406) {
      const jsonResponse = await bolApiRequestRaw(credentials, endpoint, {
        method: 'GET',
        accept: 'application/vnd.retailer.v10+json',
        contentType: 'application/vnd.retailer.v10+json',
      });

      if (!jsonResponse.ok) {
        const errorText = await jsonResponse.text();
        throw new Error(`Bol API error: ${jsonResponse.status} - ${errorText}`);
      }

      const jsonPayload = await jsonResponse.json();
      const trackingCode = jsonResponse.headers.get('x-track-and-trace-code') || null;
      const transporterCode = jsonResponse.headers.get('x-transporter-code') || null;
      return {
        ...jsonPayload,
        shippingLabelId: normalizedShippingLabelId,
        trackingCode: jsonPayload?.trackingCode || trackingCode,
        transporterCode: jsonPayload?.transporterCode || transporterCode,
      };
    }

    const errorText = await response.text();
    let errorMessage = `Bol API error: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (response.status === 403) {
        const bolDetail = errorJson?.detail || errorJson?.title || 'Unauthorized request';
        errorMessage = `Geen toegang tot Bol endpoint ${endpoint}: ${bolDetail}`;
      } else if (errorJson.detail) {
        errorMessage += ` - ${errorJson.detail}`;
      }
    } catch {
      errorMessage += ` - ${errorText}`;
    }
    throw new Error(errorMessage);
  }

  const trackingCode = response.headers.get('x-track-and-trace-code') || null;
  const transporterCode = response.headers.get('x-transporter-code') || null;

  const buffer = Buffer.from(await response.arrayBuffer());
  const base64Pdf = buffer.toString('base64');

  return {
    shippingLabelId: normalizedShippingLabelId,
    labelUrl: `data:application/pdf;base64,${base64Pdf}`,
    trackingCode,
    transporterCode,
  };
}

const isUnauthorizedBolError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('geen toegang')
    || message.includes('unauthorized')
    || message.includes('forbidden')
    || message.includes('bol api error: 403')
  );
};

async function getBolLabelWithFallback(credentials, orderId) {
  return getBolLabelWithFallbackInternal(credentials, orderId, { preferredShippingLabelOfferId: null });
}

async function getBolLabelWithFallbackInternal(
  credentials,
  orderId,
  {
    preferredShippingLabelOfferId = null,
    prefetchedOrderItems = null,
  } = {},
) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    throw new Error('Order ID is required to get Bol shipping label');
  }

  const errors = [];
  const normalizedPreferredShippingLabelOfferId = String(preferredShippingLabelOfferId || '').trim();

  // --- Helper: create label from order items + delivery option ---
  const createLabelFromOrderItems = async (orderItemsPayload, preferredOfferId = null) => {
    const orderItems = extractBolOrderItemsForLabel(orderItemsPayload);
    console.log('[BOL LABEL DEBUG] createLabelFromOrderItems', { itemCount: orderItems.length, preferredOfferId });
    if (orderItems.length === 0) return null;

    const handoverWindow = await fetchBolDeliveryOptionHandoverWindow(
      credentials,
      orderItems,
      preferredOfferId || null,
    );

    const selectedDeliveryOption = handoverWindow.selectedDeliveryOption;
    const shippingLabelOfferId = String(selectedDeliveryOption?.shippingLabelOfferId || '').trim();
    console.log('[BOL LABEL DEBUG] selectedDeliveryOption', { shippingLabelOfferId, transporter: selectedDeliveryOption?.transporterCode });

    if (!shippingLabelOfferId) {
      throw new Error('Geen Bol delivery option gevonden voor deze order items');
    }

    const createLabelPayload = await bolApiRequest(
      credentials,
      '/shipping-labels',
      'POST',
      { orderItems, shippingLabelOfferId },
    );
    console.log('[BOL LABEL DEBUG] createLabelPayload', JSON.stringify(createLabelPayload));

    let createdShippingLabelId = String(createLabelPayload?.entityId || '').trim();
    if (!createdShippingLabelId) {
      createdShippingLabelId = extractFirstLinkId(createLabelPayload, '/shipping-labels') || '';
    }

    console.log('[BOL LABEL DEBUG] createdShippingLabelId after entityId/link', createdShippingLabelId);

    // FIX: Use polling instead of single attempt — Bol label creation is async
    const processStatusId = createLabelPayload?.processStatusId
      || extractFirstLinkId(createLabelPayload, '/shared/process-status')
      || extractFirstLinkId(createLabelPayload, '/process-status');
    if (!createdShippingLabelId && processStatusId) {
      console.log('[BOL LABEL DEBUG] polling processStatusId via process-status endpoint', processStatusId);
      createdShippingLabelId = await pollShippingLabelIdFromProcessStatus(credentials, processStatusId, { maxAttempts: 10, delayMs: 3000 }) || '';
      console.log('[BOL LABEL DEBUG] createdShippingLabelId from process status polling', createdShippingLabelId);
    }

    // Fallback: process was submitted (we have a processStatusId) but we couldn't extract the
    // entity ID from the process status response. Try to find the newly created label via shipments.
    if (!createdShippingLabelId && processStatusId) {
      console.log('[BOL LABEL DEBUG] falling back to shipments lookup for label ID');
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const shipmentsPayload = await bolApiRequest(credentials, `/shipments?order-id=${encodeURIComponent(normalizedOrderId)}`);
        const shipmentLabelIds = extractShippingLabelIdsFromResponse(shipmentsPayload);
        if (shipmentLabelIds.length > 0) {
          createdShippingLabelId = shipmentLabelIds[0];
          console.log('[BOL LABEL DEBUG] found shippingLabelId from shipments fallback', createdShippingLabelId);
        }
      } catch (fallbackErr) {
        console.log('[BOL LABEL DEBUG] shipments fallback failed', fallbackErr.message);
      }
    }

    if (!createdShippingLabelId) {
      console.log('[BOL LABEL DEBUG] No shippingLabelId found, returning null');
      return null;
    }

    const labelEndpoint = `/shipping-labels/${encodeURIComponent(createdShippingLabelId)}`;
    const response = await fetchBolShippingLabelById(credentials, createdShippingLabelId);
    const earliestHandoverDateTime = handoverWindow?.earliestHandoverDateTime || null;
    const latestHandoverDateTime = handoverWindow?.latestHandoverDateTime || null;
    const deliveryOptionValidation = validateBolDeliveryOptionAttachment({
      selectedDeliveryOption,
      labelData: response,
      earliestHandoverDateTime,
      latestHandoverDateTime,
    });

    return {
      labelData: {
        ...response,
        earliestHandoverDateTime,
        latestHandoverDateTime,
        deliveryOptionValidation,
      },
      endpoint: labelEndpoint,
    };
  };

  // --- Helper: resolve order items payload ---
  const resolveOrderItemsPayload = async () => {
    // Use pre-fetched order items from the client if available (avoids a /order-items call that may 403)
    if (Array.isArray(prefetchedOrderItems) && prefetchedOrderItems.length > 0) {
      console.log('[BOL LABEL DEBUG] Using pre-fetched orderItems from client', { count: prefetchedOrderItems.length });
      return { orderItems: prefetchedOrderItems };
    }

    try {
      const payload = await bolApiRequest(credentials, `/orders/${encodeURIComponent(normalizedOrderId)}/order-items`);
      if (payload) return payload;
    } catch (error) {
      errors.push({ endpoint: `/orders/${normalizedOrderId}/order-items`, error });
    }

    try {
      const matchingListedOrder = await findOrderInFbrOrderPages(credentials, normalizedOrderId, 8);
      if (matchingListedOrder) {
        return {
          orderItems: Array.isArray(matchingListedOrder.orderItems)
            ? matchingListedOrder.orderItems
            : [],
        };
      }
    } catch (error) {
      errors.push({ endpoint: '/orders?status=ALL&page=*', error });
    }

    return null;
  };

  // 1. If a preferred shippingLabelOfferId was supplied, try that path first
  if (normalizedPreferredShippingLabelOfferId) {
    try {
      const orderItemsPayload = await resolveOrderItemsPayload();
      if (orderItemsPayload) {
        const result = await createLabelFromOrderItems(orderItemsPayload, normalizedPreferredShippingLabelOfferId);
        if (result) return result;
      }
    } catch (error) {
      errors.push({ endpoint: '/shipping-labels/delivery-options|/shipping-labels (preferred offer)', error });
    }
  }

  // 2. Try direct endpoints that may already have a label
  const directEndpoints = [
    `/shipments?order-id=${normalizedOrderId}`,
    `/orders/${normalizedOrderId}/shipment-label`,
    `/orders/${normalizedOrderId}/shipping-label`,
  ];

  for (const endpoint of directEndpoints) {
    try {
      const response = await bolApiRequest(credentials, endpoint);
      return { labelData: response, endpoint };
    } catch (error) {
      errors.push({ endpoint, error });
    }
  }

  // 3. Try to discover a shippingLabelId from order/order-items endpoints
  const shippingLabelIdDiscoveryEndpoints = [
    `/orders/${encodeURIComponent(normalizedOrderId)}`,
    `/orders/${encodeURIComponent(normalizedOrderId)}/order-items`,
  ];

  for (const endpoint of shippingLabelIdDiscoveryEndpoints) {
    try {
      const payload = await bolApiRequest(credentials, endpoint);
      const shippingLabelIds = extractShippingLabelIdsFromResponse(payload);

      for (const shippingLabelId of shippingLabelIds) {
        const labelEndpoint = `/shipping-labels/${encodeURIComponent(shippingLabelId)}`;
        try {
          const response = await fetchBolShippingLabelById(credentials, shippingLabelId);
          return { labelData: response, endpoint: labelEndpoint };
        } catch (error) {
          errors.push({ endpoint: labelEndpoint, error });
        }
      }
    } catch (error) {
      errors.push({ endpoint, error });
    }
  }

  // 4. Create label via delivery options (recommended / auto-select)
  try {
    const orderItemsPayload = await resolveOrderItemsPayload();
    if (orderItemsPayload) {
      const result = await createLabelFromOrderItems(orderItemsPayload, null);
      if (result) return result;
    }
  } catch (error) {
    errors.push({ endpoint: '/shipping-labels/delivery-options|/shipping-labels (auto)', error });
  }

  // 5. Try fetching label from existing shipments
  try {
    const shipmentsPayload = await bolApiRequest(credentials, `/shipments?order-id=${encodeURIComponent(normalizedOrderId)}`);

    if (shipmentsPayload) {
      const shippingLabelIds = extractShippingLabelIdsFromResponse(shipmentsPayload);
      for (const shippingLabelId of shippingLabelIds) {
        const endpoint = `/shipping-labels/${encodeURIComponent(shippingLabelId)}`;
        try {
          const response = await fetchBolShippingLabelById(credentials, shippingLabelId);
          return { labelData: response, endpoint };
        } catch (error) {
          errors.push({ endpoint, error });
        }
      }

      const shipmentIds = extractShipmentIdsFromResponse(shipmentsPayload);
      for (const shipmentId of shipmentIds) {
        for (const endpoint of [
          `/shipments/${encodeURIComponent(shipmentId)}/label`,
          `/shipments/${encodeURIComponent(shipmentId)}/shipment-label`,
        ]) {
          try {
            const response = await bolApiRequest(credentials, endpoint);
            return { labelData: { ...response, shipmentId }, endpoint };
          } catch (error) {
            errors.push({ endpoint, error });
          }
        }
      }
    }
  } catch (error) {
    errors.push({ endpoint: `/shipments?order-id=${normalizedOrderId}`, error });
  }

  // Surface the most useful error
  const unauthorizedErrors = errors.filter(({ error }) => isUnauthorizedBolError(error));
  if (unauthorizedErrors.length > 0 && unauthorizedErrors.length === errors.length) {
    const attemptedEndpoints = errors.map(({ endpoint }) => endpoint).join(', ');
    const baseUnauthorizedMessage = String(
      unauthorizedErrors[unauthorizedErrors.length - 1].error?.message
      || 'Geen toegang tot Bol endpoints'
    );
    throw new Error(`${baseUnauthorizedMessage} (Endpoints: ${attemptedEndpoints})`);
  }

  const lastError = errors[errors.length - 1]?.error;
  if (lastError) {
    const attemptedEndpoints = errors.map(({ endpoint }) => endpoint).join(', ');
    throw new Error(`${String(lastError?.message || 'Onbekende fout')} (Endpoints: ${attemptedEndpoints})`);
  }

  throw new Error('Kon geen Bol label ophalen via beschikbare endpoints');
}

async function fetchAllBolOrders(credentials) {
  const maxPages = 200;
  const statusesToFetch = [
    'ALL',
    'OPEN',
    'PROCESSING',
    'PROCESSED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
  ];
  const dedupedOrders = new Map();

  for (const status of statusesToFetch) {
    for (let page = 1; page <= maxPages; page += 1) {
      let response;

      try {
        response = await bolApiRequest(
          credentials,
          `/orders?status=${encodeURIComponent(status)}&page=${page}`,
        );
      } catch (error) {
        if (page === 1) {
          console.warn('[BOL SYNC] Skipping unsupported status filter', {
            status,
            message: error.message,
          });
        }
        break;
      }

      const pageOrders = Array.isArray(response?.orders) ? response.orders : [];
      if (pageOrders.length === 0) {
        break;
      }

      for (const order of pageOrders) {
        const orderId = String(order?.orderId || order?.orderNumber || '').trim();
        if (!orderId) continue;

        if (!dedupedOrders.has(orderId)) {
          dedupedOrders.set(orderId, order);
          continue;
        }

        const existingOrder = dedupedOrders.get(orderId);
        const existingStatus = String(existingOrder?.status || '').trim();
        const incomingStatus = String(order?.status || '').trim();
        if (!existingStatus && incomingStatus) {
          dedupedOrders.set(orderId, { ...existingOrder, ...order });
        }
      }

      if (pageOrders.length < 50) {
        break;
      }
    }
  }

  return Array.from(dedupedOrders.values());
}

async function findOrderInFbrOrderPages(credentials, orderId, maxPages = 8) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) return null;

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await bolApiRequest(credentials, `/orders?status=ALL&page=${page}`);
    const pageOrders = Array.isArray(response?.orders) ? response.orders : [];

    if (pageOrders.length === 0) return null;

    const match = pageOrders.find((order) => {
      const listedOrderId = String(order?.orderId || order?.orderNumber || '').trim();
      return listedOrderId === normalizedOrderId;
    });

    if (match) return match;
    if (pageOrders.length < 50) return null;
  }

  return null;
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

const hasNonEmptyValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
};

const normalizeStatusToken = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const toOrderStatusCode = (value) => {
  const normalized = normalizeStatusToken(value);

  const shippedTokens = new Set([
    'verzonden',
    'verstuurd',
    'afgeleverd',
    'shipped',
    'delivered',
    'send',
    'sent',
    'processed',
    'finished',
    'dispatched',
    'fulfilled',
    'fulfilment_completed',
    'fulfillment_completed',
    'completed',
  ]);

  if (normalized === 'shipped' || shippedTokens.has(normalized)) {
    return 'SHIPPED';
  }

  return 'OPEN';
};

const ensureOrderStatusCodes = async () => {
  await Promise.all([
    prisma.orderStatus.upsert({
      where: { code: 'OPEN' },
      update: {},
      create: { code: 'OPEN' },
    }),
    prisma.orderStatus.upsert({
      where: { code: 'SHIPPED' },
      update: {},
      create: { code: 'SHIPPED' },
    }),
  ]);
};

const SHIPPED_STATUS_TOKENS = new Set([
  'verzonden',
  'verstuurd',
  'send',
  'sent',
  'shipped',
  'processed',
  'finished',
  'dispatched',
  'fulfilled',
  'fulfilment_completed',
  'fulfillment_completed',
  'completed',
]);

const DELIVERED_STATUS_TOKENS = new Set(['afgeleverd', 'delivered']);

const SHIPMENT_CONFIRMATION_KEY_PATTERN = /(^|_)(shipment(id|status|reference)?|shipped(at|date|datetime|time)?|fulfil(l?ment)?(_?(status|date|time))?|dispatch(ed)?(_?(status|date|time))?|process(ed)?(_?(status|id|date|time))?|track(andtrace|ing(code|number)?|_?trace)|tracking(code|number)?|parcel(labelnumber)?|shippinglabel(id|status)?|label(id|status)?|transporter(code)?)(_|$)/i;

const collectShipmentConfirmationSignals = (input) => {
  const signals = [];
  const visited = new Set();

  const visit = (node, parentKey = '') => {
    if (node === null || node === undefined) return;

    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      if (SHIPMENT_CONFIRMATION_KEY_PATTERN.test(parentKey) && hasNonEmptyValue(node)) {
        signals.push({ key: parentKey, value: node });
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
      visit(value, key);
    }
  };

  visit(input);
  return signals;
};

const hasBolShipmentConfirmation = ({ orderPayload = null, shipmentPayload = null, shipmentList = [] } = {}) => {
  const normalizedShipmentList = Array.isArray(shipmentList) ? shipmentList : [];
  if (normalizedShipmentList.length > 0) {
    return true;
  }

  const shipmentSignals = collectShipmentConfirmationSignals(shipmentPayload);
  if (shipmentSignals.length > 0) {
    return true;
  }

  const orderSignals = collectShipmentConfirmationSignals(orderPayload).filter(({ key }) =>
    !/expected|promise|promised|latest|delivery/i.test(String(key || ''))
  );

  return orderSignals.length > 0;
};

/**
 * FIX: resolvePersistedOrderStatus is removed.
 *
 * Previously this function would permanently "lock" an order as verzonden once
 * it had been marked shipped — even if Bol's live data said otherwise.
 * We now always trust Bol's live status from the API instead.
 */

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

const enrichBolProductData = async ({ credentials, ean }) => {
  const eanValue = firstNonEmptyString(ean);

  if (!eanValue) {
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
      product: { ...(data?.product || {}) },
      assetsByUsage: assetResponses,
      assets: assetResponses.map((assetResponse) => assetResponse.data).filter(Boolean),
    };

    const resolvedImage = resolveImageFromBolEnrichment(mergedEnrichmentData);

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

    await ensureOrderStatusCodes();

    const { integration, credentials } = await getBolIntegration(installationId, integrationId);
    const integrationCredentials = JSON.parse(integration.credentials || '{}');
    const integrationShopName = integrationCredentials.shopName || `Bol.com #${integration.id}`;

    const bolOrders = await fetchAllBolOrders(credentials);

    console.log('[BOL SYNC] Fetched orders from Bol.com:', { totalOrders: bolOrders.length });

    let importedCount = 0;
    let updatedCount = 0;
    const enrichmentCache = new Map();

    for (const bolOrder of bolOrders) {
      const currentBolOrderId = String(bolOrder?.orderId || bolOrder?.orderNumber || '').trim();

      let bolOrderDetails = null;
      let bolOrderItemsDetails = null;
      let bolShipmentDetails = null;

      try {
        bolOrderDetails = await bolApiRequest(credentials, `/orders/${bolOrder.orderId}`);
      } catch (detailError) {
        console.warn('[BOL SYNC] Failed to fetch order details:', detailError.message);
      }

      try {
        bolOrderItemsDetails = await bolApiRequest(credentials, `/orders/${bolOrder.orderId}/order-items`);
      } catch (detailError) {
        console.warn('[BOL SYNC] Failed to fetch order items details:', detailError.message);
      }

      try {
        bolShipmentDetails = await bolApiRequest(credentials, `/shipments?order-id=${bolOrder.orderId}`);
      } catch (detailError) {
        console.warn('[BOL SYNC] Failed to fetch shipment details:', detailError.message);
      }

      const orderPayload = bolOrderDetails || bolOrder;
      const baseOrderItems = orderPayload.orderItems || bolOrder.orderItems || [];
      const detailedOrderItems = bolOrderItemsDetails?.orderItems || [];
      const orderItems = mergeBolOrderItems(baseOrderItems, detailedOrderItems);
      const shipmentDetails = orderPayload.shipmentDetails || orderPayload.billingDetails || {};
      const shipmentList = Array.isArray(bolShipmentDetails?.shipments)
        ? bolShipmentDetails.shipments
        : [];
      const firstShipment = shipmentList[0] || null;
      const shipmentConfirmedByBol = hasBolShipmentConfirmation({
        orderPayload,
        shipmentPayload: bolShipmentDetails,
        shipmentList,
      });
      const resolvedTrackAndTrace = firstNonEmptyString(
        firstShipment?.transport?.trackAndTrace,
        firstShipment?.trackAndTrace,
        firstShipment?.trackingCode,
        firstShipment?.trackingNumber,
        firstShipment?.parcelLabelNumber,
        findStringValueByKey(firstShipment, /(track.?and.?trace|tracking.?code|tracking.?number|parcel.?label.?number)/i),
        findStringValueByKey(bolShipmentDetails, /(track.?and.?trace|tracking.?code|tracking.?number|parcel.?label.?number)/i),
      );
      const resolvedTransporterCode = firstNonEmptyString(
        firstShipment?.transport?.transporterCode,
        firstShipment?.transporterCode,
        firstShipment?.transporter,
        findStringValueByKey(firstShipment, /(transporter.?code|carrier.?code|carrier)/i),
      );

      const bolStatusCandidates = [
        firstNonEmptyString(bolOrder?.status),
        firstNonEmptyString(orderPayload?.status),
        firstNonEmptyString(firstShipment?.status),
        firstNonEmptyString(firstShipment?.shipmentStatus),
        firstNonEmptyString(firstShipment?.transport?.status),
        findStringValueByKey(firstShipment, /(^|_)(status|shipment.?status|order.?status)$/i),
        findStringValueByKey(bolShipmentDetails, /(^|_)(status|shipment.?status|order.?status)$/i),
        shipmentConfirmedByBol ? 'SHIPPED' : null,
      ].filter(Boolean);

      const resolvedBolOrderStatus = resolvePrimaryBolStatus(bolStatusCandidates);
      const resolvedShippingStatus = resolvedBolOrderStatus || null;

      // FIX: Always derive status from live Bol data — never from previously persisted DB status.
      // This prevents orders from getting permanently stuck as "verzonden".
      const resolvedInternalStatus = resolveBolStatusToInternal({
        statuses: bolStatusCandidates,
        hasTrackAndTrace: Boolean(resolvedTrackAndTrace) || shipmentConfirmedByBol,
      });

      const finalInternalStatus = resolvedInternalStatus;
      const finalOrderStatus = resolvedBolOrderStatus || finalInternalStatus;
      const finalOrderStatusCode = toOrderStatusCode(finalInternalStatus || finalOrderStatus);

      const deliveryDate = resolveBolDeliveryDate(orderPayload, orderItems, bolShipmentDetails);
      const resolvedBolShippingMethod = inferBolShippingMethodFromOrderData({
        orderPayload,
        bolOrder,
        orderItems,
        shippingMethod: orderPayload?.shippingMethod,
        bolShippingMethod: orderPayload?.bolShippingMethod,
      });

      const distributionPartyCandidates = [
        orderPayload?.distributionParty,
        orderPayload?.distribution_party,
        bolOrder?.distributionParty,
        bolOrder?.distribution_party,
        ...orderItems.flatMap((item) => [
          item?.distributionParty,
          item?.distribution_party,
        ]),
        findStringValueByKey(orderPayload, /distribution.?party/i),
        findStringValueByKey(bolOrder, /distribution.?party/i),
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      const isVvbOrder = distributionPartyCandidates.some(
        (value) => value.toUpperCase() === 'BOL'
      );
      const mailboxOrder = inferIsMailboxFromOrderData({
        orderPayload,
        orderItems,
        shippingDescription: shipmentDetails?.deliveryMethod,
      });

      const existingOrder = await prisma.order.findFirst({
        where: {
          orderNumber: bolOrder.orderId,
          installationId: parseInt(installationId),
        },
        select: {
          id: true,
          storeName: true,
          installationId: true,
          orderStatus: true,
          status: true,
          supplierTracking: true,
          tracking: { select: { trackingCode: true } },
          label: { select: { status: true } },
        },
      });

      const conflictingOrder = await prisma.order.findFirst({
        where: {
          orderNumber: bolOrder.orderId,
          NOT: { installationId: parseInt(installationId) },
        },
        select: { id: true, installationId: true, storeName: true },
      });

      if (!existingOrder && conflictingOrder) {
        console.warn('[BOL SYNC] Skipping conflicting orderNumber from another installation', {
          orderNumber: bolOrder.orderId,
          targetInstallationId: parseInt(installationId),
          conflictingInstallationId: conflictingOrder.installationId,
        });
        continue;
      }

      if (!integrationId && existingOrder && existingOrder.storeName && existingOrder.storeName !== integrationShopName) {
        console.warn('[BOL SYNC] Skipping conflicting orderNumber from another integration/store', {
          orderNumber: bolOrder.orderId,
          existingStoreName: existingOrder.storeName,
          incomingStoreName: integrationShopName,
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

      const resolvedOrderShippingMethod = isVvbOrder
        ? 'Bol.com'
        : (shippingAutomationResult.shippingAssignment || null);

      // Never downgrade a locally-confirmed shipment back to an open state during sync.
      // This covers the window between label generation / POST /shipments and Bol's own
      // status update propagating back. Cancellations and deliveries from Bol still win.
      const localShipmentStatuses = new Set(['verzonden', 'label-aangemaakt']);
      const syncOpenStatuses = new Set(['openstaand', 'onderweg-ffm', 'binnengekomen-ffm']);
      const bolIsDowngradingShipment =
        existingOrder &&
        localShipmentStatuses.has(existingOrder.status) &&
        syncOpenStatuses.has(finalInternalStatus);

      const syncedStatus = bolIsDowngradingShipment ? existingOrder.status : finalInternalStatus;
      const syncedOrderStatus = bolIsDowngradingShipment ? existingOrder.orderStatus : finalOrderStatus;
      const syncedOrderStatusCode = bolIsDowngradingShipment
        ? toOrderStatusCode(existingOrder.orderStatus)
        : finalOrderStatusCode;

      const orderData = {
        orderNumber: bolOrder.orderId,
        installationId: parseInt(installationId),
        userId: req.user.id,
        customerName,
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
        orderStatus: syncedOrderStatus,
        orderStatusCode: syncedOrderStatusCode,
        shippingStatus: resolvedShippingStatus || null,
        isVVB: isVvbOrder,
        orderValue: parseFloat(orderItems?.reduce((sum, item) => {
          const unitPrice = parseFloat(item.unitPrice ?? item.totalPrice ?? item.offerPrice ?? 0) || 0;
          return sum + (unitPrice * (item.quantity || 1));
        }, 0) || 0),
        itemCount: orderItems?.length || 1,
        ...(resolvedTrackAndTrace ? { supplierTracking: resolvedTrackAndTrace } : {}),
        status: syncedStatus,
        fulfillmentType: null,
      };

      // Resolve handover window dates for VVB orders (drop-off dates only — not shipping status)
      if (isVvbOrder && orderItems.length > 0) {
        try {
          const bolLabelOrderItems = orderItems
            .map((item) => {
              const orderItemId = String(item?.orderItemId || item?.id || '').trim();
              if (!orderItemId) return null;

              const rawQuantity = Number(item?.quantity || item?.amount || item?.quantityOrdered || 1);
              const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0
                ? Math.max(1, Math.floor(rawQuantity))
                : 1;

              return { orderItemId, quantity };
            })
            .filter(Boolean);

          if (bolLabelOrderItems.length > 0) {
            const handoverWindow = await fetchBolDeliveryOptionHandoverWindow(credentials, bolLabelOrderItems);
            orderData.earliestDropOffDate = toValidDate(handoverWindow.earliestHandoverDateTime);
            orderData.latestDropOffDate = toValidDate(handoverWindow.latestHandoverDateTime);
          }
        } catch (handoverError) {
          console.warn('[BOL SYNC] Failed to resolve handover window from delivery options', {
            orderId: bolOrder.orderId,
            message: handoverError?.message || String(handoverError),
          });
        }
      }

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

      if (resolvedTrackAndTrace) {
        await prisma.tracking.upsert({
          where: { orderId: savedOrder.id },
          update: {
            trackingCode: resolvedTrackAndTrace,
            supplier: resolvedTransporterCode || 'bol.com',
            source: 'bol_sync',
            status: 'linked',
          },
          create: {
            orderId: savedOrder.id,
            trackingCode: resolvedTrackAndTrace,
            supplier: resolvedTransporterCode || 'bol.com',
            source: 'bol_sync',
            status: 'linked',
          },
        });
      }

      if (isVvbOrder || resolvedOrderShippingMethod) {
        try {
          await prisma.$executeRaw`
            UPDATE \`Order\`
            SET shippingMethod = ${isVvbOrder ? 'Bol.com' : resolvedOrderShippingMethod}, updatedAt = NOW()
            WHERE id = ${savedOrder.id} AND installationId = ${parseInt(installationId)}
          `;
        } catch (shippingMethodError) {
          console.warn('[BOL SYNC] Failed to persist shippingMethod via raw SQL', {
            orderId: savedOrder.id,
            orderNumber: bolOrder.orderId,
            message: shippingMethodError.message,
          });
        }
      }

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
              const enrichment = await enrichBolProductData({ credentials, ean });
              enrichmentCache.set(enrichmentCacheKey, enrichment || null);
            }

            const enrichmentResponse = enrichmentCache.get(enrichmentCacheKey);
            if (enrichmentResponse) {
              if (!resolvedProductImage) {
                resolvedProductImage = firstNonEmptyString(
                  enrichmentResponse.resolvedImage,
                  resolveImageFromBolEnrichment(enrichmentResponse.data)
                );
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
            select: { id: true, image: true },
          });

          const normalizedProductName = normalizeProductName(productName);

          if (product) {
            product = await prisma.product.update({
              where: { id: product.id },
              data: {
                ean: ean || undefined,
                name: normalizedProductName,
                image: resolvedProductImage || undefined,
                brand: resolvedProductBrand || undefined,
                internalRef: internalRef || sku,
                price: effectiveUnitPrice,
              },
              select: { id: true, image: true },
            });
          } else {
            product = await prisma.product.create({
              data: {
                installationId: installationIdNumber,
                sku,
                ean,
                name: normalizedProductName,
                image: resolvedProductImage,
                brand: resolvedProductBrand,
                internalRef: internalRef || sku,
                price: effectiveUnitPrice,
                sizeCategory: null,
              },
              select: { id: true, image: true },
            });
          }

          await prisma.orderItem.create({
            data: {
              orderId: savedOrder.id,
              productId: product.id,
              productName: normalizedProductName,
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
    if (error?.code === 'P2000') {
      return res.status(400).json({
        error: 'One or more fields are too long to save',
        details: error?.meta?.target ? `Field: ${error.meta.target}` : undefined,
      });
    }
    res.status(500).json({
      error: 'Failed to sync orders from Bol.com',
      details: error.message,
    });
  }
};

/**
 * Get shipping label from Bol.com.
 *
 * FIX: This no longer unconditionally marks orders as "verzonden".
 * Status is only updated if the label contains a confirmed tracking code,
 * which means Bol has actually shipped the order.
 */
export const getBolShippingLabel = async (req, res) => {
  try {
    const {
      installationId,
      orderId,
      integrationId,
      shippingLabelOfferId,
      orderItems: bodyOrderItems,
    } = req.body || {};

    if (!installationId || !orderId) {
      return res.status(400).json({ error: 'Installation ID and Order ID are required' });
    }

    const normalizedOrderId = String(orderId).trim();
    const installationIdNumber = parseInt(installationId, 10);

    const matchingOrders = await prisma.order.findMany({
      where: { orderNumber: normalizedOrderId },
      select: { id: true, installationId: true, isVVB: true },
    });

    const orderScopedInstallations = Array.from(new Set(
      matchingOrders
        .map((order) => Number(order.installationId))
        .filter((id) => Number.isInteger(id) && id > 0)
    ));

    const requestedInstallationCandidates = await getBolIntegrationCandidates(installationId, integrationId);

    const orderScopedInstallationIntegrations = orderScopedInstallations.length > 0
      ? await prisma.integration.findMany({
          where: {
            installationId: { in: orderScopedInstallations },
            platform: 'bol.com',
            active: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : [];

    const prioritizedIntegrations = [
      ...orderScopedInstallationIntegrations,
      ...requestedInstallationCandidates.map((entry) => entry.integration),
    ];

    const fallbackInstallationIds = Array.from(new Set([
      ...orderScopedInstallations,
      ...(Number.isFinite(installationIdNumber) && installationIdNumber > 0 ? [installationIdNumber] : []),
    ]));

    const inactiveFallbackIntegrations = fallbackInstallationIds.length > 0
      ? await prisma.integration.findMany({
          where: {
            installationId: { in: fallbackInstallationIds },
            platform: 'bol.com',
          },
          orderBy: [
            { active: 'desc' },
            { updatedAt: 'desc' },
          ],
        })
      : [];

    const allCandidateIntegrations = [
      ...prioritizedIntegrations,
      ...inactiveFallbackIntegrations,
    ];

    const integrationCandidates = Array.from(
      new Map(allCandidateIntegrations.map((entry) => [entry.id, entry])).values()
    ).map((integration) => ({
      integration,
      credentials: JSON.parse(integration.credentials),
    }));

    if (integrationCandidates.length === 0) {
      throw new Error('Bol.com integration not found or not active');
    }

    // Determine if this is a VVB order so we can auto-supply the preferred offer ID
    const isVvbOrder = matchingOrders.some((o) => o.isVVB);
    console.log('[BOL LABEL DEBUG] getBolShippingLabel called', { normalizedOrderId, installationId, integrationId, shippingLabelOfferId, isVvbOrder, matchingOrderCount: matchingOrders.length });

    let labelData = null;
    let successfulIntegrationId = null;
    let successfulCredentials = null;
    let lastError = null;
    const attemptedIntegrationIds = [];

    for (const candidate of integrationCandidates) {
      try {
        attemptedIntegrationIds.push(candidate.integration.id);

        // For VVB orders with no explicit offer ID, resolve delivery options first
        let resolvedShippingLabelOfferId = String(shippingLabelOfferId || '').trim() || null;

        if (isVvbOrder && !resolvedShippingLabelOfferId) {
          try {
            let orderItemsPayload = null;
            try {
              orderItemsPayload = await bolApiRequest(
                candidate.credentials,
                `/orders/${encodeURIComponent(normalizedOrderId)}/order-items`,
              );
            } catch {
              const listedOrder = await findOrderInFbrOrderPages(candidate.credentials, normalizedOrderId, 8);
              if (listedOrder) {
                orderItemsPayload = {
                  orderItems: Array.isArray(listedOrder.orderItems) ? listedOrder.orderItems : [],
                };
              }
            }

            if (orderItemsPayload) {
              const orderItems = extractBolOrderItemsForLabel(orderItemsPayload);
              if (orderItems.length > 0) {
                const handoverWindow = await fetchBolDeliveryOptionHandoverWindow(
                  candidate.credentials,
                  orderItems,
                  null,
                );
                resolvedShippingLabelOfferId = String(
                  handoverWindow.selectedDeliveryOption?.shippingLabelOfferId || ''
                ).trim() || null;
              }
            }
          } catch (offerResolutionError) {
            console.warn('[BOL LABEL] Failed to auto-resolve shippingLabelOfferId for VVB order', {
              orderId: normalizedOrderId,
              message: offerResolutionError.message,
            });
          }
        }

        const prefetchedOrderItems = Array.isArray(bodyOrderItems) && bodyOrderItems.length > 0
          ? bodyOrderItems
          : null;

        const fallbackResult = await getBolLabelWithFallbackInternal(
          candidate.credentials,
          orderId,
          {
            preferredShippingLabelOfferId: resolvedShippingLabelOfferId,
            prefetchedOrderItems,
          },
        );
        labelData = fallbackResult.labelData;
        successfulIntegrationId = candidate.integration.id;
        successfulCredentials = candidate.credentials;
        break;
      } catch (candidateError) {
        lastError = candidateError;
        if (!isUnauthorizedBolError(candidateError)) {
          throw candidateError;
        }
      }
    }

    if (!labelData) {
      const baseMessage = String(lastError?.message || 'Geen bruikbare Bol.com integratie gevonden voor shipment-label endpoint');
      throw new Error(`${baseMessage} (Geprobeerd met integraties: ${attemptedIntegrationIds.join(', ') || 'geen'})`);
    }

    const earliestDropOffDate = toValidDate(labelData?.earliestHandoverDateTime);
    const latestDropOffDate = toValidDate(labelData?.latestHandoverDateTime);

    // Save the PDF to disk and persist a Label record so the label survives
    // dialog close / page reload (same as DHL/DPD labels in carrierController).
    let rawLabelDataUri = String(labelData?.labelUrl || '').trim();

    // Bol's JSON label API returns the PDF as base64 in a `body` field rather than a data URI.
    // Convert it so the disk-save path below can handle it uniformly.
    if (!rawLabelDataUri) {
      const bodyBase64 = String(labelData?.body || '').trim();
      if (bodyBase64 && /^JVBER/i.test(bodyBase64)) {
        rawLabelDataUri = `data:application/pdf;base64,${bodyBase64}`;
      }
    }
    let persistedLabelUrl = rawLabelDataUri; // fallback: return data URI if file save fails

    if (rawLabelDataUri.startsWith('data:')) {
      try {
        const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
        const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
        const requestHost = forwardedHost || String(req.get('host') || '').trim();
        const protocol =
          req.secure || forwardedProto === 'https' || process.env.FORCE_LABEL_HTTPS === 'true' || process.env.NODE_ENV === 'production'
            ? 'https'
            : req.protocol;

        const dataUrlMatch = rawLabelDataUri.match(/^data:([^;]+);base64,(.+)$/i);
        if (dataUrlMatch) {
          const mimeType = String(dataUrlMatch[1] || 'application/pdf').toLowerCase();
          const base64Payload = dataUrlMatch[2] || '';
          const extension = mimeType.includes('pdf') ? 'pdf' : 'bin';
          const targetOrderDbId = matchingOrders[0]?.id || 'unknown';
          const fileName = `label-${targetOrderDbId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
          const filePath = path.join(LABEL_STORAGE_DIR, fileName);

          await fs.mkdir(LABEL_STORAGE_DIR, { recursive: true });
          await fs.writeFile(filePath, Buffer.from(base64Payload, 'base64'));

          persistedLabelUrl = `${protocol}://${requestHost}/labels/${fileName}`;
          labelData = { ...labelData, labelUrl: persistedLabelUrl };

          console.log('[BOL LABEL] Saved label to disk', { orderId: normalizedOrderId, fileName, persistedLabelUrl });
        }
      } catch (saveError) {
        console.warn('[BOL LABEL] Failed to save label to disk, returning data URI', {
          orderId: normalizedOrderId,
          message: saveError?.message,
        });
      }
    }

    // Persist Label records for all matched order rows
    const targetOrderDbIds = matchingOrders.map((o) => o.id).filter(Boolean);
    if (targetOrderDbIds.length > 0 && persistedLabelUrl) {
      try {
        await Promise.all(
          targetOrderDbIds.map((dbOrderId) =>
            prisma.label.upsert({
              where: { orderId: dbOrderId },
              update: { labelUrl: persistedLabelUrl.length <= 191 ? persistedLabelUrl : null, status: 'generated', carrierId: null },
              create: { orderId: dbOrderId, labelUrl: persistedLabelUrl.length <= 191 ? persistedLabelUrl : null, status: 'generated', carrierId: null },
            }),
          ),
        );
      } catch (labelDbError) {
        console.warn('[BOL LABEL] Failed to persist Label record to database', {
          orderId: normalizedOrderId,
          message: labelDbError?.message,
        });
      }
    }

    // Mark as verzonden if we have a confirmed tracking code (bol has shipped the order).
    // Otherwise mark as label-aangemaakt — generating a label confirms the order is being processed
    // but has not been physically shipped yet.
    // Drop-off dates are always updated because they come from delivery options, not shipment status.
    const hasConfirmedTrackingCode = Boolean(labelData?.trackingCode);

    await prisma.order.updateMany({
      where: {
        orderNumber: normalizedOrderId,
        ...(orderScopedInstallations.length > 0
          ? { installationId: { in: orderScopedInstallations } }
          : (Number.isFinite(installationIdNumber) ? { installationId: installationIdNumber } : {})),
      },
      data: {
        orderStatus: hasConfirmedTrackingCode ? 'verzonden' : 'label-aangemaakt',
        status: hasConfirmedTrackingCode ? 'verzonden' : 'label-aangemaakt',
        ...(hasConfirmedTrackingCode ? { orderStatusCode: 'SHIPPED' } : {}),
        ...(earliestDropOffDate ? { earliestDropOffDate } : {}),
        ...(latestDropOffDate ? { latestDropOffDate } : {}),
      },
    });

    // Confirm shipment with Bol.com so the order is marked as shipped on their side.
    // For VVB orders the carrier is assigned by Bol; for FBR we pass whatever the label returned.
    // Failures here are non-fatal — the label has already been generated and saved.
    if (successfulCredentials) {
      try {
        // Order items oplossen: eerst van de client, anders backend-side bij Bol ophalen.
        let shipmentOrderItems = Array.isArray(bodyOrderItems) && bodyOrderItems.length > 0
          ? extractBolOrderItemsForLabel({ orderItems: bodyOrderItems })
          : null;

        if (!shipmentOrderItems || shipmentOrderItems.length === 0) {
          let orderItemsPayload = null;
          try {
            orderItemsPayload = await bolApiRequest(
              successfulCredentials,
              `/orders/${encodeURIComponent(normalizedOrderId)}/order-items`,
            );
          } catch {
            const listedOrder = await findOrderInFbrOrderPages(successfulCredentials, normalizedOrderId, 8);
            if (listedOrder) {
              orderItemsPayload = { orderItems: Array.isArray(listedOrder.orderItems) ? listedOrder.orderItems : [] };
            }
          }
          if (orderItemsPayload) {
            shipmentOrderItems = extractBolOrderItemsForLabel(orderItemsPayload);
          }
        }

        const resolvedShippingLabelId = String(labelData?.shippingLabelId || '').trim();

        if (shipmentOrderItems && shipmentOrderItems.length > 0) {
          const shipmentBody = { orderItems: shipmentOrderItems };

          // VVB: koppel de aangemaakte Bol shipping label zodat Bol de transporter
          // + track & trace automatisch toewijst en de order op verzonden zet.
          if (resolvedShippingLabelId) {
            shipmentBody.shippingLabelId = resolvedShippingLabelId;
          } else if (labelData?.transporterCode || labelData?.trackingCode) {
            shipmentBody.transport = {};
            if (labelData.transporterCode) shipmentBody.transport.transporterCode = labelData.transporterCode;
            if (labelData.trackingCode) shipmentBody.transport.trackAndTrace = labelData.trackingCode;
          }

          await bolApiRequest(successfulCredentials, '/shipments', 'POST', shipmentBody);
          console.log('[BOL LABEL] Shipment confirmed with Bol.com', { orderId: normalizedOrderId, shippingLabelId: resolvedShippingLabelId || null });

          // Lokale status ook op verzonden nu Bol bevestigd heeft
          await prisma.order.updateMany({
            where: {
              orderNumber: normalizedOrderId,
              ...(orderScopedInstallations.length > 0
                ? { installationId: { in: orderScopedInstallations } }
                : (Number.isFinite(installationIdNumber) ? { installationId: installationIdNumber } : {})),
            },
            data: { status: 'verzonden', orderStatus: 'verzonden', orderStatusCode: 'SHIPPED' },
          });
        } else {
          console.warn('[BOL LABEL] Kon order items niet oplossen om shipment te bevestigen', { orderId: normalizedOrderId });
        }
      } catch (shipmentError) {
        console.warn('[BOL LABEL] Failed to confirm shipment with Bol.com (non-fatal)', {
          orderId: normalizedOrderId,
          message: shipmentError?.message,
        });
      }
    }

    res.json({
      ...labelData,
      integrationId: successfulIntegrationId,
    });
  } catch (error) {
    console.error('Get Bol shipping label error:', error);
    const errorDetails = error?.message || 'Unknown error';
    const normalizedErrorDetails = String(errorDetails).toLowerCase();
    const statusCode = normalizedErrorDetails.includes('geen toegang') || normalizedErrorDetails.includes('unauthorized')
      ? 403
      : 500;

    res.status(statusCode).json({
      error: 'Failed to get shipping label from Bol.com',
      details: errorDetails,
    });
  }
};

export const getBolDeliveryOptions = async (req, res) => {
  try {
    const { installationId, orderId, integrationId } = req.query;

    if (!installationId || !orderId) {
      return res.status(400).json({ error: 'Installation ID and Order ID are required' });
    }

    const { credentials } = await getBolIntegration(installationId, integrationId);
    const normalizedOrderId = String(orderId || '').trim();

    let orderItemsPayload = null;
    try {
      orderItemsPayload = await bolApiRequest(credentials, `/orders/${encodeURIComponent(normalizedOrderId)}`);
    } catch (err) {
      console.warn('[BOL DELIVERY OPTIONS] /orders/{id} failed', { orderId: normalizedOrderId, message: err?.message });
    }

    if (!orderItemsPayload) {
      const matchingListedOrder = await findOrderInFbrOrderPages(credentials, normalizedOrderId, 8);
      if (matchingListedOrder) {
        orderItemsPayload = {
          orderItems: Array.isArray(matchingListedOrder.orderItems)
            ? matchingListedOrder.orderItems
            : [],
        };
      }
    }

    if (!orderItemsPayload) {
      return res.status(404).json({ error: 'Order items not found for this Bol order' });
    }

    const orderItems = extractBolOrderItemsForLabel(orderItemsPayload);
    if (orderItems.length === 0) {
      return res.status(404).json({ error: 'No order items available to resolve delivery options' });
    }

    const handoverWindow = await fetchBolDeliveryOptionHandoverWindow(credentials, orderItems);
    const deliveryOptions = Array.isArray(handoverWindow.deliveryOptionsPayload?.deliveryOptions)
      ? handoverWindow.deliveryOptionsPayload.deliveryOptions
      : [];

    res.json({
      success: true,
      orderItems,
      deliveryOptions,
      selectedDeliveryOption: handoverWindow.selectedDeliveryOption,
    });
  } catch (error) {
    console.error('Get Bol delivery options error:', error);
    res.status(500).json({
      error: 'Failed to get Bol delivery options',
      details: error?.message || 'Unknown error',
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

    const updatedOrder = await prisma.order.update({
      where: { orderNumber: orderId },
      data: {
        status: 'verzonden',
        orderStatus: 'verzonden',
        orderStatusCode: 'SHIPPED',
        shippingStatus: 'SHIPPED',
        ...(trackAndTrace ? { supplierTracking: trackAndTrace } : {}),
      },
      select: { id: true },
    });

    if (trackAndTrace) {
      await prisma.tracking.upsert({
        where: { orderId: updatedOrder.id },
        update: {
          trackingCode: trackAndTrace,
          supplier: transporterCode || 'bol.com',
          source: 'bol_shipment_update',
          status: 'linked',
        },
        create: {
          orderId: updatedOrder.id,
          trackingCode: trackAndTrace,
          supplier: transporterCode || 'bol.com',
          source: 'bol_shipment_update',
          status: 'linked',
        },
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Update Bol shipment error:', error);
    res.status(500).json({
      error: 'Failed to update shipment on Bol.com',
      details: error.message,
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
    const returns = await bolApiRequest(credentials, `/returns?page=${page}`);

    res.json(returns);
  } catch (error) {
    console.error('Get Bol returns error:', error);
    res.status(500).json({
      error: 'Failed to get returns from Bol.com',
      details: error.message,
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

    const returnData = {
      quantityReturned,
      handlingResult,
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
      details: error.message,
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

  return payload || { success: true, imported: 0, updated: 0, total: 0 };
};

// Helper function to map Bol status to internal status
function mapBolStatusToInternal(bolStatus) {
  const normalizedStatus = String(bolStatus || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  const statusMap = {
    'OPEN': 'openstaand',
    'NEW': 'openstaand',
    'ANNOUNCED': 'onderweg-ffm',
    'ARRIVED_AT_WH': 'binnengekomen-ffm',
    'PENDING': 'openstaand',
    'PROCESSING': 'openstaand',
    'PROCESSED': 'verzonden',
    'FINISHED': 'verzonden',
    'SEND': 'verzonden',
    'SENT': 'verzonden',
    'DISPATCHED': 'verzonden',
    'SHIPPED': 'verzonden',
    'FULFILLED': 'verzonden',
    'FULFILMENT_COMPLETED': 'verzonden',
    'FULFILLMENT_COMPLETED': 'verzonden',
    'COMPLETED': 'verzonden',
    'VERZONDEN': 'verzonden',
    'VERSTUURD': 'verzonden',
    'DELIVERED': 'afgeleverd',
    'AFGELEVERD': 'afgeleverd',
    'CANCELLED': 'geannuleerd',
    'CANCELED': 'geannuleerd',
    'GEANNULEERD': 'geannuleerd',
  };

  return statusMap[normalizedStatus] || 'openstaand';
}

function resolveBolStatusToInternal({ statuses = [], hasTrackAndTrace = false } = {}) {
  if (hasTrackAndTrace) {
    return 'verzonden';
  }

  let fallbackOpenStatus = 'openstaand';

  for (const status of statuses) {
    const mappedStatus = mapBolStatusToInternal(status);

    if (mappedStatus === 'geannuleerd') return 'geannuleerd';
    if (mappedStatus === 'afgeleverd') return 'afgeleverd';
    if (mappedStatus === 'verzonden' || mappedStatus === 'verstuurd') return 'verzonden';

    if (mappedStatus === 'openstaand' || mappedStatus === 'onderweg-ffm' || mappedStatus === 'binnengekomen-ffm') {
      fallbackOpenStatus = mappedStatus;
    }
  }

  return fallbackOpenStatus;
}

function resolvePrimaryBolStatus(statuses = []) {
  const normalizedCandidates = (statuses || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (normalizedCandidates.length === 0) {
    return null;
  }

  const priorityGroups = [
    new Set(['CANCELLED', 'CANCELED', 'GEANNULEERD']),
    new Set(['DELIVERED', 'AFGELEVERD']),
    new Set(['SHIPPED', 'SENT', 'SEND', 'DISPATCHED', 'FULFILLED', 'FULFILMENT_COMPLETED', 'FULFILLMENT_COMPLETED', 'COMPLETED', 'FINISHED', 'PROCESSED', 'VERSTUURD', 'VERZONDEN']),
    new Set(['ARRIVED_AT_WH', 'ANNOUNCED', 'PROCESSING', 'PENDING', 'NEW', 'OPEN', 'OPENSTAAND', 'ONDERWEG_FFM', 'BINNENGEKOMEN_FFM']),
  ];

  const uppercaseCandidates = normalizedCandidates.map((value) =>
    value.toUpperCase().replace(/[\s-]+/g, '_')
  );

  for (const group of priorityGroups) {
    for (let index = 0; index < uppercaseCandidates.length; index += 1) {
      if (group.has(uppercaseCandidates[index])) {
        return normalizedCandidates[index];
      }
    }
  }

  return normalizedCandidates[0];
}