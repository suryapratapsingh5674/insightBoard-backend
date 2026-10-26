import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';

// Access token expires in 15 minutes
export const ACCESS_TOKEN_EXPIRY = '15m';

// Refresh token expires in 7 days (in milliseconds)
export const REFRESH_TOKEN_EXPIRY_DAYS = 7;
export const REFRESH_TOKEN_COOKIE_MAX_AGE = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Generate a short-lived signed JWT access token
 */
export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
    },
    config.jwtAccessSecret,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Generate a cryptographically secure random refresh token string
 */
export const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * Compute SHA-256 hash of a token before storing in Session collection
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Verify a JWT access token
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwtAccessSecret);
};

/**
 * Helper to configure standard cookie options for refresh token
 */
export const getRefreshTokenCookieOptions = () => ({
  httpOnly: true, // Prevents JavaScript from reading the cookie (protects against XSS)
  secure: config.nodeEnv === 'production', // Must be true in production for HTTPS
  sameSite: config.nodeEnv === 'production' ? 'none' : 'lax', // 'none' allows cross-domain cookies between Vercel and Render
  maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
});

export const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
});


