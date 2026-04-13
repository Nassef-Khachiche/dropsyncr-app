import prisma from '../config/database.js';
import fetch from 'node-fetch';
import {
  resolveShippingAutomationForOrder,
  inferBolShippingMethodFromOrderData,
  inferIsMailboxFromOrderData,
} from '../utils/shippingAutomation.js';
import { Console } from 'console';

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
  
  // Get access token (in production, implement token caching)
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

  // Make the actual API request
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

  try {
    return await fetch(`https://api.bol.com/retailer${endpoint}`, {
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

const fetchBolDeliveryOptionHandoverWindow = async (credentials, orderItems = []) => {
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

  const selectedDeliveryOption = deliveryOptions.find((option) => option?.recommended)
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

async function resolveShippingLabelIdFromProcessStatus(credentials, processStatusId) {
  const normalizedId = String(processStatusId || '').trim();
  if (!normalizedId) return null;

  const endpoints = [
    `/process-status/${encodeURIComponent(normalizedId)}`,
    `/process-statuses/${encodeURIComponent(normalizedId)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const payload = await bolApiRequest(credentials, endpoint);
      const directEntityId = String(payload?.entityId || '').trim();
      if (directEntityId) return directEntityId;

      const linkedEntityId = extractFirstLinkId(payload, '/shipping-labels');
      if (linkedEntityId) return linkedEntityId;
    } catch {
      // Ignore and continue with next process-status endpoint variant
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
  const response = await bolApiRequestRaw(credentials, endpoint, {
    method: 'GET',
    accept: 'application/vnd.retailer.v10+json',
    contentType: 'application/vnd.retailer.v10+json',
  });

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
    } catch {
      errorMessage += ` - ${errorText}`;
    }
    throw new Error(errorMessage);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const trackingCode = response.headers.get('x-track-and-trace-code') || null;
  const transporterCode = response.headers.get('x-transporter-code') || null;

  if (contentType.includes('application/json')) {
    const jsonPayload = await response.json();
    return {
      ...jsonPayload,
      shippingLabelId: normalizedShippingLabelId,
      trackingCode: jsonPayload?.trackingCode || trackingCode,
      transporterCode: jsonPayload?.transporterCode || transporterCode,
    };
  }

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
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    throw new Error('Order ID is required to get Bol shipping label');
  }

  const errors = [];
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
          return {
            labelData: response,
            endpoint: labelEndpoint,
          };
        } catch (error) {
          errors.push({ endpoint: labelEndpoint, error });
        }
      }
    } catch (error) {
      errors.push({ endpoint, error });
    }
  }

  let orderItemsPayload = null;
  try {
    orderItemsPayload = await bolApiRequest(credentials, `/orders/${encodeURIComponent(normalizedOrderId)}/order-items`);
  } catch (error) {
    errors.push({ endpoint: `/orders/${normalizedOrderId}/order-items`, error });
  }

  if (!orderItemsPayload) {
    try {
      const matchingListedOrder = await findOrderInFbrOrderPages(credentials, normalizedOrderId, 8);

      if (matchingListedOrder) {
        orderItemsPayload = {
          orderItems: Array.isArray(matchingListedOrder.orderItems)
            ? matchingListedOrder.orderItems
            : [],
        };
      }
    } catch (error) {
      errors.push({ endpoint: '/orders?status=ALL&page=*', error });
    }
  }

  if (orderItemsPayload) {
    const orderItems = extractBolOrderItemsForLabel(orderItemsPayload);
    let handoverWindow = null;

    if (orderItems.length > 0) {
      try {
        handoverWindow = await fetchBolDeliveryOptionHandoverWindow(credentials, orderItems);
        const selectedDeliveryOption = handoverWindow.selectedDeliveryOption;

        const shippingLabelOfferId = String(selectedDeliveryOption?.shippingLabelOfferId || '').trim();
        if (shippingLabelOfferId) {
          const createLabelPayload = await bolApiRequest(
            credentials,
            '/shipping-labels',
            'POST',
            {
              orderItems,
              shippingLabelOfferId,
            },
          );

          let createdShippingLabelId = String(createLabelPayload?.entityId || '').trim();
          if (!createdShippingLabelId) {
            createdShippingLabelId = extractFirstLinkId(createLabelPayload, '/shipping-labels') || '';
          }

          if (!createdShippingLabelId && createLabelPayload?.processStatusId) {
            const processStatusResolvedId = await resolveShippingLabelIdFromProcessStatus(
              credentials,
              createLabelPayload.processStatusId,
            );
            if (processStatusResolvedId) {
              createdShippingLabelId = processStatusResolvedId;
            }
          }

          if (createdShippingLabelId) {
            const labelEndpoint = `/shipping-labels/${encodeURIComponent(createdShippingLabelId)}`;
            try {
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
            } catch (error) {
              errors.push({ endpoint: labelEndpoint, error });
            }
          }
        }
      } catch (error) {
        errors.push({ endpoint: '/shipping-labels/delivery-options|/shipping-labels', error });
      }
    }
  }

  let shipmentsPayload = null;
  try {
    shipmentsPayload = await bolApiRequest(credentials, `/shipments?order-id=${encodeURIComponent(normalizedOrderId)}`);
  } catch (error) {
    errors.push({ endpoint: `/shipments?order-id=${normalizedOrderId}`, error });
  }

  if (shipmentsPayload) {
    const shippingLabelIds = extractShippingLabelIdsFromResponse(shipmentsPayload);
    for (const shippingLabelId of shippingLabelIds) {
      const endpoint = `/shipping-labels/${encodeURIComponent(shippingLabelId)}`;
      try {
        const response = await fetchBolShippingLabelById(credentials, shippingLabelId);
        return {
          labelData: response,
          endpoint,
        };
      } catch (error) {
        errors.push({ endpoint, error });
      }
    }

    const shipmentIds = extractShipmentIdsFromResponse(shipmentsPayload);
    for (const shipmentId of shipmentIds) {
      const shipmentEndpoints = [
        `/shipments/${encodeURIComponent(shipmentId)}/label`,
        `/shipments/${encodeURIComponent(shipmentId)}/shipment-label`,
      ];

      for (const endpoint of shipmentEndpoints) {
        try {
          const response = await bolApiRequest(credentials, endpoint);
          return {
            labelData: {
              ...response,
              shipmentId,
            },
            endpoint,
          };
        } catch (error) {
          errors.push({ endpoint, error });
        }
      }
    }
  }

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
        // Some Bol environments reject certain status filters; continue with remaining statuses.
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
          dedupedOrders.set(orderId, {
            ...existingOrder,
            ...order,
          });
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

const resolvePersistedOrderStatus = (existingOrder) => {
  const normalizedOrderStatus = normalizeStatusToken(existingOrder?.orderStatus);
  const normalizedStatus = normalizeStatusToken(existingOrder?.status);

  if (DELIVERED_STATUS_TOKENS.has(normalizedOrderStatus) || DELIVERED_STATUS_TOKENS.has(normalizedStatus)) {
    return 'afgeleverd';
  }

  if (
    SHIPPED_STATUS_TOKENS.has(normalizedOrderStatus) ||
    SHIPPED_STATUS_TOKENS.has(normalizedStatus) ||
    Boolean(String(existingOrder?.supplierTracking || '').trim()) ||
    Boolean(String(existingOrder?.tracking?.trackingCode || '').trim()) ||
    String(existingOrder?.label?.status || '').trim().toLowerCase() === 'generated'
  ) {
    return 'verzonden';
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
    const debugOrderId = 'C00028PR4D';
    let debugOrderSeen = false;

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
    
    // Fetch all order pages from Bol.com
    const bolOrders = await fetchAllBolOrders(credentials);

    console.log('[BOL SYNC] Fetched orders from Bol.com:', {
      totalOrders: bolOrders.length,
    });
    
    let importedCount = 0;
    let updatedCount = 0;
    const enrichmentCache = new Map();

    for (const bolOrder of bolOrders) {
      const currentBolOrderId = String(bolOrder?.orderId || bolOrder?.orderNumber || '').trim();
      const isDebugOrder = currentBolOrderId.toUpperCase() === debugOrderId;
      if (isDebugOrder) {
        debugOrderSeen = true;
        console.log('[BOL SYNC][DEBUG ORDER] Matched target order in list', {
          orderId: currentBolOrderId,
          listedStatus: bolOrder?.status || null,
          installationId: parseInt(installationId, 10),
          integrationId: integrationId ? parseInt(integrationId, 10) : null,
        });
      }

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
      const resolvedInternalStatus = resolveBolStatusToInternal({
        statuses: bolStatusCandidates,
        hasTrackAndTrace: Boolean(resolvedTrackAndTrace) || shipmentConfirmedByBol,
      });
      if (isDebugOrder) {
        console.log('[BOL SYNC][DEBUG ORDER] Status resolution', {
          orderId: currentBolOrderId,
          bolStatusCandidates,
          resolvedBolOrderStatus,
          resolvedShippingStatus,
          resolvedInternalStatus,
          shipmentConfirmedByBol,
          resolvedTrackAndTrace,
          firstShipmentStatus: firstShipment?.status || null,
          firstShipmentShipmentStatus: firstShipment?.shipmentStatus || null,
          firstShipmentTransportStatus: firstShipment?.transport?.status || null,
        });
      }
      console.log('[BOL SYNC] Bol status sources:', {
        orderId: bolOrder.orderId,
        bolOrderStatus: bolOrder?.status || null,
        orderDetailsStatus: orderPayload?.status || null,
        shipmentStatus: firstShipment?.status || null,
        shipmentShipmentStatus: firstShipment?.shipmentStatus || null,
        shipmentTransportStatus: firstShipment?.transport?.status || null,
        shipmentConfirmedByBol,
      });
      console.log('[BOL SYNC] Order status candidates from bol.com:', {
        orderId: bolOrder.orderId,
        rawStatuses: bolStatusCandidates,
        resolvedBolOrderStatus,
        resolvedShippingStatus,
        resolvedInternalStatus,
      });

      console.log('[BOL SYNC] ALL ORDER DATA:', {
        order1: orderPayload,
      });

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

      const resolvedDistributionParty = distributionPartyCandidates[0] || null;
      const isVvbOrder = distributionPartyCandidates.some(
        (value) => value.toUpperCase() === 'BOL'
      );
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
          orderStatus: true,
          status: true,
          supplierTracking: true,
          tracking: {
            select: {
              trackingCode: true,
            },
          },
          label: {
            select: {
              status: true,
            },
          },
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
      const resolvedOrderShippingMethod = isVvbOrder
        ? 'Bol.com'
        : (shippingAutomationResult.shippingAssignment || null);
      const persistedStatus = resolvePersistedOrderStatus(existingOrder);
      const finalInternalStatus = persistedStatus || resolvedInternalStatus;
      const finalOrderStatus = resolvedBolOrderStatus || finalInternalStatus;
      const finalOrderStatusCode = toOrderStatusCode(finalInternalStatus || finalOrderStatus);
      if (isDebugOrder) {
        console.log('[BOL SYNC][DEBUG ORDER] Final mapped status before save', {
          orderId: currentBolOrderId,
          persistedStatus,
          finalInternalStatus,
          finalOrderStatus,
          finalOrderStatusCode,
          existingOrderStatus: existingOrder?.orderStatus || null,
          existingStatus: existingOrder?.status || null,
        });
      }

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
        orderStatus: finalOrderStatus,
        orderStatusCode: finalOrderStatusCode,
        shippingStatus: resolvedShippingStatus || null,
        isVVB: isVvbOrder,
        orderValue: parseFloat(orderItems?.reduce((sum, item) => {
          const unitPrice = parseFloat(item.unitPrice ?? item.totalPrice ?? item.offerPrice ?? 0) || 0;
          return sum + (unitPrice * (item.quantity || 1));
        }, 0) || 0),
        itemCount: orderItems?.length || 1,
        ...(resolvedTrackAndTrace ? { supplierTracking: resolvedTrackAndTrace } : {}),
        status: finalInternalStatus,
      };

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
            const earliestDropOffDate = toValidDate(handoverWindow.earliestHandoverDateTime);
            const latestDropOffDate = toValidDate(handoverWindow.latestHandoverDateTime);

            orderData.earliestDropOffDate = earliestDropOffDate;
            orderData.latestDropOffDate = latestDropOffDate;
          }
        } catch (handoverError) {
          console.warn('[BOL SYNC] Failed to resolve handover window from delivery options', {
            orderId: bolOrder.orderId,
            message: handoverError?.message || String(handoverError),
          });
        }
      }

      console.log('[BOL SYNC] Mapped order data:', {
        customerName: orderData.customerName,
        orderValue: orderData.orderValue,
        distributionPartyCandidates,
        distributionParty: resolvedDistributionParty || null,
        isVVB: isVvbOrder,
        shippingMethod: resolvedOrderShippingMethod,
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
            isVvbOrder,
            message: shippingMethodError.message,
          });
        }
      }

      if (existingOrder) {
        updatedCount++;
      } else {
        importedCount++;
      }

      if (isDebugOrder) {
        console.log('[BOL SYNC][DEBUG ORDER] Save complete', {
          orderId: currentBolOrderId,
          savedOrderId: savedOrder?.id || null,
          importedCount,
          updatedCount,
        });
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
                name: normalizedProductName,
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

    if (!debugOrderSeen) {
      console.warn('[BOL SYNC][DEBUG ORDER] Target order not found in fetched Bol orders', {
        targetOrderId: debugOrderId,
        totalFetchedOrders: bolOrders.length,
      });
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

    const normalizedOrderId = String(orderId).trim();
    const installationIdNumber = parseInt(installationId, 10);

    const matchingOrders = await prisma.order.findMany({
      where: {
        orderNumber: normalizedOrderId,
      },
      select: {
        id: true,
        installationId: true,
      },
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

    let labelData = null;
    let successfulIntegrationId = null;
    let lastError = null;
    const attemptedIntegrationIds = [];

    for (const candidate of integrationCandidates) {
      try {
        attemptedIntegrationIds.push(candidate.integration.id);
        const fallbackResult = await getBolLabelWithFallback(candidate.credentials, orderId);
        labelData = fallbackResult.labelData;
        successfulIntegrationId = candidate.integration.id;
        break;
      } catch (candidateError) {
        lastError = candidateError;
        const isUnauthorizedError = isUnauthorizedBolError(candidateError);

        if (!isUnauthorizedError) {
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

    await prisma.order.updateMany({
      where: {
        orderNumber: normalizedOrderId,
        ...(orderScopedInstallations.length > 0
          ? { installationId: { in: orderScopedInstallations } }
          : (Number.isFinite(installationIdNumber) ? { installationId: installationIdNumber } : {})),
      },
      data: {
        orderStatus: 'verzonden',
        status: 'verzonden',
        orderStatusCode: 'SHIPPED',
        earliestDropOffDate,
        latestDropOffDate,
      },
    });

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
      details: errorDetails 
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

  const resolvedStatus = statusMap[normalizedStatus] || 'openstaand';
  console.log('[BOL SYNC] Mapping status:', bolStatus, 'normalized:', normalizedStatus, '->', resolvedStatus);
  return resolvedStatus;
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
