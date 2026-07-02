import express from 'express';
import {
  syncShopifyOrders,
  fulfillShopifyOrder,
  startShopifyOAuth,
  handleShopifyOAuthCallback,
  handleShopifyWebhook,
  getShopifyShopInfo,
} from '../controllers/shopifyController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------
router.get('/oauth/callback', handleShopifyOAuthCallback);

// Webhook routes (no authentication — HMAC verified in controller)
// Shopify sends a POST with JSON body + X-Shopify-Hmac-Sha256 header.
// Register these URLs in your Shopify Partner Dashboard or via the API:
//   https://your-domain/api/shopify/webhook/orders-create
//   https://your-domain/api/shopify/webhook/orders-updated
//   https://your-domain/api/shopify/webhook/orders-cancelled
router.post(
  '/webhook/:topic',
  express.json({
    verify: (req, _res, buf) => {
      // Store raw body for HMAC verification
      req.rawBody = buf;
    },
  }),
  handleShopifyWebhook
);

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------
router.use(authenticate);

// OAuth start URL (returns Shopify authorize URL)
router.post('/oauth/start', startShopifyOAuth);

// Order sync
router.get('/sync-orders', syncShopifyOrders);

// Fulfillment
router.post('/fulfill-order', fulfillShopifyOrder);

// Shop information (credential validation)
router.get('/shop-info', getShopifyShopInfo);

export default router;
