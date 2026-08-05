import express from 'express';
import {
  getShippingRates,
  saveShippingRates,
} from '../controllers/shippingRateController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getShippingRates);
router.post('/', saveShippingRates);

export default router;