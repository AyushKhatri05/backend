// backend/src/routes/analyticsRoutes.js
// COMPLETE – all Analytics page buttons and KPI widgets wired

const express = require('express');
const router  = express.Router();
const { authMiddleware }   = require('../middleware/authMiddleware');
const { rbacMiddleware }   = require('../middleware/rbacMiddleware');
const analyticsController  = require('../controllers/analyticsController');

router.use(authMiddleware);

// Dashboard KPIs  →  Dashboard page stat cards (fetched on load)
router.get('/dashboard/kpis',    rbacMiddleware('analytics', 'view'), analyticsController.getDashboardKPIs);
// Dashboard charts  →  Revenue / stock trend charts
router.get('/dashboard/charts',  rbacMiddleware('analytics', 'view'), analyticsController.getDashboardCharts);
// Demand forecast  →  "View Forecast" per-product button
router.get('/forecast/:productId', rbacMiddleware('analytics', 'view'), analyticsController.getDemandForecast);
// Reorder alerts list  →  Analytics page alerts table
router.get('/reorder-alerts',    rbacMiddleware('analytics', 'view'), analyticsController.getReorderAlerts);
// Acknowledge alert  →  "Acknowledge" button in alerts table
router.post('/reorder-alerts/:id/acknowledge', rbacMiddleware('analytics', 'view'), analyticsController.acknowledgeReorderAlert);
// Inventory velocity  →  Analytics velocity chart
router.get('/inventory/velocity', rbacMiddleware('analytics', 'view'), analyticsController.getInventoryVelocity);
// ABC analysis  →  Analytics ABC table
router.get('/inventory/abc-analysis', rbacMiddleware('analytics', 'view'), analyticsController.getABCAnalysis);
// Sales trends  →  Sales trend chart (period filter button)
router.get('/sales/trends',      rbacMiddleware('analytics', 'view'), analyticsController.getSalesTrends);

module.exports = router;
