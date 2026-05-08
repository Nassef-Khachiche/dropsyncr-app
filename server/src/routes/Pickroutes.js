import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { pickOrders, getPicklist } from '../controllers/pickController.js';

const router = express.Router();

router.get('/picklist', authenticate, getPicklist);
router.post('/pick', authenticate, pickOrders);

export default router;