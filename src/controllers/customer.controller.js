import { Customer } from '../models/index.js';
import { sendSuccess, sendError } from '../utils/apiResponse.js';
import { escapeRegex } from '../utils/regex.js';

/**
 * @desc   List workspace customers with search, filter, sort, and pagination
 * @route  GET /api/customers
 * @access Private (Admin, Analyst, Viewer)
 */
export const getCustomers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = 'active',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build workspace-isolated query filter
    const filter = {
      workspaceId: req.workspaceId,
    };

    // Filter by archive status
    if (status === 'active') {
      filter.isArchived = false;
    } else if (status === 'archived') {
      filter.isArchived = true;
    }
    // if 'all', do not filter by isArchived

    // Text search on name, email, company, and phone
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { company: searchRegex },
        { phone: searchRegex },
      ];
    }

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [customers, total] = await Promise.all([
      Customer.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
      Customer.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return sendSuccess(res, 'Customers retrieved successfully', {
      customers,
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
 * @desc   Get single customer by ID
 * @route  GET /api/customers/:id
 * @access Private (Admin, Analyst, Viewer)
 */
export const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    });

    if (!customer) {
      return sendError(res, 'Customer not found in this workspace', 404);
    }

    return sendSuccess(res, 'Customer details retrieved', { customer });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Create new customer
 * @route  POST /api/customers
 * @access Private (Admin, Analyst)
 */
export const createCustomer = async (req, res, next) => {
  try {
    const { name, email, company, phone } = req.body;

    // Check if an active customer with this email already exists in this workspace
    const existingCustomer = await Customer.findOne({
      email: email.toLowerCase(),
      workspaceId: req.workspaceId,
      isArchived: false,
    });

    if (existingCustomer) {
      return sendError(
        res,
        'An active customer with this email address already exists in your workspace',
        400
      );
    }

    const customer = await Customer.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      company: (company || '').trim(),
      phone: (phone || '').trim(),
      workspaceId: req.workspaceId,
      isArchived: false,
    });

    return sendSuccess(res, 'Customer created successfully', { customer }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Update customer profile
 * @route  PATCH /api/customers/:id
 * @access Private (Admin, Analyst)
 */
export const updateCustomer = async (req, res, next) => {
  try {
    const { name, email, company, phone } = req.body;

    const customer = await Customer.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    });

    if (!customer) {
      return sendError(res, 'Customer not found in this workspace', 404);
    }

    // If changing email, check for workspace collision with another customer
    if (email && email.toLowerCase() !== customer.email) {
      const emailCollision = await Customer.findOne({
        email: email.toLowerCase(),
        workspaceId: req.workspaceId,
        _id: { $ne: customer._id },
        isArchived: false,
      });

      if (emailCollision) {
        return sendError(
          res,
          'Another active customer with this email already exists in your workspace',
          400
        );
      }
      customer.email = email.toLowerCase().trim();
    }

    if (name) customer.name = name.trim();
    if (company !== undefined) customer.company = company.trim();
    if (phone !== undefined) customer.phone = phone.trim();

    await customer.save();

    return sendSuccess(res, 'Customer updated successfully', { customer });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Toggle archive state of a customer
 * @route  PATCH /api/customers/:id/archive
 * @access Private (Admin only)
 */
export const toggleArchiveCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    });

    if (!customer) {
      return sendError(res, 'Customer not found in this workspace', 404);
    }

    customer.isArchived = !customer.isArchived;
    await customer.save();

    const action = customer.isArchived ? 'archived' : 'restored';
    return sendSuccess(res, `Customer ${action} successfully`, { customer });
  } catch (error) {
    next(error);
  }
};
