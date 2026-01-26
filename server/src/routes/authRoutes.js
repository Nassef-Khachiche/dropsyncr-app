import express from 'express';
import { login, verify, getInstallations } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.get('/verify', authenticate, verify);
router.get('/installations', authenticate, getInstallations);

export default router;

