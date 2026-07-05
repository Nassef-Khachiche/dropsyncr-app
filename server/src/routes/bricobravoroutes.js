import express from 'express';
import {
  syncBricoBravoOrders,
  reconcileBricoBravoOrderStatuses,
} from '../controllers/bricobravocontroller.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Order sync
router.get('/sync-orders', syncBricoBravoOrders);

// Order status reconciliation (verzonden/geannuleerd elders afgehandeld)
router.get('/reconcile-orders', reconcileBricoBravoOrderStatuses);

export default router;