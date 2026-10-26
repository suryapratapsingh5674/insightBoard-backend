import { Router } from 'express';
import { body } from 'express-validator';
import {
  getTeamMembers,
  inviteTeamMember,
  updateUserRole,
  toggleUserStatus,
  getUserProfile,
  updateUserProfile,
} from '../controllers/user.controller.js';
import { verifyAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';

const router = Router();

// All user & team management endpoints require authenticated session
router.use(verifyAuth);

const inviteValidation = [
  body('name').trim().notEmpty().withMessage('User name is required'),
  body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('role')
    .optional()
    .isIn(['Admin', 'Analyst', 'Viewer'])
    .withMessage("Role must be 'Admin', 'Analyst', or 'Viewer'"),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Temporary password must be at least 8 characters long'),
];

const roleValidation = [
  body('role')
    .isIn(['Admin', 'Analyst', 'Viewer'])
    .withMessage("Role must be 'Admin', 'Analyst', or 'Viewer'"),
];

// Profile endpoints (Self)
router.get('/profile', getUserProfile);
router.patch('/profile', updateUserProfile);

// Team roster (All workspace members can view)
router.get('/', getTeamMembers);

// Admin-only management endpoints
router.post('/', requireRole('Admin'), inviteValidation, validate, inviteTeamMember);
router.patch('/:id/role', requireRole('Admin'), roleValidation, validate, updateUserRole);
router.patch('/:id/status', requireRole('Admin'), toggleUserStatus);

export default router;
