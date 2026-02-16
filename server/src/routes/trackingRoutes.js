import express from 'express';
import {
  getTrackings,
  createTracking,
  bulkCreateTracking,
  refreshWeGrowTracking,
} from '../controllers/trackingController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getTrackings);
router.post('/', createTracking);
router.post('/bulk', bulkCreateTracking);
router.post('/wegrow/refresh', refreshWeGrowTracking);

export default router;

