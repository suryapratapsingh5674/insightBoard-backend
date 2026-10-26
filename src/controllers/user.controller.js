import bcrypt from 'bcryptjs';
import { User, Session, Workspace } from '../models/index.js';
import { sendSuccess, sendError } from '../utils/apiResponse.js';

/**
 * @desc   List all team members belonging to the current workspace
 * @route  GET /api/users
 * @access Private (Admin, Analyst, Viewer)
 */
export const getTeamMembers = async (req, res, next) => {
  try {
    const members = await User.find({ workspaceId: req.workspaceId })
      .select('-passwordHash')
      .sort({ createdAt: 1 })
      .lean();

    return sendSuccess(res, 'Team members retrieved successfully', {
      members,
      total: members.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Invite / register a new team member to the workspace
 * @route  POST /api/users
 * @access Private (Admin only)
 */
export const inviteTeamMember = async (req, res, next) => {
  try {
    const { name, email, role = 'Viewer', password } = req.body;

    if (!name || !email || !password) {
      return sendError(res, 'Name, email, and password are required', 400);
    }

    if (password.length < 8) {
      return sendError(res, 'Temporary password must be at least 8 characters long', 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already registered across any workspace
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return sendError(res, 'A user account with this email address already exists', 400);
    }

    // Hash password securely
    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: ['Admin', 'Analyst', 'Viewer'].includes(role) ? role : 'Viewer',
      workspaceId: req.workspaceId,
      isActive: true,
    });

    const userResponse = newUser.toJSON();

    return sendSuccess(res, `Team member '${newUser.name}' added successfully`, { user: userResponse }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Update a team member's role within the workspace
 * @route  PATCH /api/users/:id/role
 * @access Private (Admin only)
 */
export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const targetUserId = req.params.id;

    if (!['Admin', 'Analyst', 'Viewer'].includes(role)) {
      return sendError(res, "Role must be one of: 'Admin', 'Analyst', 'Viewer'", 400);
    }

    const targetUser = await User.findOne({
      _id: targetUserId,
      workspaceId: req.workspaceId,
    });

    if (!targetUser) {
      return sendError(res, 'User not found in your workspace', 404);
    }

    // Safety check: Prevent demoting the sole remaining Admin
    if (targetUser.role === 'Admin' && role !== 'Admin') {
      const activeAdminCount = await User.countDocuments({
        workspaceId: req.workspaceId,
        role: 'Admin',
        isActive: true,
      });

      if (activeAdminCount <= 1) {
        return sendError(
          res,
          'Cannot demote the sole remaining administrator in your workspace',
          400
        );
      }
    }

    targetUser.role = role;
    await targetUser.save();

    return sendSuccess(res, `Role for ${targetUser.name} updated to ${role}`, {
      user: targetUser.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Toggle a team member's active status (deactivate/reactivate)
 * @route  PATCH /api/users/:id/status
 * @access Private (Admin only)
 */
export const toggleUserStatus = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    // Safety: Admin cannot deactivate their own account
    if (targetUserId === req.user._id.toString()) {
      return sendError(res, 'You cannot deactivate your own account', 400);
    }

    const targetUser = await User.findOne({
      _id: targetUserId,
      workspaceId: req.workspaceId,
    });

    if (!targetUser) {
      return sendError(res, 'User not found in your workspace', 404);
    }

    // Safety: Cannot deactivate the sole active Admin
    if (targetUser.role === 'Admin' && targetUser.isActive) {
      const activeAdminCount = await User.countDocuments({
        workspaceId: req.workspaceId,
        role: 'Admin',
        isActive: true,
      });

      if (activeAdminCount <= 1) {
        return sendError(
          res,
          'Cannot deactivate the sole remaining administrator in your workspace',
          400
        );
      }
    }

    targetUser.isActive = !targetUser.isActive;
    await targetUser.save();

    // If deactivated, revoke all active sessions for this user
    if (!targetUser.isActive) {
      await Session.deleteMany({ userId: targetUser._id });
    }

    const statusLabel = targetUser.isActive ? 'activated' : 'deactivated';
    return sendSuccess(res, `Account for ${targetUser.name} ${statusLabel} successfully`, {
      user: targetUser.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Get current user profile and workspace info
 * @route  GET /api/users/profile
 * @access Private (All authenticated users)
 */
export const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-passwordHash')
      .populate('workspaceId', 'name slug plan')
      .lean();

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    return sendSuccess(res, 'User profile retrieved', { user });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Update current user profile (name and/or password)
 * @route  PATCH /api/users/profile
 * @access Private (All authenticated users)
 */
export const updateUserProfile = async (req, res, next) => {
  try {
    const { name, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    if (name && name.trim()) {
      user.name = name.trim();
    }

    // If changing password, verify current password first
    if (newPassword) {
      if (!currentPassword) {
        return sendError(res, 'Current password is required to set a new password', 400);
      }

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return sendError(res, 'Incorrect current password', 400);
      }

      if (newPassword.length < 8) {
        return sendError(res, 'New password must be at least 8 characters long', 400);
      }

      user.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    await user.save();

    return sendSuccess(res, 'Profile updated successfully', {
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};
