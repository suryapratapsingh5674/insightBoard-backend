import { verifyAccessToken } from '../utils/token.js';
import { sendError } from '../utils/apiResponse.js';
import { User } from '../models/index.js';

/**
 * Authentication Middleware:
 * Verifies JWT access token in Authorization: Bearer <token>
 * and attaches authenticated user and workspaceId to the request object.
 */
export const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(
        res,
        'Authentication required. Please provide a valid Bearer token.',
        401
      );
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return sendError(res, 'Access token has expired. Please refresh your session.', 401);
      }
      return sendError(res, 'Invalid access token.', 401);
    }

    // Verify user still exists in database and has not been deactivated
    const user = await User.findById(decoded.userId).populate('workspaceId', 'name slug currency timezone');

    if (!user) {
      return sendError(res, 'The account associated with this token no longer exists.', 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Your account has been deactivated. Please contact your workspace administrator.', 403);
    }

    // Attach user and workspace context to request object
    req.user = user;
    req.workspaceId = user.workspaceId._id;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Authorization Middleware (RBAC):
 * Ensures that the authenticated user possesses one of the required roles.
 *
 * Example: requireRole('Admin') or requireRole('Admin', 'Analyst')
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required before checking permissions.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        `Forbidden: Role '${req.user.role}' lacks permission for this operation. Required: [${allowedRoles.join(', ')}]`,
        403
      );
    }

    next();
  };
};
