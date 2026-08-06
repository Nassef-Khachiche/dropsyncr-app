import express from 'express';
import {
  getAdSpendMonth,
  saveAdSpendMonth,
} from '../controllers/adSpendController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/month', getAdSpendMonth);
router.post('/month', saveAdSpendMonth);

export default router;