import { Router } from 'express';
import { body } from 'express-validator';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  toggleArchiveCustomer,
} from '../controllers/customer.controller.js';
import { verifyAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';

const router = Router();

// All customer routes require authenticated user context
router.use(verifyAuth);

const customerValidation = [
  body('name').trim().notEmpty().withMessage('Customer name is required'),
  body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
];

// List & Read (Admin, Analyst, Viewer)
router.get('/', getCustomers);
router.get('/:id', getCustomerById);

// Create & Update (Admin, Analyst)
router.post(
  '/',
  requireRole('Admin', 'Analyst'),
  customerValidation,
  validate,
  createCustomer
);

router.patch(
  '/:id',
  requireRole('Admin', 'Analyst'),
  [
    body('email').optional().isEmail().withMessage('Please provide a valid email address'),
  ],
  validate,
  updateCustomer
);

// Archive / Restore (Admin only)
router.patch('/:id/archive', requireRole('Admin'), toggleArchiveCustomer);

export default router;
