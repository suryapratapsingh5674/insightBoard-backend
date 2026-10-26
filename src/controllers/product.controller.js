import { Product } from '../models/index.js';
import { sendSuccess, sendError } from '../utils/apiResponse.js';
import { escapeRegex } from '../utils/regex.js';

/**
 * @desc   List workspace products with search, category filtering, sort, and pagination
 * @route  GET /api/products
 * @access Private (Admin, Analyst, Viewer)
 */
export const getProducts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      category = 'all',
      status = 'active',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      workspaceId: req.workspaceId,
    };

    if (status === 'active') {
      filter.isArchived = false;
    } else if (status === 'archived') {
      filter.isArchived = true;
    }

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { category: searchRegex },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [products, total, categories] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(filter),
      Product.distinct('category', { workspaceId: req.workspaceId }),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return sendSuccess(res, 'Products retrieved successfully', {
      products,
      categories,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Get single product by ID
 * @route  GET /api/products/:id
 * @access Private (Admin, Analyst, Viewer)
 */
export const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    });

    if (!product) {
      return sendError(res, 'Product not found in this workspace', 404);
    }

    return sendSuccess(res, 'Product details retrieved', { product });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Create new product
 * @route  POST /api/products
 * @access Private (Admin, Analyst)
 */
export const createProduct = async (req, res, next) => {
  try {
    const { name, sku, category, unitPricePaise } = req.body;

    // Check duplicate SKU in this workspace
    const existingSku = await Product.findOne({
      sku: sku.toUpperCase().trim(),
      workspaceId: req.workspaceId,
    });

    if (existingSku) {
      return sendError(
        res,
        `A product with SKU '${sku.toUpperCase().trim()}' already exists in your workspace`,
        400
      );
    }

    const product = await Product.create({
      name: name.trim(),
      sku: sku.toUpperCase().trim(),
      category: (category || 'General').trim(),
      unitPricePaise: Math.round(Number(unitPricePaise)),
      workspaceId: req.workspaceId,
      isArchived: false,
    });

    return sendSuccess(res, 'Product created successfully', { product }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Update product details
 * @route  PATCH /api/products/:id
 * @access Private (Admin, Analyst)
 */
export const updateProduct = async (req, res, next) => {
  try {
    const { name, sku, category, unitPricePaise } = req.body;

    const product = await Product.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    });

    if (!product) {
      return sendError(res, 'Product not found in this workspace', 404);
    }

    if (sku && sku.toUpperCase().trim() !== product.sku) {
      const skuCollision = await Product.findOne({
        sku: sku.toUpperCase().trim(),
        workspaceId: req.workspaceId,
        _id: { $ne: product._id },
      });

      if (skuCollision) {
        return sendError(
          res,
          `Another product with SKU '${sku.toUpperCase().trim()}' already exists in your workspace`,
          400
        );
      }
      product.sku = sku.toUpperCase().trim();
    }

    if (name) product.name = name.trim();
    if (category) product.category = category.trim();
    if (unitPricePaise !== undefined) {
      product.unitPricePaise = Math.round(Number(unitPricePaise));
    }

    await product.save();

    return sendSuccess(res, 'Product updated successfully', { product });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Toggle archive state of a product
 * @route  PATCH /api/products/:id/archive
 * @access Private (Admin only)
 */
export const toggleArchiveProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    });

    if (!product) {
      return sendError(res, 'Product not found in this workspace', 404);
    }

    product.isArchived = !product.isArchived;
    await product.save();

    const action = product.isArchived ? 'archived' : 'restored';
    return sendSuccess(res, `Product ${action} successfully`, { product });
  } catch (error) {
    next(error);
  }
};
