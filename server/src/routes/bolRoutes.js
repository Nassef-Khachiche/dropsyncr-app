import express from 'express';
import {
  syncBolOrders,
  getBolShippingLabel,
  getBolDeliveryOptions,
  updateBolShipment,
  getBolReturns,
  handleBolReturn,
} from '../controllers/bolController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Order sync
router.get('/sync-orders', syncBolOrders);

// Shipping labels
router.post('/shipping-label', getBolShippingLabel);
router.get('/delivery-options', getBolDeliveryOptions);

// Shipment updates
router.put('/shipment', updateBolShipment);

// Returns
router.get('/returns', getBolReturns);
router.put('/return/:returnId', handleBolReturn);

export default router;
