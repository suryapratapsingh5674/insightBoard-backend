import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required'],
    },
    // Historical snapshots to preserve data integrity even if the product is later modified or archived
    productName: {
      type: String,
      required: [true, 'Product name snapshot is required'],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, 'Product SKU snapshot is required'],
      trim: true,
    },
    unitPricePaise: {
      type: Number,
      required: [true, 'Unit price snapshot is required'],
      min: [0, 'Unit price cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Unit price must be in integer paise',
      },
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer',
      },
    },
    subtotalPaise: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal cannot be negative'],
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: [true, 'Order must contain at least one item'],
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: 'Order items array cannot be empty',
      },
    },
    totalAmountPaise: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Total amount must be in integer paise',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'paid', 'cancelled'],
        message: 'Order status must be pending, paid, or cancelled',
      },
      default: 'pending',
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator user ID is required'],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for analytics date filtering and status counts
orderSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

// Compound index for customer-specific order history
orderSchema.index({ workspaceId: 1, customerId: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
