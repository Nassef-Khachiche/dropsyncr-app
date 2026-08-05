import express from 'express';
import {
  getRevenueTargets,
  saveRevenueTargets,
} from '../controllers/revenueTargetController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getRevenueTargets);
router.post('/', saveRevenueTargets);

export default router;