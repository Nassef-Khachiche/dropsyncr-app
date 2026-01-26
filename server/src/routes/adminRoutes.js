import express from 'express';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/adminController.js';
import { requireGlobalAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

router.use(requireGlobalAdmin);

router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

export default router;

