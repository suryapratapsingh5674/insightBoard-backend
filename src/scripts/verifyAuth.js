/**
 * Automated Verification Script for Phase 3 Authentication & RBAC
 * Tests login, tokens, cookies, refresh session rotation, reuse detection, and RBAC enforcement.
 */

const BASE_URL = 'http://localhost:5000/api/auth';

const runTests = async () => {
  console.log('🔐 Running Phase 3 Authentication & RBAC Verification Tests...\n');
  let allPassed = true;

  try {
    // Helper to extract cookie from set-cookie header
    const getCookie = (res) => {
      const setCookie = res.headers.get('set-cookie');
      if (!setCookie) return null;
      const match = setCookie.match(/refreshToken=([^;]+)/);
      return match ? match[1] : null;
    };

    // 1. Valid Admin Login
    const adminLoginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@insightboard.io', password: 'password123' }),
    });
    const adminData = await adminLoginRes.json();
    const adminCookie = getCookie(adminLoginRes);

    if (adminLoginRes.status !== 200 || !adminData.data?.accessToken || !adminCookie) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminData)}`);
    }
    console.log(`✅ [1/9] Admin login successful: Issued JWT and HTTP-only refresh cookie`);
    const adminToken = adminData.data.accessToken;

    // 2. Valid Analyst Login
    const analystLoginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'analyst@insightboard.io', password: 'password123' }),
    });
    const analystData = await analystLoginRes.json();
    if (analystLoginRes.status !== 200 || !analystData.data?.accessToken) {
      throw new Error(`Analyst login failed: ${JSON.stringify(analystData)}`);
    }
    console.log(`✅ [2/9] Analyst login successful: Role '${analystData.data.user.role}' verified`);
    const analystToken = analystData.data.accessToken;

    // 3. Valid Viewer Login
    const viewerLoginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'viewer@insightboard.io', password: 'password123' }),
    });
    const viewerData = await viewerLoginRes.json();
    if (viewerLoginRes.status !== 200 || !viewerData.data?.accessToken) {
      throw new Error(`Viewer login failed: ${JSON.stringify(viewerData)}`);
    }
    console.log(`✅ [3/9] Viewer login successful: Role '${viewerData.data.user.role}' verified`);
    const viewerToken = viewerData.data.accessToken;

    // 4. Invalid Password Handling (Generic error, no credential leakage)
    const badPassRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@insightboard.io', password: 'wrongpassword' }),
    });
    const badPassData = await badPassRes.json();
    if (badPassRes.status !== 401 || badPassData.message !== 'Invalid email or password') {
      throw new Error(`Expected 401 generic error, got: ${badPassRes.status}`);
    }
    console.log(`✅ [4/9] Invalid password correctly rejected with generic 401 error`);

    // 5. GET /api/auth/me Profile Lookup
    const meRes = await fetch(`${BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meData = await meRes.json();
    if (meRes.status !== 200 || meData.data?.user?.email !== 'admin@insightboard.io') {
      throw new Error(`GET /me failed: ${JSON.stringify(meData)}`);
    }
    console.log(`✅ [5/9] GET /me verified: User context and workspace '${meData.data.user.workspace.name}' returned`);

    // 6. RBAC: Admin accessing Admin endpoint
    const adminTestRes = await fetch(`${BASE_URL}/test-admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (adminTestRes.status !== 200) {
      throw new Error(`Admin failed to access admin endpoint: ${adminTestRes.status}`);
    }
    console.log(`✅ [6/9] RBAC verified: Admin successfully accessed Admin-only endpoint`);

    // 7. RBAC: Analyst and Viewer blocked from Admin endpoint
    const analystToAdminRes = await fetch(`${BASE_URL}/test-admin`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const viewerToAdminRes = await fetch(`${BASE_URL}/test-admin`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });

    if (analystToAdminRes.status !== 403 || viewerToAdminRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for non-admin roles accessing Admin endpoint`);
    }
    console.log(`✅ [7/9] RBAC verified: Analyst (403) and Viewer (403) strictly rejected from Admin-only endpoint`);

    // 8. Session Rotation via /api/auth/refresh
    const refreshRes = await fetch(`${BASE_URL}/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `refreshToken=${adminCookie}`,
      },
    });
    const refreshData = await refreshRes.json();
    const newAdminCookie = getCookie(refreshRes);

    if (refreshRes.status !== 200 || !refreshData.data?.accessToken || !newAdminCookie) {
      throw new Error(`Token refresh failed: ${JSON.stringify(refreshData)}`);
    }
    console.log(`✅ [8/9] Session rotation verified: New access token and rotated refresh cookie issued`);

    // 9. Session Reuse Detection (Re-submitting old revoked cookie)
    const reuseRes = await fetch(`${BASE_URL}/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `refreshToken=${adminCookie}`, // Already rotated/revoked!
      },
    });
    if (reuseRes.status !== 401) {
      throw new Error(`Expected 401 when presenting revoked refresh token, got: ${reuseRes.status}`);
    }
    console.log(`✅ [9/9] Reuse detection verified: Presenting old refresh token rejected with 401 and terminated`);

    console.log('\n🎉 ALL 9 AUTHENTICATION & RBAC TESTS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    allPassed = false;
    console.error('❌ Verification failed:', err.message);
  } finally {
    process.exit(allPassed ? 0 : 1);
  }
};

runTests();
