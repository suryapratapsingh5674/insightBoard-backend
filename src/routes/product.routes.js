import { Router } from 'express';
import { body } from 'express-validator';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  toggleArchiveProduct,
} from '../controllers/product.controller.js';
import { verifyAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';

const router = Router();

// All product catalog routes require authenticated user context
router.use(verifyAuth);

const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('sku').trim().notEmpty().withMessage('Product SKU is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('unitPricePaise')
    .notEmpty()
    .withMessage('Unit price is required')
    .isInt({ min: 0 })
    .withMessage('Unit price in paise must be a positive integer'),
];

// List & Read (Admin, Analyst, Viewer)
router.get('/', getProducts);
router.get('/:id', getProductById);

// Create & Update (Admin, Analyst)
router.post(
  '/',
  requireRole('Admin', 'Analyst'),
  productValidation,
  validate,
  createProduct
);

router.patch(
  '/:id',
  requireRole('Admin', 'Analyst'),
  [
    body('unitPricePaise')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Unit price in paise must be a positive integer'),
  ],
  validate,
  updateProduct
);

// Archive / Restore (Admin only)
router.patch('/:id/archive', requireRole('Admin'), toggleArchiveProduct);

export default router;
