import express from 'express';
import {
  syncKauflandOrders,
  reconcileKauflandOrderStatuses,
} from '../controllers/kauflandController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Order sync
router.get('/sync-orders', syncKauflandOrders);

// Order status reconciliation (verzonden/geannuleerd elders afgehandeld)
router.get('/reconcile-orders', reconcileKauflandOrderStatuses);

export default router;