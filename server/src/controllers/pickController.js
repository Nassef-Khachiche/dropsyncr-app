import prisma from '../config/database.js';

export const pickOrders = async (req, res) => {
  try {
    const { orderIds, installationId } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds is required and must be a non-empty array' });
    }

    if (!installationId) {
      return res.status(400).json({ error: 'installationId is required' });
    }

    const parsedInstallationId = parseInt(installationId, 10);
    if (Number.isNaN(parsedInstallationId)) {
      return res.status(400).json({ error: 'Invalid installationId' });
    }

    const parsedOrderIds = orderIds
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (parsedOrderIds.length === 0) {
      return res.status(400).json({ error: 'No valid orderIds provided' });
    }

    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: { userId: req.user.id, installationId: parsedInstallationId },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const results = [];
    const errors = [];

    for (const orderId of parsedOrderIds) {
      try {
        const reservations = await prisma.stockReservation.findMany({
          where: { orderId, cancelled: false, pickedAt: null },
        });

        for (const reservation of reservations) {
          // Mutatie aanmaken — quantity POSITIEF want calculateStockForProducts doet: inbound - picked + adjust
          // Een positieve picked mutatie wordt afgetrokken van de voorraad
          await prisma.stockMutation.create({
            data: {
              installationId: parsedInstallationId,
              productId: reservation.productId,
              type: 'picked',
              quantity: reservation.quantity, // positief — wordt afgetrokken door calculateStockForProducts
              orderId,
              performedBy: req.user.id,
              notes: `Gepickt voor order ${orderId}`,
              performedAt: new Date(),
            },
          });

          // Verlaag StockBatch van de oudste batch (FIFO)
          const oldestBatch = await prisma.stockBatch.findFirst({
            where: { productId: reservation.productId },
            orderBy: { receivedAt: 'asc' },
          });
          if (oldestBatch) {
            await prisma.stockBatch.update({
              where: { id: oldestBatch.id },
              data: { quantity: { decrement: reservation.quantity } },
            });
          }

          // Markeer reservering als gepickt
          await prisma.stockReservation.update({
            where: { id: reservation.id },
            data: { pickedAt: new Date(), pickedBy: req.user.id },
          });
        }

        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'gepickt', orderStatus: 'gepickt', orderStatusCode: 'GEPICKT' },
        });

        results.push({ orderId, success: true, reservationsProcessed: reservations.length });
      } catch (orderError) {
        console.error(`[PICK] Error processing order ${orderId}:`, orderError);
        errors.push({ orderId, error: orderError.message });
      }
    }

    res.json({
      success: true,
      processed: results.length,
      errors: errors.length,
      results,
      ...(errors.length > 0 ? { errorDetails: errors } : {}),
    });
  } catch (error) {
    console.error('[PICK] Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const getPicklist = async (req, res) => {
  try {
    const { orderIds } = req.query;

    if (!orderIds) {
      return res.status(400).json({ error: 'orderIds is required' });
    }

    const parsedOrderIds = String(orderIds)
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (parsedOrderIds.length === 0) {
      return res.status(400).json({ error: 'No valid orderIds provided' });
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: parsedOrderIds } },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        storeName: true,
        orderItems: {
          select: {
            id: true,
            productName: true,
            ean: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });

    const reservations = await prisma.stockReservation.findMany({
      where: { orderId: { in: parsedOrderIds }, cancelled: false },
      select: { orderId: true, productId: true, quantity: true },
    });

    const productIdsFromReservations = reservations.map(r => r.productId);
    const productIdsFromItems = orders.flatMap(o => o.orderItems.map(i => i.productId)).filter(Boolean);
    const allProductIds = [...new Set([...productIdsFromReservations, ...productIdsFromItems])];

    const products = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      select: { id: true, name: true, ean: true },
    });

    // Oudste batch eerst (FIFO)
    const stockBatches = await prisma.stockBatch.findMany({
      where: { productId: { in: allProductIds } },
      select: { productId: true, locationId: true, quantity: true, receivedAt: true },
      orderBy: { receivedAt: 'asc' },
    });

    const locationIds = [...new Set(stockBatches.map(b => b.locationId).filter(Boolean))];
    const warehouseLocations = await prisma.warehouseLocation.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, code: true },
    });
    const locationCodeMap = new Map(warehouseLocations.map(l => [l.id, l.code]));

    // Toon alleen oudste batch met locatie (FIFO)
    const productMap = new Map(products.map(p => {
      const batches = stockBatches.filter(b => b.productId === p.id);
      const oldestBatchWithLocation = batches.find(b => b.locationId && locationCodeMap.has(b.locationId));
      const locations = oldestBatchWithLocation
        ? [{ location: locationCodeMap.get(oldestBatchWithLocation.locationId), quantity: oldestBatchWithLocation.quantity }]
        : [];
      return [p.id, { ...p, locations }];
    }));

    const enrichedOrders = orders.map(order => {
      const orderReservations = reservations.filter(r => r.orderId === order.id);

      const enrichedItems = order.orderItems.map(item => {
        let product = item.productId ? productMap.get(item.productId) || null : null;

        if (!product && item.ean) {
          const reservation = orderReservations.find(r => {
            const p = productMap.get(r.productId);
            return p?.ean === item.ean;
          });
          if (reservation) product = productMap.get(reservation.productId) || null;
        }

        if (!product && item.ean) {
          const found = products.find(p => p.ean === item.ean);
          if (found) product = productMap.get(found.id) || null;
        }

        return { ...item, product: product || null };
      });

      return { ...order, orderItems: enrichedItems };
    });

    res.json({ orders: enrichedOrders });
  } catch (error) {
    console.error('[PICKLIST] Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};