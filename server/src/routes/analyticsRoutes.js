import express from 'express';
import {
  getAnalyticsFilters,
  getAnalyticsOverview,
} from '../controllers/analytics/overviewController.js';
import {
  getChannelProfitability,
  getProductAnalytics,
  getStoreTrends,
  getTargetsForecast,
} from '../controllers/analytics/salesController.js';
import {
  getDailySummary,
  getDailySummaryPeriods,
  getMonthlySummary,
  getVatOverview,
  getAdSpendAnalytics,
} from '../controllers/analytics/financeController.js';
import {
  getSignals,
  getCancelAnalysis,
  getReturnsAnalytics,
} from '../controllers/analytics/operationsController.js';
import { authenticate } from '../middleware/auth.js';
import {
  getExportCounts,
  downloadExport,
} from '../controllers/analytics/exportsController.js';

/**
 * Alle analytics-endpoints. Per sidebar-groep komt hier later een blok bij
 * (sales, finance, operations, exports) dat naar zijn eigen controller wijst.
 */
const router = express.Router();

router.use(authenticate);

router.get('/filters', getAnalyticsFilters);
router.get('/overview', getAnalyticsOverview);
router.get('/products', getProductAnalytics);
router.get('/store-trends', getStoreTrends);
router.get('/channel-profitability', getChannelProfitability);
router.get('/targets', getTargetsForecast);
router.get('/daily-summary/periods', getDailySummaryPeriods);
router.get('/daily-summary', getDailySummary);
router.get('/monthly-summary', getMonthlySummary);
router.get('/vat-overview', getVatOverview);
router.get('/ad-spend', getAdSpendAnalytics);
router.get('/signals', getSignals);
router.get('/cancel-analysis', getCancelAnalysis);
router.get('/returns', getReturnsAnalytics);
router.get('/exports/counts', getExportCounts);
router.get('/exports/:type', downloadExport);

export default router;