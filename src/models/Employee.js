const mongoose = require('mongoose');
const { formatIST } = require('../utils/dateFormat');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const employeeSchema = new mongoose.Schema(
  {
    id: {
      type: String,
    },
    role: {
      type: String,
      required: [true, 'role is required.'],
      enum: {
        values: ['admin', 'mainagent', 'stockist', 'retailer'],
        message: 'role must be one of admin, mainagent, stockist, retailer.',
      },
    },
    // For mainagent: the admin's id. For stockist: the mainagent's id.
    // For retailer: the stockist's id. null for admin.
    parentId: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      required: [true, 'name is required.'],
      trim: true,
      unique: true,
    },
    dName: {
      type: String,
      required: [true, 'dName is required.'],
      trim: true,
    },
    designation: {
      type: String,
      required: [true, 'designation is required.'],
      trim: true,
    },
    mobileNo: {
      type: String,
      required: [true, 'mobileNo is required.'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'email is required.'],
      trim: true,
      lowercase: true,
      match: [EMAIL_REGEX, 'email must be a valid email address.'],
    },
    address: {
      type: String,
      required: [true, 'address is required.'],
      trim: true,
    },
    dateOfJoin: {
      type: Date,
      required: [true, 'dateOfJoin is required.'],
    },
    yearsOfExperience: {
      type: Number,
      required: [true, 'yearsOfExperience is required.'],
      min: [0, 'yearsOfExperience cannot be negative.'],
    },
    active: {
      type: Number,
      enum: {
        values: [0, 1],
        message: 'active must be 0 (inactive) or 1 (active).',
      },
      default: 1,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        ret.createdAt = formatIST(ret.createdAt);
        ret.updatedAt = formatIST(ret.updatedAt);
        ret.dateOfJoin = formatIST(ret.dateOfJoin);
        return ret;
      },
    },
  }
);

// id is only guaranteed unique within its parent scope (e.g. two different
// mainagents can each have a stockist "st1"), so the real uniqueness
// guarantee is the combination of id + parentId.
employeeSchema.index({ id: 1, parentId: 1 }, { unique: true });

module.exports = mongoose.model('Employee', employeeSchema);
