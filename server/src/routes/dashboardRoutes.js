import express from 'express';
import { getDashboardStats, getFulfillmentAnalytics, getKlkAnalytics } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/stats', getDashboardStats);
router.get('/klk', getKlkAnalytics);
router.get('/fulfillment', getFulfillmentAnalytics);

export default router;

