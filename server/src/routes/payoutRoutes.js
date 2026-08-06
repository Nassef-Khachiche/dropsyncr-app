import express from 'express';
import {
  getPayouts,
  createPayout,
  updatePayout,
  deletePayout,
} from '../controllers/payoutController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getPayouts);
router.post('/', createPayout);
router.put('/:id', updatePayout);
router.delete('/:id', deletePayout);

export default router;