const mongoose = require('mongoose');
const { formatIST } = require('../utils/dateFormat');

const paymentSchema = new mongoose.Schema(
  {
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'amount must be greater than 0.'],
    },
    currency: {
      type: String,
      default: 'INR',
    },
    // Optional free-text description of what's being paid for
    // (e.g. product names/quantities), for record-keeping.
    items: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
    },
    // Who initiated the payment (retailer/stockist), taken from the authToken.
    userId: {
      type: String,
      required: true,
    },
    userName: {
      type: String,
      required: true,
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

module.exports = mongoose.model('Payment', paymentSchema);
