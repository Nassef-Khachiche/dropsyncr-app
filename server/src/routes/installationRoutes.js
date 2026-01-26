import express from 'express';
import {
  getInstallations,
  getInstallation,
  createInstallation,
  updateInstallation,
  deleteInstallation,
} from '../controllers/installationController.js';
import { requireGlobalAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

router.use(requireGlobalAdmin);

router.get('/', getInstallations);
router.get('/:id', getInstallation);
router.post('/', createInstallation);
router.put('/:id', updateInstallation);
router.delete('/:id', deleteInstallation);

export default router;

