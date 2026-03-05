import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

const hasArg = (arg) => process.argv.includes(arg);
const getArgValue = (name, fallback) => {
  const match = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (!match) return fallback;
  const [, value] = match.split('=');
  return value ?? fallback;
};

const normalize = (value) => String(value || '').trim();

const firstNonEmptyString = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
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

  if (typeof input !== 'object') return null;

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

const getBolToken = async (credentials) => {
  const authString = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
  const tokenResponse = await fetch('https://login.bol.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${authString}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text().catch(() => 'Unknown error');
    throw new Error(`Bol token request failed (${tokenResponse.status}): ${errorText}`);
  }

  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload?.access_token) {
    throw new Error('Bol token response does not include access_token');
  }

  return tokenPayload.access_token;
};

const fetchBolShipmentDetails = async (accessToken, orderNumber) => {
  const response = await fetch(`https://api.bol.com/retailer/shipments?order-id=${encodeURIComponent(String(orderNumber))}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.retailer.v10+json',
      'Content-Type': 'application/vnd.retailer.v10+json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Bol shipments request failed (${response.status}): ${errorText}`);
  }

  return response.json();
};

const extractTrackAndTraceFromShipmentPayload = (shipmentPayload = {}) => {
  const shipmentList = Array.isArray(shipmentPayload?.shipments)
    ? shipmentPayload.shipments
    : [];
  const firstShipment = shipmentList[0] || null;

  const trackingCode = firstNonEmptyString(
    firstShipment?.transport?.trackAndTrace,
    firstShipment?.trackAndTrace,
    firstShipment?.trackingCode,
    firstShipment?.trackingNumber,
    firstShipment?.parcelLabelNumber,
    findStringValueByKey(firstShipment, /(track.?and.?trace|tracking.?code|tracking.?number|parcel.?label.?number)/i),
    findStringValueByKey(shipmentPayload, /(track.?and.?trace|tracking.?code|tracking.?number|parcel.?label.?number)/i),
  );

  const transporterCode = firstNonEmptyString(
    firstShipment?.transport?.transporterCode,
    firstShipment?.transporterCode,
    firstShipment?.transporter,
    findStringValueByKey(firstShipment, /(transporter.?code|carrier.?code|carrier)/i),
  );

  return { trackingCode, transporterCode };
};

async function backfillSupplierTracking() {
  const applyChanges = hasArg('--apply');
  const bolApiFallback = hasArg('--bol-api-fallback');
  const maxRows = Number.parseInt(getArgValue('--limit', '5000'), 10);
  const take = Number.isNaN(maxRows) || maxRows <= 0 ? 5000 : maxRows;

  try {
    console.log('\n=== Supplier Tracking Backfill (empty -> tracking.trackingCode) ===');
    console.log(`Mode: ${applyChanges ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Limit: ${take}`);
    console.log(`Bol API fallback: ${bolApiFallback ? 'enabled' : 'disabled'}`);

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { supplierTracking: null },
          { supplierTracking: '' },
        ],
        tracking: {
          is: {},
        },
      },
      select: {
        id: true,
        orderNumber: true,
        supplierTracking: true,
        tracking: {
          select: {
            trackingCode: true,
            supplier: true,
            source: true,
          },
        },
      },
      take,
      orderBy: { updatedAt: 'desc' },
    });

    const localCandidates = orders.filter((order) => {
      const existingSupplierTracking = normalize(order.supplierTracking);
      const trackingCode = normalize(order?.tracking?.trackingCode);
      return !existingSupplierTracking && Boolean(trackingCode);
    });

    const candidatesByOrderId = new Map(
      localCandidates.map((entry) => [entry.id, {
        orderId: entry.id,
        orderNumber: entry.orderNumber,
        trackingCode: normalize(entry?.tracking?.trackingCode),
        supplier: normalize(entry?.tracking?.supplier) || null,
        source: 'tracking_relation',
      }])
    );

    if (bolApiFallback) {
      const bolOrders = await prisma.order.findMany({
        where: {
          platform: 'bol.com',
          OR: [
            { supplierTracking: null },
            { supplierTracking: '' },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          installationId: true,
          tracking: {
            select: {
              id: true,
              trackingCode: true,
            },
          },
        },
        take,
        orderBy: { updatedAt: 'desc' },
      });

      const bolOrdersWithoutTracking = bolOrders.filter((order) => !order?.tracking?.trackingCode);
      const installationIds = Array.from(new Set(bolOrdersWithoutTracking.map((entry) => entry.installationId)));

      const integrations = await prisma.integration.findMany({
        where: {
          active: true,
          platform: 'bol.com',
          installationId: { in: installationIds },
        },
        select: {
          id: true,
          installationId: true,
          credentials: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      const integrationByInstallation = new Map();
      integrations.forEach((entry) => {
        if (!integrationByInstallation.has(entry.installationId)) {
          integrationByInstallation.set(entry.installationId, entry);
        }
      });

      const tokenCache = new Map();

      for (const order of bolOrdersWithoutTracking) {
        if (candidatesByOrderId.has(order.id)) continue;

        const integration = integrationByInstallation.get(order.installationId);
        if (!integration) continue;

        let credentials;
        try {
          credentials = JSON.parse(integration.credentials || '{}');
        } catch {
          continue;
        }

        const clientId = normalize(credentials.clientId);
        const clientSecret = normalize(credentials.clientSecret);
        if (!clientId || !clientSecret) continue;

        const tokenCacheKey = `${order.installationId}:${integration.id}`;

        let accessToken = tokenCache.get(tokenCacheKey);
        if (!accessToken) {
          try {
            accessToken = await getBolToken({ clientId, clientSecret });
            tokenCache.set(tokenCacheKey, accessToken);
          } catch {
            continue;
          }
        }

        try {
          const shipmentPayload = await fetchBolShipmentDetails(accessToken, order.orderNumber);
          const { trackingCode, transporterCode } = extractTrackAndTraceFromShipmentPayload(shipmentPayload);

          if (trackingCode) {
            candidatesByOrderId.set(order.id, {
              orderId: order.id,
              orderNumber: order.orderNumber,
              trackingCode: normalize(trackingCode),
              supplier: normalize(transporterCode) || 'bol.com',
              source: 'bol_api_shipment_history',
            });
          }
        } catch {
          // ignore per-order API failures; continue with remaining orders
        }
      }
    }

    const candidates = Array.from(candidatesByOrderId.values()).filter((entry) => Boolean(entry.trackingCode));

    console.log(`Orders scanned: ${orders.length}`);
    console.log(`Backfill candidates: ${candidates.length}`);

    if (candidates.length === 0) {
      console.log('No eligible records found.');
      return;
    }

    const preview = candidates.slice(0, 20);
    console.log('\nPreview (first 20):');
    preview.forEach((entry) => {
      console.log(
        `- #${entry.orderId} ${entry.orderNumber}: supplierTracking="" -> "${entry.trackingCode}" (source=${entry.source})`
      );
    });

    if (!applyChanges) {
      console.log('\nDry-run complete. Re-run with --apply to persist changes.');
      return;
    }

    const operations = candidates.flatMap((entry) => {
      const updates = [
        prisma.order.update({
          where: { id: entry.orderId },
          data: { supplierTracking: normalize(entry.trackingCode) || null },
          select: { id: true },
        }),
      ];

      updates.push(
        prisma.tracking.upsert({
          where: { orderId: entry.orderId },
          update: {
            trackingCode: normalize(entry.trackingCode),
            supplier: entry.supplier || 'unknown',
            source: entry.source,
            status: 'linked',
          },
          create: {
            orderId: entry.orderId,
            trackingCode: normalize(entry.trackingCode),
            supplier: entry.supplier || 'unknown',
            source: entry.source,
            status: 'linked',
          },
        })
      );

      return updates;
    });

    const result = await prisma.$transaction(operations);
    console.log(`\nApplied ${result.length} database operations for ${candidates.length} orders.`);
  } catch (error) {
    console.error('Backfill failed:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

backfillSupplierTracking();
