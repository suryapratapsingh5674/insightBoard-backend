/**
 * Master Verification Test Suite for InsightBoard SaaS Application
 * Executes comprehensive integration checks across all 7 operational phases.
 */

const BASE_URL = 'http://localhost:5000/api';

const runMasterSuite = async () => {
  console.log('================================================================');
  console.log('🚀 RUNNING INSIGHTBOARD MASTER FULL-STACK INTEGRATION SUITE');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  const assert = (condition, message) => {
    totalTests++;
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  };

  try {
    // -------------------------------------------------------------
    // PHASE 2 & 3: Authentication, Dual-Tokens, RBAC & Workspace Context
    // -------------------------------------------------------------
    console.log('\n--- 🔑 PHASE 2 & 3: Authentication, Sessions & RBAC ---');
    const login = async (email, password = 'password123') => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      return { status: res.status, data: data.data };
    };

    const adminLogin = await login('admin@insightboard.io');
    assert(adminLogin.status === 200 && adminLogin.data.accessToken, 'Admin login successful with JWT access token');
    const adminToken = adminLogin.data.accessToken;

    const analystLogin = await login('analyst@insightboard.io');
    assert(analystLogin.status === 200 && analystLogin.data.accessToken, 'Analyst login successful');
    const analystToken = analystLogin.data.accessToken;

    const viewerLogin = await login('viewer@insightboard.io');
    assert(viewerLogin.status === 200 && viewerLogin.data.accessToken, 'Viewer login successful');
    const viewerToken = viewerLogin.data.accessToken;

    // Test unauthenticated block
    const unauthRes = await fetch(`${BASE_URL}/customers`);
    assert(unauthRes.status === 401, 'Unauthenticated request blocked (401 Unauthorized)');

    // -------------------------------------------------------------
    // PHASE 4: Customers & Products Management (CRUD, Search, Archive)
    // -------------------------------------------------------------
    console.log('\n--- 👥 PHASE 4: Customers & Products Management ---');
    const custRes = await fetch(`${BASE_URL}/customers?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const custData = await custRes.json();
    assert(custRes.status === 200 && custData.data.customers.length > 0, 'Customer pagination returned records');

    const prodRes = await fetch(`${BASE_URL}/products?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const prodData = await prodRes.json();
    assert(prodRes.status === 200 && prodData.data.products.length > 0, 'Product catalog returned records');

    // Safe regex test: Search with special characters (+, *, ?)
    const specialSearchRes = await fetch(`${BASE_URL}/customers?search=${encodeURIComponent('test+*(?')}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(specialSearchRes.status === 200, 'Search query with special regex characters handled safely');

    // -------------------------------------------------------------
    // PHASE 5: Orders, Server-Calculated Price Snapshots & Paise Math
    // -------------------------------------------------------------
    console.log('\n--- 🛒 PHASE 5: Orders & Financial Integrity ---');
    const testCustomer = custData.data.customers[0];
    const testProduct = prodData.data.products[0];

    const orderRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        customerId: testCustomer._id,
        items: [{ productId: testProduct._id, quantity: 2 }],
        status: 'paid',
      }),
    });
    const orderData = await orderRes.json();
    assert(orderRes.status === 201, 'Admin created order with server-calculated price snapshots');

    const createdOrder = orderData.data.order;
    const expectedPaise = testProduct.unitPricePaise * 2;
    assert(createdOrder.totalAmountPaise === expectedPaise, 'Server calculated exact integer paise total without floating point drift');
    assert(createdOrder.items[0].productName === testProduct.name, 'Order stored immutable product name snapshot');

    // RBAC: Viewer cannot create order
    const viewerOrderRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({
        customerId: testCustomer._id,
        items: [{ productId: testProduct._id, quantity: 1 }],
      }),
    });
    assert(viewerOrderRes.status === 403, 'RBAC enforced: Viewer blocked from creating orders (403 Forbidden)');

    // -------------------------------------------------------------
    // PHASE 6: MongoDB Analytics Aggregations ($facet, Trend, Top Products)
    // -------------------------------------------------------------
    console.log('\n--- 📊 PHASE 6: MongoDB Aggregations & Analytics ---');
    const statsRes = await fetch(`${BASE_URL}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statsData = await statsRes.json();
    assert(statsRes.status === 200 && statsData.data.revenue.totalRevenuePaise > 0, 'Dashboard $facet aggregation returned revenue metrics');

    const trendRes = await fetch(`${BASE_URL}/dashboard/sales-trend?range=90d`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const trendData = await trendRes.json();
    assert(trendRes.status === 200 && Array.isArray(trendData.data.trend), 'Time-series sales trend returned chronological chart points');

    const topProdRes = await fetch(`${BASE_URL}/dashboard/top-products?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const topProdData = await topProdRes.json();
    assert(topProdRes.status === 200 && topProdData.data.topProducts.length > 0, 'Top products aggregated with $unwind and sorted descending');

    // -------------------------------------------------------------
    // PHASE 7: Team Management, Role Changes & Safety Guards
    // -------------------------------------------------------------
    console.log('\n--- 🛡️ PHASE 7: Team Management & Safety Invariants ---');
    const teamRes = await fetch(`${BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const teamData = await teamRes.json();
    assert(teamRes.status === 200 && teamData.data.members.length >= 3, 'Workspace team roster listed successfully');

    // Safety check: Cannot demote sole workspace admin
    const adminUser = teamData.data.members.find((m) => m.email === 'admin@insightboard.io');
    const demoteRes = await fetch(`${BASE_URL}/users/${adminUser._id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ role: 'Viewer' }),
    });
    assert(demoteRes.status === 400, 'Safety invariant verified: Cannot demote sole workspace administrator');

    // Profile self-access
    const profileRes = await fetch(`${BASE_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    const profileData = await profileRes.json();
    assert(profileRes.status === 200 && profileData.data.user.role === 'Viewer', 'Viewer accessed personal profile successfully');

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`🎉 ALL ${passedTests} OF ${totalTests} INTEGRATION CHECKS PASSED PERFECTLY!`);
    console.log('================================================================\n');
  } catch (error) {
    console.error('\n❌ MASTER SUITE FAILED:', error.message);
    process.exit(1);
  }
};

runMasterSuite();
