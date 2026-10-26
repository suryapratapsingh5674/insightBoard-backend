import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
  REFRESH_TOKEN_COOKIE_MAX_AGE,
} from '../utils/token.js';
import { sendSuccess, sendError } from '../utils/apiResponse.js';
import { User, Session } from '../models/index.js';

/**
 * @desc   Authenticate user with email and password
 * @route  POST /api/auth/login
 * @access Public (Rate limited)
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user by normalized email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Intentionally generic error to prevent account enumeration
      return sendError(res, 'Invalid email or password', 401);
    }

    // Verify password hash
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return sendError(res, 'Invalid email or password', 401);
    }

    // Check account status
    if (!user.isActive) {
      return sendError(
        res,
        'Your account has been deactivated. Please contact your workspace administrator.',
        403
      );
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    // Save refresh session in MongoDB with expiration
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_COOKIE_MAX_AGE);
    await Session.create({
      userId: user._id,
      tokenHash,
      expiresAt,
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || '',
    });

    // Populate workspace details for initial client state
    await user.populate('workspaceId', 'name slug currency timezone');

    // Attach refresh token in secure HTTP-only cookie
    res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

    return sendSuccess(res, 'Signed in successfully', {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        workspace: user.workspaceId,
      },
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Rotate refresh token and issue new access token
 * @route  POST /api/auth/refresh
 * @access Public (Requires valid refresh token cookie)
 */
export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return sendError(res, 'No refresh token provided in session cookie', 401);
    }

    const tokenHash = hashToken(refreshToken);
    const session = await Session.findOne({ tokenHash });

    if (!session) {
      res.clearCookie('refreshToken', getRefreshTokenCookieOptions());
      return sendError(res, 'Invalid or unrecognized session', 401);
    }

    // Reuse detection: If a revoked token is presented, suspect token theft!
    if (session.revokedAt) {
      // Invalidate all active sessions for this user for safety
      await Session.updateMany(
        { userId: session.userId, revokedAt: null },
        { revokedAt: new Date() }
      );
      res.clearCookie('refreshToken', getClearCookieOptions());
      return sendError(
        res,
        'Security alert: Revoked session reuse detected. All active sessions have been terminated. Please log in again.',
        401
      );
    }

    // Check session expiration
    if (session.expiresAt < new Date()) {
      res.clearCookie('refreshToken', getClearCookieOptions());
      return sendError(res, 'Session expired. Please log in again.', 401);
    }

    // Find user
    const user = await User.findById(session.userId).populate(
      'workspaceId',
      'name slug currency timezone'
    );

    if (!user || !user.isActive) {
      res.clearCookie('refreshToken', getClearCookieOptions());
      return sendError(res, 'Account is deactivated or no longer exists', 403);
    }

    // --- Token Rotation ---
    // 1. Revoke the used session
    session.revokedAt = new Date();
    await session.save();

    // 2. Issue fresh token pair
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRefreshToken);

    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_COOKIE_MAX_AGE);
    await Session.create({
      userId: user._id,
      tokenHash: newTokenHash,
      expiresAt: newExpiresAt,
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || '',
    });

    // 3. Set the new refresh cookie
    res.cookie('refreshToken', newRefreshToken, getRefreshTokenCookieOptions());

    return sendSuccess(res, 'Session refreshed successfully', {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        workspace: user.workspaceId,
      },
      accessToken: newAccessToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Revoke current session and clear refresh cookie
 * @route  POST /api/auth/logout
 * @access Public (Reads cookie if present)
 */
export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await Session.updateOne(
        { tokenHash, revokedAt: null },
        { revokedAt: new Date() }
      );
    }

    // Always clear the cookie
    res.clearCookie('refreshToken', getClearCookieOptions());

    return sendSuccess(res, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Get current authenticated user profile & workspace
 * @route  GET /api/auth/me
 * @access Private (Requires verifyAuth)
 */
export const getMe = async (req, res) => {
  return sendSuccess(res, 'Authenticated user context retrieved', {
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      workspace: req.user.workspaceId,
    },
  });
};
