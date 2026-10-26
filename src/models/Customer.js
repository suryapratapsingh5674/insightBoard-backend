import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [100, 'Customer name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Customer email is required'],
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },
    company: {
      type: String,
      default: '',
      trim: true,
      maxlength: [120, 'Company name cannot exceed 120 characters'],
    },
    phone: {
      type: String,
      default: '',
      trim: true,
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

// Compound index for active workspace customers ordered by newest
customerSchema.index({ workspaceId: 1, isArchived: 1, createdAt: -1 });

// Compound index for workspace-scoped email lookups
customerSchema.index({ workspaceId: 1, email: 1 });

export const Customer = mongoose.model('Customer', customerSchema);
