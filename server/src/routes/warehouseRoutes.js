import express from 'express';
import { getWarehouseAddress, upsertWarehouseAddress } from '../controllers/warehouseController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getWarehouseAddress);
router.post('/', upsertWarehouseAddress);

export default router;