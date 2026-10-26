import { Router } from 'express';
import {
  getDashboardStats,
  getSalesTrend,
  getTopProducts,
  getCategoryBreakdown,
  getRecentActivity,
} from '../controllers/dashboard.controller.js';
import { verifyAuth } from '../middleware/auth.middleware.js';

const router = Router();

// All dashboard endpoints require authenticated workspace session
router.use(verifyAuth);

// All roles (Admin, Analyst, Viewer) can view analytics
router.get('/stats', getDashboardStats);
router.get('/sales-trend', getSalesTrend);
router.get('/top-products', getTopProducts);
router.get('/category-breakdown', getCategoryBreakdown);
router.get('/recent-activity', getRecentActivity);

export default router;
