import express from 'express';
import {
  getPurchaseOrders,
  processPurchaseOrder,
  markNotOrdered,
  markCanceled,
  saveProductSupplierUrl,
  updatePurchaseOrderTracking,
  resetPurchaseOrder,
  getProductPurchaseHistory,
} from '../controllers/purchaseOrderController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getPurchaseOrders);
router.get('/history', getProductPurchaseHistory);
router.post('/process', processPurchaseOrder);
router.post('/not-ordered', markNotOrdered);
router.post('/canceled', markCanceled);
router.post('/supplier-url', saveProductSupplierUrl);
router.put('/:id/tracking', updatePurchaseOrderTracking);
router.delete('/:id', resetPurchaseOrder);

export default router;