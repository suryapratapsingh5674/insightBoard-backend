/**
 * Automated Verification Script for Phase 4: Customers & Products
 * Tests CRUD operations, workspace isolation, search, filtering, pagination, and RBAC rules.
 */

const BASE_URL = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('📦 Running Phase 4 Customers & Products Verification Tests...\n');
  let allPassed = true;

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

    // 2. GET /api/customers listing with pagination
    const custListRes = await fetch(`${BASE_URL}/customers?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const custListData = await custListRes.json();
    if (custListRes.status !== 200 || custListData.data.customers.length !== 5) {
      throw new Error(`Customer listing failed: ${JSON.stringify(custListData)}`);
    }
    console.log(`✅ [1/10] GET /customers pagination verified (Returned 5 of ${custListData.data.pagination.total} total)`);

    // 3. Search customers
    const custSearchRes = await fetch(`${BASE_URL}/customers?search=Oliver`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const custSearchData = await custSearchRes.json();
    if (custSearchData.data.customers.length === 0 || !custSearchData.data.customers[0].name.includes('Oliver')) {
      throw new Error(`Customer search failed: ${JSON.stringify(custSearchData)}`);
    }
    console.log(`✅ [2/10] Customer search verified (Found: ${custSearchData.data.customers[0].name})`);

    // 4. POST /api/customers: Admin creates customer (201)
    const newCustEmail = `test.client.${Date.now()}@domain.com`;
    const createCustRes = await fetch(`${BASE_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Quantum Logic Systems',
        email: newCustEmail,
        company: 'Quantum Logic Ltd',
        phone: '+91 91234 56789',
      }),
    });
    const createCustData = await createCustRes.json();
    if (createCustRes.status !== 201) {
      throw new Error(`Customer creation failed: ${JSON.stringify(createCustData)}`);
    }
    const createdCustomerId = createCustData.data.customer._id;
    console.log(`✅ [3/10] Admin created new customer successfully (ID: ${createdCustomerId})`);

    // 5. POST /api/customers: Viewer rejected with 403 Forbidden
    const viewerCreateCustRes = await fetch(`${BASE_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Customer',
        email: 'unauth@domain.com',
      }),
    });
    if (viewerCreateCustRes.status !== 403) {
      throw new Error(`Expected 403 for Viewer creating customer, got: ${viewerCreateCustRes.status}`);
    }
    console.log('✅ [4/10] RBAC verified: Viewer rejected with 403 from customer creation');

    // 6. PATCH /api/customers/:id/archive:
    // Analyst rejected with 403
    const analystArchiveRes = await fetch(`${BASE_URL}/customers/${createdCustomerId}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    if (analystArchiveRes.status !== 403) {
      throw new Error(`Expected 403 for Analyst archiving customer, got: ${analystArchiveRes.status}`);
    }
    // Admin succeeds with 200
    const adminArchiveRes = await fetch(`${BASE_URL}/customers/${createdCustomerId}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminArchiveData = await adminArchiveRes.json();
    if (adminArchiveRes.status !== 200 || !adminArchiveData.data.customer.isArchived) {
      throw new Error(`Admin archive failed: ${JSON.stringify(adminArchiveData)}`);
    }
    console.log('✅ [5/10] Customer archiving verified (Analyst 403 blocked, Admin 200 succeeded)');

    // 7. GET /api/products listing and categories
    const prodListRes = await fetch(`${BASE_URL}/products?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const prodListData = await prodListRes.json();
    if (prodListRes.status !== 200 || prodListData.data.products.length !== 5 || !prodListData.data.categories.length) {
      throw new Error(`Product listing failed: ${JSON.stringify(prodListData)}`);
    }
    console.log(`✅ [6/10] GET /products verified (${prodListData.data.pagination.total} products, categories: [${prodListData.data.categories.join(', ')}])`);

    // 8. Filter products by category
    const categoryFilterRes = await fetch(`${BASE_URL}/products?category=Audio`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const categoryFilterData = await categoryFilterRes.json();
    const allAudio = categoryFilterData.data.products.every((p) => p.category === 'Audio');
    if (!allAudio || categoryFilterData.data.products.length === 0) {
      throw new Error('Category filtering failed to isolate Audio products');
    }
    console.log(`✅ [7/10] Product category filtering verified (All ${categoryFilterData.data.products.length} items in category 'Audio')`);

    // 9. POST /api/products: Admin creates product with minor unit paise
    const newSku = `SKU-TEST-${Date.now().toString().slice(-4)}`;
    const createProdRes = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Mechanical Numpad Pro',
        sku: newSku,
        category: 'Electronics',
        unitPricePaise: 249900, // ₹2,499.00
      }),
    });
    const createProdData = await createProdRes.json();
    if (createProdRes.status !== 201 || createProdData.data.product.unitPricePaise !== 249900) {
      throw new Error(`Product creation failed: ${JSON.stringify(createProdData)}`);
    }
    const createdProductId = createProdData.data.product._id;
    console.log(`✅ [8/10] Product created with minor unit paise: ₹${createProdData.data.product.unitPricePaise / 100} (${newSku})`);

    // 10. Duplicate SKU rejected with 400
    const duplicateSkuRes = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Another Item with Same SKU',
        sku: newSku,
        category: 'Electronics',
        unitPricePaise: 199900,
      }),
    });
    if (duplicateSkuRes.status !== 400) {
      throw new Error(`Expected 400 for duplicate SKU, got: ${duplicateSkuRes.status}`);
    }
    console.log('✅ [9/10] Duplicate SKU in workspace rejected with 400 Bad Request');

    // 11. Archive product by Admin
    const archiveProdRes = await fetch(`${BASE_URL}/products/${createdProductId}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const archiveProdData = await archiveProdRes.json();
    if (archiveProdRes.status !== 200 || !archiveProdData.data.product.isArchived) {
      throw new Error(`Product archiving failed: ${JSON.stringify(archiveProdData)}`);
    }
    console.log('✅ [10/10] Product archiving verified (Status toggled to archived: true)');

    console.log('\n🎉 ALL 10 CUSTOMERS & PRODUCTS TESTS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    allPassed = false;
    console.error('❌ Verification failed:', err.message);
  } finally {
    process.exit(allPassed ? 0 : 1);
  }
};

runTests();
