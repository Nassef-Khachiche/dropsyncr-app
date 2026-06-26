import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getJwtSecret } from './src/utils/security.js';

// Routes
import authRoutes from './src/routes/authRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js';
import trackingRoutes from './src/routes/trackingRoutes.js';
import carrierRoutes from './src/routes/carrierRoutes.js';
import ticketRoutes from './src/routes/ticketRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import installationRoutes from './src/routes/installationRoutes.js';
import integrationRoutes from './src/routes/integrationRoutes.js';
import bolRoutes from './src/routes/bolRoutes.js';
import kauflandRoutes from './src/routes/kauflandRoutes.js';
import automationRuleRoutes from './src/routes/automationRuleRoutes.js';
import returnRoutes from './src/routes/returnRoutes.js';
import warehouseRoutes from './src/routes/warehouseRoutes.js';
import warehouseLocationRoutes from './src/routes/warehouseLocationRoutes.js';
import warehouseProductRoutes from './src/routes/warehouseProductRoutes.js';
import stockRoutes from './src/routes/StockRoutes.js';

// Cron jobs
import { startBolSyncCronJob } from './src/jobs/bolSyncJob.js';
import { startKauflandSyncCronJob } from './src/jobs/kauflandSyncJob.js';
import { startStockReservationJob } from './src/jobs/stockReservationJob.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
// v2026-06-26h — propagate notEligibleReason; treat Geen delivery option as ineligible in path 4

getJwtSecret();
app.set('trust proxy', true);
app.disable('x-powered-by');

const normalizeOrigin = (value) => String(value || '').trim().replace(/\/$/, '');

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://0.0.0.0:3000',
  'https://dropsyncr.com',
  'https://www.dropsyncr.com',
  process.env.FRONTEND_URL,
]
  .map(normalizeOrigin)
  .filter(Boolean);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 800,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
}));

app.use(express.json({ limit: '1mb' }));
// Strip framing-restriction headers for label PDFs so the iframe preview
// works in dev mode (cross-origin: frontend :3000, backend :5000).
// In production the request goes through nginx on the same origin anyway,
// so this header removal is harmless there too.
app.use('/labels', (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  next();
}, express.static(path.join(__dirname, 'storage', 'labels'), {
  dotfiles: 'ignore',
  index: false,
  maxAge: '1d',
}));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const prisma = (await import('./src/config/database.js')).default;
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'Server is running', database: 'connected' });
  } catch (error) {
    console.error('Database connection test failed:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Server is running but database connection failed',
      ...(process.env.NODE_ENV !== 'production' ? { error: error.message } : {})
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/carriers', carrierRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/installations', installationRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/bol', bolRoutes);
app.use('/api/kaufland', kauflandRoutes);
app.use('/api/automation-rules', automationRuleRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/locations', warehouseLocationRoutes);
app.use('/api/warehouse-products', warehouseProductRoutes);
app.use('/api/stock', stockRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const statusCode = Number.isInteger(err?.statusCode)
    ? err.statusCode
    : Number.isInteger(err?.status)
      ? err.status
      : 500;

  const fallbackMessage = statusCode >= 500 ? 'Internal server error' : 'Request failed';
  const errorMessage = typeof err?.message === 'string' && err.message.trim()
    ? err.message.trim()
    : fallbackMessage;

  res.status(statusCode).json({
    error: errorMessage,
    ...(process.env.NODE_ENV !== 'production' ? { details: err?.stack || null } : {}),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  startBolSyncCronJob();
  startKauflandSyncCronJob();
  startStockReservationJob();
});