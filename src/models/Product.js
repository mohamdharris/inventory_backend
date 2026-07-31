const mongoose = require('mongoose');
const { getNextSequence } = require('./Counter');
const { formatIST } = require('../utils/dateFormat');

const productSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
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
    shortName: {
      type: String,
      required: [true, 'shortName is required.'],
      trim: true,
    },
    qty: {
      type: Number,
      required: [true, 'qty is required.'],
      min: [0, 'qty cannot be negative.'],
    },
    stockQty: {
      type: Number,
      required: [true, 'stockQty is required.'],
      min: [0, 'stockQty cannot be negative.'],
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
        return ret;
      },
    },
  }
);

// Auto-assign the next sequential id (1, 2, 3, ...) before saving a new product
productSchema.pre('save', async function (next) {
  if (this.isNew && this.id === undefined) {
    this.id = await getNextSequence('productId');
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
