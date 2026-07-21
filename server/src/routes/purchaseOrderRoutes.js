import express from 'express';
import {
  getPurchaseOrders,
  processPurchaseOrder,
  markNotOrdered,
  updatePurchaseOrderTracking,
  resetPurchaseOrder,
} from '../controllers/purchaseOrderController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getPurchaseOrders);
router.post('/process', processPurchaseOrder);
router.post('/not-ordered', markNotOrdered);
router.put('/:id/tracking', updatePurchaseOrderTracking);
router.delete('/:id', resetPurchaseOrder);

export default router;