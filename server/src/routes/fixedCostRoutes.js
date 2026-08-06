import express from 'express';
import {
  getFixedCosts,
  createFixedCostGroup,
  updateFixedCostGroup,
  deleteFixedCostGroup,
  createFixedCostItem,
  updateFixedCostItem,
  deleteFixedCostItem,
} from '../controllers/fixedCostController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getFixedCosts);
router.post('/groups', createFixedCostGroup);
router.put('/groups/:id', updateFixedCostGroup);
router.delete('/groups/:id', deleteFixedCostGroup);
router.post('/items', createFixedCostItem);
router.put('/items/:id', updateFixedCostItem);
router.delete('/items/:id', deleteFixedCostItem);

export default router;