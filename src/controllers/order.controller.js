import { Order, Customer, Product } from '../models/index.js';
import { sendSuccess, sendError } from '../utils/apiResponse.js';
import { escapeRegex } from '../utils/regex.js';

/**
 * @desc   List workspace orders with search, status filtering, sorting, and pagination
 * @route  GET /api/orders
 * @access Private (Admin, Analyst, Viewer)
 */
export const getOrders = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = 'all',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      workspaceId: req.workspaceId,
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    // Search by orderNumber or customer name
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(escapeRegex(search), 'i');

      // Find matching customers first
      const matchingCustomers = await Customer.find({
        workspaceId: req.workspaceId,
        $or: [{ name: searchRegex }, { email: searchRegex }, { company: searchRegex }],
      }).select('_id');

      const customerIds = matchingCustomers.map((c) => c._id);

      filter.$or = [
        { orderNumber: searchRegex },
        { customerId: { $in: customerIds } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('customerId', 'name email company phone')
        .populate('createdBy', 'name email role')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return sendSuccess(res, 'Orders retrieved successfully', {
      orders,
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
 * @desc   Get single order by ID with line items and customer details
 * @route  GET /api/orders/:id
 * @access Private (Admin, Analyst, Viewer)
 */
export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    })
      .populate('customerId', 'name email company phone isArchived')
      .populate('createdBy', 'name email role');

    if (!order) {
      return sendError(res, 'Order not found in this workspace', 404);
    }

    return sendSuccess(res, 'Order details retrieved', { order });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Create new order with server-calculated price snapshots
 * @route  POST /api/orders
 * @access Private (Admin, Analyst)
 */
export const createOrder = async (req, res, next) => {
  try {
    const { customerId, items, status = 'pending' } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendError(res, 'Order must contain at least one line item', 400);
    }

    // 1. Verify customer exists in this workspace
    const customer = await Customer.findOne({
      _id: customerId,
      workspaceId: req.workspaceId,
    });

    if (!customer) {
      return sendError(res, 'Customer does not exist in your workspace', 400);
    }

    if (customer.isArchived) {
      return sendError(res, 'Cannot create new orders for an archived customer profile', 400);
    }

    // 2. Fetch all referenced products from database (tenant isolation)
    const productIds = items.map((item) => item.productId);
    const dbProducts = await Product.find({
      _id: { $in: productIds },
      workspaceId: req.workspaceId,
    });

    if (dbProducts.length !== productIds.length) {
      return sendError(
        res,
        'One or more selected products were not found in your workspace',
        400
      );
    }

    const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

    // 3. Compute server-side price snapshots (Never trust client-supplied totals or unit prices!)
    const orderItems = [];
    let totalAmountPaise = 0;

    for (const item of items) {
      const prod = productMap.get(item.productId.toString());

      if (!prod) {
        return sendError(res, `Product ${item.productId} is invalid`, 400);
      }

      if (prod.isArchived) {
        return sendError(res, `Cannot add archived product '${prod.name}' to a new order`, 400);
      }

      const quantity = parseInt(item.quantity, 10);
      if (isNaN(quantity) || quantity < 1) {
        return sendError(res, `Quantity for '${prod.name}' must be at least 1`, 400);
      }

      const subtotalPaise = prod.unitPricePaise * quantity;
      totalAmountPaise += subtotalPaise;

      // Historical immutable line-item snapshot
      orderItems.push({
        productId: prod._id,
        productName: prod.name,
        sku: prod.sku,
        unitPricePaise: prod.unitPricePaise,
        quantity,
        subtotalPaise,
      });
    }

    // 4. Generate unique sequential/random human-readable order number
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${randomSuffix}`;

    // 5. Save order in MongoDB
    const order = await Order.create({
      orderNumber,
      customerId: customer._id,
      items: orderItems,
      totalAmountPaise,
      status: ['paid', 'pending', 'cancelled'].includes(status) ? status : 'pending',
      workspaceId: req.workspaceId,
      createdBy: req.user._id,
    });

    await order.populate('customerId', 'name email company phone');

    return sendSuccess(res, 'Order created successfully with verified snapshots', { order }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Update order status (pending, paid, cancelled)
 * @route  PATCH /api/orders/:id/status
 * @access Private (Admin, Analyst)
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!['pending', 'paid', 'cancelled'].includes(status)) {
      return sendError(
        res,
        "Invalid order status. Allowed values: 'pending', 'paid', 'cancelled'",
        400
      );
    }

    const order = await Order.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    }).populate('customerId', 'name email company');

    if (!order) {
      return sendError(res, 'Order not found in this workspace', 404);
    }

    order.status = status;
    await order.save();

    return sendSuccess(res, `Order status updated to '${status}'`, { order });
  } catch (error) {
    next(error);
  }
};
