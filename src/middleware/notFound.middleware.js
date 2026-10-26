import { sendError } from '../utils/apiResponse.js';

/**
 * 404 handler for routes that do not match any defined endpoint
 */
export const notFoundHandler = (req, res, next) => {
  return sendError(
    res,
    `Cannot ${req.method} ${req.originalUrl} - Endpoint not found`,
    404
  );
};
