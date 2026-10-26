import { Router } from 'express';
import { body } from 'express-validator';
import { login, refresh, logout, getMe } from '../controllers/auth.controller.js';
import { verifyAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();

// Validation rules for login
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// Public Auth Endpoints
router.post('/login', authRateLimiter, loginValidation, validate, login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Protected Auth Endpoint
router.get('/me', verifyAuth, getMe);

// Role-Based Access Control (RBAC) Verification Endpoints
router.get('/test-admin', verifyAuth, requireRole('Admin'), (req, res) => {
  return sendSuccess(res, 'Access granted: Admin privileged endpoint accessed successfully', {
    user: req.user.name,
    role: req.user.role,
  });
});

router.get('/test-analyst', verifyAuth, requireRole('Admin', 'Analyst'), (req, res) => {
  return sendSuccess(res, 'Access granted: Analyst/Admin privileged endpoint accessed successfully', {
    user: req.user.name,
    role: req.user.role,
  });
});

export default router;
