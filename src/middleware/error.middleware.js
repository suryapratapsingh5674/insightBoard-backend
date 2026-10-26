import { config } from '../config/env.js';
import { sendError } from '../utils/apiResponse.js';

/**
 * Centralized Error Handling Middleware
 * Catches all sync/async errors forwarded via next(err)
 */
export const errorHandler = (err, req, res, next) => {
  console.error(`❌ [${req.method}] ${req.originalUrl} Error:`, err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  return sendError(
    res,
    message,
    statusCode,
    config.nodeEnv === 'development' ? err.stack : null
  );
};
