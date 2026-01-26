import prisma from '../config/database.js';
import fetch from 'node-fetch';

/**
 * Bol.com API Integration Controller
 * Handles orders, tracking, labels, and returns from Bol.com
 */

// Helper function to get Bol credentials for an installation
async function getBolCredentials(installationId) {
  const integration = await prisma.integration.findFirst({
    where: {
      installationId: parseInt(installationId),
      platform: 'bol.com',
      active: true,
    },
  });

  if (!integration) {
    throw new Error('Bol.com integration not found or not active');
  }

  const credentials = JSON.parse(integration.credentials);
  return credentials;
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
        errorMessage = 'Bol.com account is niet actief. Neem contact op met Bol.com partnerservice (partnerservice@bol.com) om je API toegang te activeren.';
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

/**
 * Sync orders from Bol.com
 */
export const syncBolOrders = async (req, res) => {
  try {
    const { installationId } = req.query;

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

    const credentials = await getBolCredentials(installationId);
    
    // Fetch orders from Bol.com
    const bolOrders = await bolApiRequest(credentials, '/orders?fulfilment-method=FBR&page=1');

    console.log('[BOL SYNC] Fetched orders from Bol.com:', bolOrders);
    
    let importedCount = 0;
    let updatedCount = 0;

    for (const bolOrder of bolOrders.orders || []) {
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
      const orderItems = orderPayload.orderItems || bolOrder.orderItems || [];
      const shipmentDetails = orderPayload.shipmentDetails || orderPayload.billingDetails || {};

      // Check if order already exists
      const existingOrder = await prisma.order.findUnique({
        where: { orderNumber: bolOrder.orderId },
      });

      const firstName = shipmentDetails?.firstName || '';
      const surname = shipmentDetails?.surname || '';
      const customerName = `${firstName} ${surname}`.trim() || 'Unknown';

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
        storeName: 'Bol.com',
        platform: 'bol.com',
        orderDate: new Date(orderPayload.orderPlacedDateTime),
        deliveryDate: orderPayload.deliveryPromise ? new Date(orderPayload.deliveryPromise) : null,
        orderStatus: orderItems?.[0]?.fulfilmentStatus || bolOrder.orderItems?.[0]?.fulfilmentStatus || 'NEW',
        shippingStatus: orderItems?.[0]?.fulfilmentStatus || bolOrder.orderItems?.[0]?.fulfilmentStatus || null,
        orderValue: parseFloat(orderItems?.reduce((sum, item) => {
          const unitPrice = parseFloat(item.unitPrice ?? item.totalPrice ?? item.offerPrice ?? 0) || 0;
          return sum + (unitPrice * (item.quantity || 1));
        }, 0) || 0),
        itemCount: orderItems?.length || 1,
        status: mapBolStatusToInternal(orderItems?.[0]?.fulfilmentStatus || bolOrder.orderItems?.[0]?.fulfilmentStatus),
      };

      console.log('[BOL SYNC] Mapped order data:', {
        customerName: orderData.customerName,
        orderValue: orderData.orderValue,
        status: orderData.status,
        orderStatus: orderData.orderStatus
      });

      if (existingOrder) {
        await prisma.order.update({
          where: { id: existingOrder.id },
          data: orderData,
        });
        updatedCount++;
      } else {
        await prisma.order.create({
          data: orderData,
        });
        importedCount++;
      }

      // Import order items
      if (orderItems.length > 0) {
        for (const item of orderItems) {
          const existingItem = await prisma.orderItem.findFirst({
            where: {
              orderId: existingOrder?.id || (await prisma.order.findUnique({ where: { orderNumber: bolOrder.orderId } }))?.id,
              ean: item.ean || item.product?.ean,
            },
          });

          const offerPrice = parseFloat(item.unitPrice ?? item.totalPrice ?? item.offerPrice ?? 0) || 0;
          
          const itemData = {
            orderId: existingOrder?.id || (await prisma.order.findUnique({ where: { orderNumber: bolOrder.orderId } }))?.id,
            productName: item.product?.title || 'Unknown Product',
            productImage: item.product?.images?.[0] || null,
            ean: item.ean || item.product?.ean,
            quantity: item.quantity || 1,
            price: offerPrice,
            unitPrice: offerPrice,
          };

          if (!existingItem) {
            await prisma.orderItem.create({ data: itemData });
          }
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
    const { installationId, orderId } = req.query;

    if (!installationId || !orderId) {
      return res.status(400).json({ error: 'Installation ID and Order ID are required' });
    }

    const credentials = await getBolCredentials(installationId);
    
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
    const { installationId } = req.query;
    const { orderId, shipmentReference, transporterCode, trackAndTrace } = req.body;

    if (!installationId || !orderId) {
      return res.status(400).json({ error: 'Installation ID and Order ID are required' });
    }

    const credentials = await getBolCredentials(installationId);
    
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
    const { installationId, page = 1 } = req.query;

    if (!installationId) {
      return res.status(400).json({ error: 'Installation ID is required' });
    }

    const credentials = await getBolCredentials(installationId);
    
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
    const { installationId } = req.query;
    const { returnId, quantityReturned, handlingResult } = req.body;

    if (!installationId || !returnId) {
      return res.status(400).json({ error: 'Installation ID and Return ID are required' });
    }

    const credentials = await getBolCredentials(installationId);
    
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
