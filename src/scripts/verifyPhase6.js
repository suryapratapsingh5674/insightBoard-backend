/**
 * Automated Verification Script for Phase 6: Analytics & Dashboard Aggregations
 * Tests MongoDB aggregation pipelines ($facet, $group, $unwind, $lookup),
 * mathematical accuracy of Total Revenue, AOV, status distribution, and RBAC read access.
 */

const BASE_URL = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('📊 Running Phase 6 Analytics & Dashboard Aggregation Tests...\n');

  try {
    // 1. Authenticate as Admin and Viewer
    const login = async (email) => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      });
      const data = await res.json();
      return data.data.accessToken;
    };

    const adminToken = await login('admin@insightboard.io');
    const viewerToken = await login('viewer@insightboard.io');

    console.log('🔑 Authenticated Admin and Viewer tokens acquired.');

    // 2. Unauthenticated request to /dashboard/stats is rejected (401)
    const unauthRes = await fetch(`${BASE_URL}/dashboard/stats`);
    if (unauthRes.status !== 401) {
      throw new Error(`Security failed: Unauthenticated request should be 401, got ${unauthRes.status}`);
    }
    console.log('✅ [1/9] Security verified: Unauthenticated request rejected (401 Unauthorized)');

    // 3. GET /api/dashboard/stats (All-time metrics)
    const statsRes = await fetch(`${BASE_URL}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statsData = await statsRes.json();
    if (statsRes.status !== 200 || !statsData.data) {
      throw new Error(`Dashboard stats failed: ${JSON.stringify(statsData)}`);
    }

    const { revenue, orders, aov, customers, products, statusDistribution } = statsData.data;

    if (
      typeof revenue.totalRevenuePaise !== 'number' ||
      typeof orders.totalOrders !== 'number' ||
      typeof aov.averageOrderValuePaise !== 'number' ||
      typeof customers.activeCustomersCount !== 'number'
    ) {
      throw new Error(`Malformed stats structure: ${JSON.stringify(statsData.data)}`);
    }
    console.log(
      `✅ [2/9] GET /dashboard/stats verified (Revenue: ${revenue.formatted}, Paid Orders: ${orders.paidOrders}, Active Customers: ${customers.activeCustomersCount})`
    );

    // 4. Mathematical integrity checks: AOV and status counts
    const expectedAOV =
      orders.paidOrders > 0
        ? Math.round(revenue.totalRevenuePaise / orders.paidOrders)
        : 0;

    if (aov.averageOrderValuePaise !== expectedAOV) {
      throw new Error(
        `AOV mismatch: Expected ${expectedAOV} paise, got ${aov.averageOrderValuePaise} paise`
      );
    }

    const sumStatusOrders =
      orders.paidOrders + orders.pendingOrders + orders.cancelledOrders;
    if (sumStatusOrders !== orders.totalOrders) {
      throw new Error(
        `Status sum mismatch: Total is ${orders.totalOrders}, sum of statuses is ${sumStatusOrders}`
      );
    }
    console.log(
      `✅ [3/9] Mathematical integrity verified: Exact integer AOV (${aov.formatted}) and status counts match total orders`
    );

    // 5. GET /api/dashboard/stats?period=30d
    const stats30dRes = await fetch(`${BASE_URL}/dashboard/stats?period=30d`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const stats30dData = await stats30dRes.json();
    if (stats30dRes.status !== 200 || stats30dData.data.period !== '30d') {
      throw new Error(`Period filter failed: ${JSON.stringify(stats30dData)}`);
    }
    console.log(
      `✅ [4/9] Period filter verified: 30-day stats window returned (${stats30dData.data.orders.totalOrders} orders in 30d)`
    );

    // 6. GET /api/dashboard/sales-trend
    const trendRes = await fetch(`${BASE_URL}/dashboard/sales-trend?range=90d`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const trendData = await trendRes.json();
    if (trendRes.status !== 200 || !Array.isArray(trendData.data.trend)) {
      throw new Error(`Sales trend failed: ${JSON.stringify(trendData)}`);
    }

    if (trendData.data.trend.length > 0) {
      const firstPoint = trendData.data.trend[0];
      if (
        typeof firstPoint.revenue !== 'number' ||
        typeof firstPoint.orders !== 'number' ||
        !firstPoint.label
      ) {
        throw new Error(`Malformed trend point: ${JSON.stringify(firstPoint)}`);
      }
    }
    console.log(
      `✅ [5/9] GET /dashboard/sales-trend verified (Aggregated ${trendData.data.trend.length} chronological data points)`
    );

    // 7. GET /api/dashboard/top-products
    const topProdRes = await fetch(`${BASE_URL}/dashboard/top-products?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const topProdData = await topProdRes.json();
    if (topProdRes.status !== 200 || !Array.isArray(topProdData.data.topProducts)) {
      throw new Error(`Top products failed: ${JSON.stringify(topProdData)}`);
    }

    const topList = topProdData.data.topProducts;
    if (topList.length > 1) {
      // Verify descending sort order
      for (let i = 0; i < topList.length - 1; i++) {
        if (topList[i].revenuePaise < topList[i + 1].revenuePaise) {
          throw new Error('Top products not sorted descending by revenuePaise');
        }
      }
    }
    console.log(
      `✅ [6/9] GET /dashboard/top-products verified (#1 Product: ${topList[0]?.name || 'N/A'}, Revenue: ${topList[0]?.formattedRevenue || '0'})`
    );

    // 8. GET /api/dashboard/category-breakdown
    const catRes = await fetch(`${BASE_URL}/dashboard/category-breakdown`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const catData = await catRes.json();
    if (catRes.status !== 200 || !Array.isArray(catData.data.categories)) {
      throw new Error(`Category breakdown failed: ${JSON.stringify(catData)}`);
    }
    console.log(
      `✅ [7/9] GET /dashboard/category-breakdown verified (${catData.data.categories.length} product categories calculated)`
    );

    // 9. GET /api/dashboard/recent-activity
    const activityRes = await fetch(`${BASE_URL}/dashboard/recent-activity`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const activityData = await activityRes.json();
    if (
      activityRes.status !== 200 ||
      !Array.isArray(activityData.data.recentOrders) ||
      !Array.isArray(activityData.data.recentCustomers)
    ) {
      throw new Error(`Recent activity failed: ${JSON.stringify(activityData)}`);
    }
    console.log(
      `✅ [8/9] GET /dashboard/recent-activity verified (${activityData.data.recentOrders.length} recent orders, ${activityData.data.recentCustomers.length} recent signups)`
    );

    // 10. Viewer role has full read access to analytics
    const viewerStatsRes = await fetch(`${BASE_URL}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    if (viewerStatsRes.status !== 200) {
      throw new Error(`RBAC failed: Viewer should have read access, got ${viewerStatsRes.status}`);
    }
    console.log('✅ [9/9] RBAC verified: Viewer role granted full read access to dashboard analytics');

    console.log('\n🎉 ALL 9 PHASE 6 BACKEND ANALYTICS TESTS PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('❌ Verification test failed:', error.message);
    process.exit(1);
  }
};

runTests();
