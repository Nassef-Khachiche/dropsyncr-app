import express from 'express';
import { getLocations, createLocation, bulkCreateLocations, updateLocation, deleteLocation } from '../controllers/warehouseLocationController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getLocations);
router.post('/', createLocation);
router.post('/bulk', bulkCreateLocations);
router.put('/:id', updateLocation);
router.delete('/:id', deleteLocation);

export default router;