import express from 'express';
import {
  getTrackings,
  createTracking,
  bulkCreateTracking,
} from '../controllers/trackingController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getTrackings);
router.post('/', createTracking);
router.post('/bulk', bulkCreateTracking);

export default router;

