const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const Payment = require('../models/Payment');

// POST /api/payments/create-order
// Body: amount (mandatory, in rupees, e.g. 499.50), currency (optional, default INR), items (optional description)
async function createOrder(req, res) {
  try {
    const { amount, currency, items } = req.body;

    if (amount === undefined || amount === null || amount === '' || Number(amount) <= 0) {
      return res.status(400).json({ errorCode: 1, msg: 'amount is required and must be greater than 0.' });
    }

    // Razorpay expects the amount in the smallest currency unit (paise for INR).
    const amountInPaise = Math.round(Number(amount) * 100);

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: currency || 'INR',
      receipt: `rcpt_${Date.now()}`,
    });

    await Payment.create({
      razorpayOrderId: razorpayOrder.id,
      amount: Number(amount),
      currency: razorpayOrder.currency,
      items: items || '',
      status: 'created',
      userId: req.user.id,
      userName: req.user.name,
    });

    res.status(201).json({
      errorCode: 0,
      msg: 'Order created Successfully',
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message || 'Failed to create order.' });
  }
}

// POST /api/payments/verify
// Body: razorpay_order_id, razorpay_payment_id, razorpay_signature (returned by Razorpay Checkout on the client)
async function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        errorCode: 1,
        msg: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
      });
    }

    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return res.status(404).json({ errorCode: 1, msg: 'No matching order found.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      payment.status = 'failed';
      await payment.save();
      return res.status(400).json({ errorCode: 1, msg: 'Payment verification failed. Signature mismatch.' });
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = 'paid';
    await payment.save();

    res.json({
      errorCode: 0,
      msg: 'Payment verified Successfully',
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

// GET /api/payments/status
// Body: { razorpayOrderId }
async function getPaymentStatus(req, res) {
  try {
    const { razorpayOrderId } = req.body;
    if (!razorpayOrderId) {
      return res.status(400).json({ errorCode: 1, msg: 'razorpayOrderId is required.' });
    }

    const payment = await Payment.findOne({ razorpayOrderId });
    if (!payment) {
      return res.status(404).json({ errorCode: 1, msg: 'No matching order found.' });
    }

    res.json({
      errorCode: 0,
      msg: 'Fetched successfully',
      data: payment,
    });
  } catch (err) {
    res.status(500).json({ errorCode: 1, msg: err.message });
  }
}

module.exports = { createOrder, verifyPayment, getPaymentStatus };
