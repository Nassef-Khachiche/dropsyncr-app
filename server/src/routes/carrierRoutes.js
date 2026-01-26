import express from 'express';
import {
  getCarriers,
  createCarrier,
  updateCarrier,
  deleteCarrier,
  testCarrierConnection,
  generateCarrierLabels,
} from '../controllers/carrierController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getCarriers);
router.post('/', createCarrier);
router.post('/:id/test', testCarrierConnection);
router.post('/:id/labels', generateCarrierLabels);
router.put('/:id', updateCarrier);
router.delete('/:id', deleteCarrier);

export default router;

