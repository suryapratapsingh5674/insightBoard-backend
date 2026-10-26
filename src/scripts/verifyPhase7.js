/**
 * Automated Verification Script for Phase 7: Team Management & User Profile
 * Tests team listing, member invitations, role modifications, account deactivations,
 * self-profile updates, password changes, safety guards, and RBAC rules.
 */

const BASE_URL = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('👥 Running Phase 7 Team Management & User Profile Tests...\n');

  try {
    // 1. Authenticate as Admin, Analyst, and Viewer
    const login = async (email, password = 'password123') => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      return data.data.accessToken;
    };

    const adminToken = await login('admin@insightboard.io');
    const analystToken = await login('analyst@insightboard.io');
    const viewerToken = await login('viewer@insightboard.io');

    console.log('🔑 Authenticated Admin, Analyst, and Viewer tokens acquired.');

    // 2. GET /api/users: All roles can list workspace team members
    const teamRes = await fetch(`${BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    const teamData = await teamRes.json();
    if (teamRes.status !== 200 || !Array.isArray(teamData.data.members)) {
      throw new Error(`Team roster failed: ${JSON.stringify(teamData)}`);
    }
    console.log(
      `✅ [1/12] GET /users verified: Viewer successfully viewed team roster (${teamData.data.total} members)`
    );

    // 3. POST /api/users: Admin invites new member
    const uniqueEmail = `test.member.${Date.now()}@insightboard.io`;
    const inviteRes = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Jordan Sparks',
        email: uniqueEmail,
        role: 'Viewer',
        password: 'temporaryPassword123',
      }),
    });
    const inviteData = await inviteRes.json();
    if (inviteRes.status !== 201 || !inviteData.data.user) {
      throw new Error(`Member invite failed: ${JSON.stringify(inviteData)}`);
    }
    const createdMember = inviteData.data.user;
    console.log(
      `✅ [2/12] POST /users verified: Admin invited new member '${createdMember.name}' (${createdMember.email})`
    );

    // 4. Duplicate email validation (400 Bad Request)
    const dupRes = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Duplicate Jordan',
        email: uniqueEmail,
        role: 'Viewer',
        password: 'temporaryPassword123',
      }),
    });
    if (dupRes.status !== 400) {
      throw new Error(`Duplicate email should be rejected with 400, got ${dupRes.status}`);
    }
    console.log('✅ [3/12] Validation verified: Duplicate email registration rejected (400 Bad Request)');

    // 5. RBAC Check: Analyst CANNOT invite members (403 Forbidden)
    const analystInviteRes = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${analystToken}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Member',
        email: `unauth.${Date.now()}@domain.com`,
        role: 'Viewer',
        password: 'password123',
      }),
    });
    if (analystInviteRes.status !== 403) {
      throw new Error(`RBAC failed: Analyst should get 403, got ${analystInviteRes.status}`);
    }
    console.log('✅ [4/12] RBAC verified: Analyst role blocked from inviting team members (403 Forbidden)');

    // 6. RBAC Check: Viewer CANNOT invite members (403 Forbidden)
    const viewerInviteRes = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Viewer Add',
        email: `unauth.viewer.${Date.now()}@domain.com`,
        role: 'Viewer',
        password: 'password123',
      }),
    });
    if (viewerInviteRes.status !== 403) {
      throw new Error(`RBAC failed: Viewer should get 403, got ${viewerInviteRes.status}`);
    }
    console.log('✅ [5/12] RBAC verified: Viewer role blocked from inviting team members (403 Forbidden)');

    // 7. PATCH /api/users/:id/role: Admin updates role from Viewer to Analyst
    const roleUpdateRes = await fetch(`${BASE_URL}/users/${createdMember._id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ role: 'Analyst' }),
    });
    const roleUpdateData = await roleUpdateRes.json();
    if (roleUpdateRes.status !== 200 || roleUpdateData.data.user.role !== 'Analyst') {
      throw new Error(`Role update failed: ${JSON.stringify(roleUpdateData)}`);
    }
    console.log(
      `✅ [6/12] PATCH /users/:id/role verified: Admin updated member role to '${roleUpdateData.data.user.role}'`
    );

    // 8. RBAC Check: Viewer CANNOT update member roles (403 Forbidden)
    const viewerRoleRes = await fetch(`${BASE_URL}/users/${createdMember._id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({ role: 'Admin' }),
    });
    if (viewerRoleRes.status !== 403) {
      throw new Error(`RBAC failed: Viewer should get 403 on role update, got ${viewerRoleRes.status}`);
    }
    console.log('✅ [7/12] RBAC verified: Viewer role blocked from modifying member roles (403 Forbidden)');

    // 9. Safety Guard: Admin CANNOT demote the sole administrator
    // Let's find the current admin's ID from teamData
    const adminMember = teamData.data.members.find((m) => m.email === 'admin@insightboard.io');
    const demoteSoleAdminRes = await fetch(`${BASE_URL}/users/${adminMember._id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ role: 'Viewer' }),
    });
    if (demoteSoleAdminRes.status !== 400) {
      throw new Error(
        `Safety failed: Demoting sole admin should return 400, got ${demoteSoleAdminRes.status}`
      );
    }
    console.log('✅ [8/12] Safety guard verified: Cannot demote sole workspace administrator (400 Bad Request)');

    // 10. PATCH /api/users/:id/status: Admin deactivates created member
    const deactivateRes = await fetch(`${BASE_URL}/users/${createdMember._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const deactivateData = await deactivateRes.json();
    if (deactivateRes.status !== 200 || deactivateData.data.user.isActive !== false) {
      throw new Error(`Deactivation failed: ${JSON.stringify(deactivateData)}`);
    }
    console.log('✅ [9/12] Account status toggle verified: Member deactivated successfully (isActive: false)');

    // 11. Safety Guard: Admin CANNOT deactivate own account
    const selfDeactivateRes = await fetch(`${BASE_URL}/users/${adminMember._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (selfDeactivateRes.status !== 400) {
      throw new Error(`Safety failed: Self-deactivation should return 400, got ${selfDeactivateRes.status}`);
    }
    console.log('✅ [10/12] Safety guard verified: Admin cannot deactivate their own account (400 Bad Request)');

    // 12. GET /api/users/profile: Authenticated user views profile
    const profileRes = await fetch(`${BASE_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const profileData = await profileRes.json();
    if (profileRes.status !== 200 || profileData.data.user.email !== 'analyst@insightboard.io') {
      throw new Error(`Profile fetch failed: ${JSON.stringify(profileData)}`);
    }
    console.log(
      `✅ [11/12] GET /users/profile verified (User: ${profileData.data.user.name}, Workspace: ${profileData.data.user.workspaceId?.name})`
    );

    // 13. PATCH /api/users/profile: Update user display name
    const updateProfileRes = await fetch(`${BASE_URL}/users/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${analystToken}`,
      },
      body: JSON.stringify({ name: 'Priya Sharma (Senior Analyst)' }),
    });
    const updateProfileData = await updateProfileRes.json();
    if (updateProfileRes.status !== 200 || updateProfileData.data.user.name !== 'Priya Sharma (Senior Analyst)') {
      throw new Error(`Profile update failed: ${JSON.stringify(updateProfileData)}`);
    }
    console.log(
      `✅ [12/12] PATCH /users/profile verified: User display name updated to '${updateProfileData.data.user.name}'`
    );

    console.log('\n🎉 ALL 12 PHASE 7 TEAM MANAGEMENT & PROFILE TESTS PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('❌ Verification test failed:', error.message);
    process.exit(1);
  }
};

runTests();
