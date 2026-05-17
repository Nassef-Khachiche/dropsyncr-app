import prisma from '../config/database.js';

let isReservationJobRunning = false;

/**
 * Bereken beschikbare voorraad voor een product
 */
async function getAvailableStock(productId, installationId) {
  const [inbound, picked, adjust, reserved] = await Promise.all([
    prisma.stockMutation.aggregate({
      where: { productId, installationId, type: 'inbound' },
      _sum: { quantity: true },
    }),
    prisma.stockMutation.aggregate({
      where: { productId, installationId, type: 'picked' },
      _sum: { quantity: true },
    }),
    prisma.stockMutation.aggregate({
      where: { productId, installationId, type: 'adjust' },
      _sum: { quantity: true },
    }),
    prisma.stockReservation.aggregate({
      where: { productId, installationId, pickedAt: null, cancelled: false },
      _sum: { quantity: true },
    }),
  ]);

  const totaal = (inbound._sum.quantity || 0) - (picked._sum.quantity || 0) + (adjust._sum.quantity || 0);
  return Math.max(0, totaal - (reserved._sum.quantity || 0));
}

/**
 * Zoek product op EAN — eerst primaire EAN, dan alias EAN
 */
async function findProductByEan(ean, installationId) {
  // 1. Zoek op primaire EAN
  const product = await prisma.product.findFirst({
    where: { installationId, ean, archived: false },
    select: { id: true, name: true },
  });

  if (product) return product;

  // 2. Zoek op alias EAN
  const alias = await prisma.productEanAlias.findFirst({
    where: { ean, installationId },
    select: { productId: true },
  });

  if (!alias) return null;

  return prisma.product.findFirst({
    where: { id: alias.productId, archived: false },
    select: { id: true, name: true },
  });
}

/**
 * Verwerk één order — bepaal fulfillmentType en maak reserveringen aan
 */
async function processOrder(order) {
  const installationId = order.installationId;
  let isFulfillment = false;

  for (const item of order.orderItems) {
    if (!item.ean) continue;

    const quantity = item.quantity || 1;

    // Zoek warehouse product op EAN + installatie (primair of alias)
    const product = await findProductByEan(item.ean, installationId);

    // Geen product gevonden → dropship voor dit item
    if (!product) continue;

    // Check beschikbare voorraad — EERST controleren voor isFulfillment te zetten
    const available = await getAvailableStock(product.id, installationId);

    if (available <= 0) {
      console.warn(`[STOCK RESERVATION] Geen voorraad voor product ${product.id} (EAN: ${item.ean}). Beschikbaar: ${available}`);
      continue;
    }

    if (available < quantity) {
      console.warn(`[STOCK RESERVATION] Onvoldoende voorraad voor product ${product.id} (EAN: ${item.ean}). Beschikbaar: ${available}, Gevraagd: ${quantity}`);
      continue;
    }

    // Check of er al een reservering bestaat voor deze order + product
    const existingReservation = await prisma.stockReservation.findFirst({
      where: { orderId: order.id, productId: product.id, cancelled: false },
    });

    if (existingReservation) {
      // Reservering bestaat al — wel als fulfillment markeren
      isFulfillment = true;
      continue;
    }

    // Maak reservering aan
    await prisma.stockReservation.create({
      data: {
        installationId,
        productId: product.id,
        orderId: order.id,
        quantity,
        reservedBy: 0, // 0 = systeem
        reservedAt: new Date(),
      },
    });

    // Log mutatie
    await prisma.stockMutation.create({
      data: {
        installationId,
        productId: product.id,
        type: 'reserved',
        quantity: 0,
        orderId: order.id,
        performedBy: 0,
        notes: `Automatisch gereserveerd voor order ${order.orderNumber}`,
        performedAt: new Date(),
      },
    });

    // Pas NU markeren als fulfillment — alleen als er voorraad was én reservering aangemaakt is
    isFulfillment = true;

    console.log(`[STOCK RESERVATION] ${quantity}x product ${product.id} (EAN: ${item.ean}) gereserveerd voor order ${order.orderNumber}`);
  }

  // Sla fulfillmentType op
  const fulfillmentType = isFulfillment ? 'fulfillment' : 'dropship';
  await prisma.order.update({
    where: { id: order.id },
    data: { fulfillmentType },
  });

  console.log(`[STOCK RESERVATION] Order ${order.orderNumber} → ${fulfillmentType}`);
}

/**
 * Hoofd sync cyclus
 */
async function runReservationCycle() {
  if (isReservationJobRunning) {
    console.log('[STOCK RESERVATION] Previous cycle still running; skipping');
    return;
  }

  isReservationJobRunning = true;

  try {
    // Haal alle openstaande orders op zonder fulfillmentType
    const orders = await prisma.order.findMany({
      where: {
        fulfillmentType: null,
        orderStatus: { not: 'verzonden' },
      },
      include: {
        orderItems: {
          select: { ean: true, quantity: true, productId: true },
        },
      },
      take: 100,
    });

    if (orders.length === 0) {
      return;
    }

    console.log(`[STOCK RESERVATION] Processing ${orders.length} order(s) without fulfillmentType`);

    for (const order of orders) {
      try {
        await processOrder(order);
      } catch (err) {
        console.error(`[STOCK RESERVATION] Fout bij order ${order.orderNumber}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[STOCK RESERVATION] Cycle failed:', error);
  } finally {
    isReservationJobRunning = false;
  }
}

export function startStockReservationJob() {
  const intervalMinutes = parseInt(process.env.STOCK_RESERVATION_INTERVAL_MINUTES || '2', 10);
  const safeInterval = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 2;
  const intervalMs = safeInterval * 60 * 1000;

  setInterval(() => {
    runReservationCycle();
  }, intervalMs);

  console.log(`[STOCK RESERVATION] Started — checking every ${safeInterval} minute(s)`);

  // Direct eerste run
  runReservationCycle();
}