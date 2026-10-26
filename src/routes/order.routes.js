import { Router } from 'express';
import { body } from 'express-validator';
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
} from '../controllers/order.controller.js';
import { verifyAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';

const router = Router();

// All order routes require authenticated workspace session
router.use(verifyAuth);

const createOrderValidation = [
  body('customerId').notEmpty().withMessage('Customer ID is required'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one line item is required'),
  body('items.*.productId')
    .notEmpty()
    .withMessage('Product ID is required for each line item'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be an integer greater than or equal to 1'),
  body('status')
    .optional()
    .isIn(['pending', 'paid', 'cancelled'])
    .withMessage('Status must be pending, paid, or cancelled'),
];

const updateStatusValidation = [
  body('status')
    .isIn(['pending', 'paid', 'cancelled'])
    .withMessage("Status must be one of: 'pending', 'paid', 'cancelled'"),
];

// List & Read (Admin, Analyst, Viewer)
router.get('/', getOrders);
router.get('/:id', getOrderById);

// Create order (Admin, Analyst)
router.post(
  '/',
  requireRole('Admin', 'Analyst'),
  createOrderValidation,
  validate,
  createOrder
);

// Update status (Admin, Analyst)
router.patch(
  '/:id/status',
  requireRole('Admin', 'Analyst'),
  updateStatusValidation,
  validate,
  updateOrderStatus
);

export default router;
