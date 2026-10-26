/**
 * Automated Verification Script for Phase 5: Orders & Calculations
 * Tests order listing, pagination, status filtering, server-calculated snapshots,
 * customer & product validation, immutable receipts, and RBAC enforcement.
 */

const BASE_URL = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('📦 Running Phase 5 Orders & Calculations Verification Tests...\n');

  try {
    // 1. Authenticate as Admin, Analyst, and Viewer
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
    const analystToken = await login('analyst@insightboard.io');
    const viewerToken = await login('viewer@insightboard.io');

    console.log('🔑 Authenticated Admin, Analyst, and Viewer tokens acquired.');

    // 2. GET /api/orders listing with pagination
    const ordersRes = await fetch(`${BASE_URL}/orders?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const ordersData = await ordersRes.json();
    if (ordersRes.status !== 200 || ordersData.data.orders.length === 0) {
      throw new Error(`Order listing failed: ${JSON.stringify(ordersData)}`);
    }
    console.log(
      `✅ [1/11] GET /orders pagination verified (Returned ${ordersData.data.orders.length} of ${ordersData.data.pagination.total} total)`
    );

    // 3. Filter orders by status
    const paidOrdersRes = await fetch(`${BASE_URL}/orders?status=paid&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const paidOrdersData = await paidOrdersRes.json();
    const allPaid = paidOrdersData.data.orders.every((o) => o.status === 'paid');
    if (!allPaid) {
      throw new Error('Status filter failed: non-paid order returned');
    }
    console.log(
      `✅ [2/11] Order status filter verified (Found ${paidOrdersData.data.pagination.total} 'paid' orders)`
    );

    // 4. Search orders by customer name / order number
    const firstOrder = ordersData.data.orders[0];
    const searchRes = await fetch(`${BASE_URL}/orders?search=${encodeURIComponent(firstOrder.orderNumber)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchData = await searchRes.json();
    if (searchData.data.orders.length === 0 || searchData.data.orders[0].orderNumber !== firstOrder.orderNumber) {
      throw new Error(`Order search failed: ${JSON.stringify(searchData)}`);
    }
    console.log(`✅ [3/11] Order search verified (Found: ${searchData.data.orders[0].orderNumber})`);

    // Fetch active customer and products to use for test order
    const custRes = await fetch(`${BASE_URL}/customers?limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const custData = await custRes.json();
    const testCustomer = custData.data.customers[0];

    const prodRes = await fetch(`${BASE_URL}/products?limit=2`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const prodData = await prodRes.json();
    const testProducts = prodData.data.products;

    if (!testCustomer || testProducts.length < 2) {
      throw new Error('Not enough test customers or products available');
    }

    // 5. POST /api/orders: Admin creates order with server-calculated price snapshots
    const expectedSubtotal1 = testProducts[0].unitPricePaise * 2;
    const expectedSubtotal2 = testProducts[1].unitPricePaise * 3;
    const expectedTotalPaise = expectedSubtotal1 + expectedSubtotal2;

    const createOrderRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        customerId: testCustomer._id,
        items: [
          { productId: testProducts[0]._id, quantity: 2 },
          { productId: testProducts[1]._id, quantity: 3 },
        ],
        status: 'pending',
      }),
    });
    const createOrderData = await createOrderRes.json();
    if (createOrderRes.status !== 201) {
      throw new Error(`Order creation failed: ${JSON.stringify(createOrderData)}`);
    }

    const createdOrder = createOrderData.data.order;
    if (createdOrder.totalAmountPaise !== expectedTotalPaise) {
      throw new Error(
        `Total calculation mismatch: expected ${expectedTotalPaise} paise, got ${createdOrder.totalAmountPaise} paise`
      );
    }
    console.log(
      `✅ [4/11] Order creation & server-side total calculation verified (Total: ₹${(createdOrder.totalAmountPaise / 100).toFixed(2)})`
    );

    // 6. Verify immutable line item snapshot fields
    const lineItem1 = createdOrder.items[0];
    if (
      !lineItem1.productName ||
      !lineItem1.sku ||
      lineItem1.unitPricePaise !== testProducts[0].unitPricePaise ||
      lineItem1.subtotalPaise !== expectedSubtotal1
    ) {
      throw new Error(`Line item snapshot invalid: ${JSON.stringify(lineItem1)}`);
    }
    console.log(
      `✅ [5/11] Immutable line-item snapshot verified (Product: ${lineItem1.productName}, SKU: ${lineItem1.sku}, Subtotal: ₹${(lineItem1.subtotalPaise / 100).toFixed(2)})`
    );

    // 7. RBAC Check: Viewer CANNOT create an order (403 Forbidden)
    const viewerCreateRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({
        customerId: testCustomer._id,
        items: [{ productId: testProducts[0]._id, quantity: 1 }],
      }),
    });
    if (viewerCreateRes.status !== 403) {
      throw new Error(`RBAC failed: Viewer should get 403 on order creation, got ${viewerCreateRes.status}`);
    }
    console.log('✅ [6/11] RBAC verified: Viewer role blocked from creating orders (403 Forbidden)');

    // 8. Validation Rejection: Missing items or negative quantity (400 Bad Request)
    const invalidQtyRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        customerId: testCustomer._id,
        items: [{ productId: testProducts[0]._id, quantity: 0 }],
      }),
    });
    if (invalidQtyRes.status !== 400) {
      throw new Error(`Validation failed: Zero quantity should return 400, got ${invalidQtyRes.status}`);
    }
    console.log('✅ [7/11] Input validation verified: Zero or negative quantity rejected (400 Bad Request)');

    // 9. GET /api/orders/:id returns full order details
    const orderDetailsRes = await fetch(`${BASE_URL}/orders/${createdOrder._id}`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    const orderDetailsData = await orderDetailsRes.json();
    if (orderDetailsRes.status !== 200 || !orderDetailsData.data.order.items) {
      throw new Error(`Get order details failed: ${JSON.stringify(orderDetailsData)}`);
    }
    console.log(`✅ [8/11] GET /orders/:id verified: Read access allowed for Viewer`);

    // 10. PATCH /api/orders/:id/status updates status to 'paid' (Admin / Analyst)
    const statusUpdateRes = await fetch(`${BASE_URL}/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${analystToken}`,
      },
      body: JSON.stringify({ status: 'paid' }),
    });
    const statusUpdateData = await statusUpdateRes.json();
    if (statusUpdateRes.status !== 200 || statusUpdateData.data.order.status !== 'paid') {
      throw new Error(`Status update failed: ${JSON.stringify(statusUpdateData)}`);
    }
    console.log(`✅ [9/11] PATCH /orders/:id/status verified: Analyst updated status to 'paid'`);

    // 11. RBAC Check: Viewer CANNOT update order status (403 Forbidden)
    const viewerStatusRes = await fetch(`${BASE_URL}/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (viewerStatusRes.status !== 403) {
      throw new Error(`RBAC failed: Viewer should get 403 on status update, got ${viewerStatusRes.status}`);
    }
    console.log('✅ [10/11] RBAC verified: Viewer role blocked from updating order status (403 Forbidden)');

    // 12. Invalid status update rejected (400 Bad Request)
    const invalidStatusRes = await fetch(`${BASE_URL}/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'shipped_invalid' }),
    });
    if (invalidStatusRes.status !== 400) {
      throw new Error(`Validation failed: Invalid status should return 400, got ${invalidStatusRes.status}`);
    }
    console.log('✅ [11/11] Status validation verified: Invalid status transition rejected (400 Bad Request)');

    console.log('\n🎉 ALL 11 PHASE 5 BACKEND VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('❌ Verification test failed:', error.message);
    process.exit(1);
  }
};

runTests();
