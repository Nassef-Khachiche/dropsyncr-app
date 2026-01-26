import express from 'express';
import {
  syncBolOrders,
  getBolShippingLabel,
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
router.get('/shipping-label', getBolShippingLabel);

// Shipment updates
router.put('/shipment', updateBolShipment);

// Returns
router.get('/returns', getBolReturns);
router.put('/return/:returnId', handleBolReturn);

export default router;
