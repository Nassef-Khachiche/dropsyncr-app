import express from 'express';
import {
  syncKauflandOrders,
} from '../controllers/kauflandController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Order sync
router.get('/sync-orders', syncKauflandOrders);

export default router;