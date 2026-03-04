import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
import automationRuleRoutes from './src/routes/automationRuleRoutes.js';
import { startBolSyncCronJob } from './src/jobs/bolSyncJob.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://0.0.0.0:3000',
];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use('/labels', express.static(path.join(__dirname, 'storage', 'labels')));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const prisma = (await import('./src/config/database.js')).default;
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'Server is running', database: 'connected' });
  } catch (error) {
    console.error('Database connection test failed:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Server is running but database connection failed',
      error: error.message 
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
app.use('/api/automation-rules', automationRuleRoutes);

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
  console.log(`Default user: admin@dropsyncr.com / admin123`);
  startBolSyncCronJob();
});

