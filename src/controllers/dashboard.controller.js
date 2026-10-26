import mongoose from 'mongoose';
import { Order, Customer, Product } from '../models/index.js';
import { sendSuccess, sendError } from '../utils/apiResponse.js';

/**
 * @desc   Get KPI metrics and status distribution via MongoDB aggregation pipelines
 * @route  GET /api/dashboard/stats
 * @access Private (Admin, Analyst, Viewer)
 */
export const getDashboardStats = async (req, res, next) => {
  try {
    const workspaceId = new mongoose.Types.ObjectId(req.workspaceId);
    const { period = 'all' } = req.query;

    const matchStage = {
      workspaceId,
    };

    // Optional period filtering (30d, 90d, or all-time)
    if (period === '30d') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchStage.createdAt = { $gte: thirtyDaysAgo };
    } else if (period === '90d') {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      matchStage.createdAt = { $gte: ninetyDaysAgo };
    }

    // Comprehensive MongoDB $facet aggregation pipeline
    const [statsResult, activeCustomersCount, activeProductsCount] = await Promise.all([
      Order.aggregate([
        { $match: matchStage },
        {
          $facet: {
            // 1. Paid Revenue & Paid Order Count
            paidMetrics: [
              { $match: { status: 'paid' } },
              {
                $group: {
                  _id: null,
                  totalRevenuePaise: { $sum: '$totalAmountPaise' },
                  paidOrdersCount: { $sum: 1 },
                },
              },
            ],
            // 2. Status distribution counts
            statusDistribution: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                  totalPaise: { $sum: '$totalAmountPaise' },
                },
              },
            ],
            // 3. Overall orders count
            totalOrders: [{ $count: 'count' }],
          },
        },
      ]),
      Customer.countDocuments({ workspaceId: req.workspaceId, isArchived: false }),
      Product.countDocuments({ workspaceId: req.workspaceId, isArchived: false }),
    ]);

    const facet = statsResult[0] || {
      paidMetrics: [],
      statusDistribution: [],
      totalOrders: [],
    };

    const paidData = facet.paidMetrics[0] || { totalRevenuePaise: 0, paidOrdersCount: 0 };
    const totalOrdersCount = facet.totalOrders[0]?.count || 0;
    const totalRevenuePaise = paidData.totalRevenuePaise || 0;
    const paidOrdersCount = paidData.paidOrdersCount || 0;

    // AOV in integer paise (guarded against division by zero)
    const averageOrderValuePaise =
      paidOrdersCount > 0 ? Math.round(totalRevenuePaise / paidOrdersCount) : 0;

    // Format status distribution with exact percentages
    const statusMap = {
      paid: { count: 0, percentage: 0, totalPaise: 0 },
      pending: { count: 0, percentage: 0, totalPaise: 0 },
      cancelled: { count: 0, percentage: 0, totalPaise: 0 },
    };

    facet.statusDistribution.forEach((item) => {
      if (statusMap[item._id]) {
        statusMap[item._id].count = item.count;
        statusMap[item._id].totalPaise = item.totalPaise;
        statusMap[item._id].percentage =
          totalOrdersCount > 0 ? Number(((item.count / totalOrdersCount) * 100).toFixed(1)) : 0;
      }
    });

    return sendSuccess(res, 'Dashboard metrics retrieved successfully', {
      period,
      revenue: {
        totalRevenuePaise,
        totalRevenueRupees: totalRevenuePaise / 100,
        formatted: `₹${(totalRevenuePaise / 100).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      },
      orders: {
        totalOrders: totalOrdersCount,
        paidOrders: paidOrdersCount,
        pendingOrders: statusMap.pending.count,
        cancelledOrders: statusMap.cancelled.count,
      },
      aov: {
        averageOrderValuePaise,
        averageOrderValueRupees: averageOrderValuePaise / 100,
        formatted: `₹${(averageOrderValuePaise / 100).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      },
      customers: {
        activeCustomersCount,
      },
      products: {
        activeProductsCount,
      },
      statusDistribution: statusMap,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Get chronological sales trend for chart visualization
 * @route  GET /api/dashboard/sales-trend
 * @access Private (Admin, Analyst, Viewer)
 */
export const getSalesTrend = async (req, res, next) => {
  try {
    const workspaceId = new mongoose.Types.ObjectId(req.workspaceId);
    const { range = '90d' } = req.query;

    const matchStage = {
      workspaceId,
      status: 'paid', // Only paid orders contribute to real revenue
    };

    if (range === '30d') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchStage.createdAt = { $gte: thirtyDaysAgo };
    } else if (range === '90d') {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      matchStage.createdAt = { $gte: ninetyDaysAgo };
    }

    // Determine grouping granularity (by day for <= 90d, by month for all)
    const dateFormat = range === 'all' ? '%Y-%m' : '%Y-%m-%d';

    const trend = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          revenuePaise: { $sum: '$totalAmountPaise' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formattedTrend = trend.map((point) => {
      const dateParts = point._id.split('-');
      let label = point._id;

      if (dateParts.length === 3) {
        // 'YYYY-MM-DD' -> 'MMM DD'
        const d = new Date(point._id);
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (dateParts.length === 2) {
        // 'YYYY-MM' -> 'MMM YYYY'
        const d = new Date(`${point._id}-01`);
        label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      return {
        date: point._id,
        label,
        revenue: point.revenuePaise / 100,
        revenuePaise: point.revenuePaise,
        orders: point.orderCount,
      };
    });

    return sendSuccess(res, 'Sales trend retrieved successfully', {
      range,
      trend: formattedTrend,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Get top selling products by revenue and volume
 * @route  GET /api/dashboard/top-products
 * @access Private (Admin, Analyst, Viewer)
 */
export const getTopProducts = async (req, res, next) => {
  try {
    const workspaceId = new mongoose.Types.ObjectId(req.workspaceId);
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit || '5', 10)));

    const topProducts = await Order.aggregate([
      { $match: { workspaceId, status: 'paid' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.productName' },
          sku: { $first: '$items.sku' },
          totalRevenuePaise: { $sum: '$items.subtotalPaise' },
          totalUnitsSold: { $sum: '$items.quantity' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalRevenuePaise: -1 } },
      { $limit: limit },
    ]);

    const formattedProducts = topProducts.map((p) => ({
      productId: p._id,
      name: p.name,
      sku: p.sku,
      unitsSold: p.totalUnitsSold,
      orderCount: p.orderCount,
      revenuePaise: p.totalRevenuePaise,
      revenueRupees: p.totalRevenuePaise / 100,
      formattedRevenue: `₹${(p.totalRevenuePaise / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    }));

    return sendSuccess(res, 'Top products retrieved successfully', {
      topProducts: formattedProducts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Get revenue and product distribution across categories
 * @route  GET /api/dashboard/category-breakdown
 * @access Private (Admin, Analyst, Viewer)
 */
export const getCategoryBreakdown = async (req, res, next) => {
  try {
    const workspaceId = new mongoose.Types.ObjectId(req.workspaceId);

    const categories = await Order.aggregate([
      { $match: { workspaceId, status: 'paid' } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'productDetails',
        },
      },
      {
        $unwind: {
          path: '$productDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$productDetails.category', 'General'] },
          revenuePaise: { $sum: '$items.subtotalPaise' },
          unitsSold: { $sum: '$items.quantity' },
        },
      },
      { $sort: { revenuePaise: -1 } },
    ]);

    const totalCategoryRevenuePaise = categories.reduce((sum, c) => sum + c.revenuePaise, 0);

    const formattedCategories = categories.map((cat) => ({
      category: cat._id,
      revenuePaise: cat.revenuePaise,
      revenueRupees: cat.revenuePaise / 100,
      unitsSold: cat.unitsSold,
      percentage:
        totalCategoryRevenuePaise > 0
          ? Number(((cat.revenuePaise / totalCategoryRevenuePaise) * 100).toFixed(1))
          : 0,
    }));

    return sendSuccess(res, 'Category breakdown retrieved successfully', {
      categories: formattedCategories,
      totalRevenuePaise: totalCategoryRevenuePaise,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Get recent orders and customer signups
 * @route  GET /api/dashboard/recent-activity
 * @access Private (Admin, Analyst, Viewer)
 */
export const getRecentActivity = async (req, res, next) => {
  try {
    const [recentOrders, recentCustomers] = await Promise.all([
      Order.find({ workspaceId: req.workspaceId })
        .populate('customerId', 'name email company')
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      Customer.find({ workspaceId: req.workspaceId, isArchived: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    return sendSuccess(res, 'Recent activity retrieved successfully', {
      recentOrders,
      recentCustomers,
    });
  } catch (error) {
    next(error);
  }
};
