/**
 * Standardized API Response Helpers
 * Keeps response JSON contracts consistent across all endpoints.
 */

export const sendSuccess = (res, message, data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    ...(data !== null && { data }),
  });
};

export const sendError = (res, message = 'Internal Server Error', statusCode = 500, details = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(details !== null && { details }),
  });
};
