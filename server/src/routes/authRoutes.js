import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, verify, getInstallations } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const loginRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

router.post('/login', loginRateLimiter, login);
router.get('/verify', authenticate, verify);
router.get('/installations', authenticate, getInstallations);

export default router;

