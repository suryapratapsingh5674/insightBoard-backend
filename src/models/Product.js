import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [150, 'Product name cannot exceed 150 characters'],
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      trim: true,
      uppercase: true,
      maxlength: [50, 'SKU cannot exceed 50 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      default: 'General',
    },
    // Store money in integer minor units (paise) to prevent floating point inaccuracies
    unitPricePaise: {
      type: Number,
      required: [true, 'Unit price in paise is required'],
      min: [0, 'Unit price cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Unit price in paise must be an integer',
      },
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate SKUs within the same workspace
productSchema.index({ workspaceId: 1, sku: 1 }, { unique: true });

// Compound index for active workspace product catalog queries
productSchema.index({ workspaceId: 1, isArchived: 1, createdAt: -1 });

export const Product = mongoose.model('Product', productSchema);
