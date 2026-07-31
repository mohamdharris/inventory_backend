const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment, getPaymentStatus } = require('../controllers/paymentController');

router.post('/create-order', createOrder);
router.post('/verify', verifyPayment);
router.get('/status', getPaymentStatus);

module.exports = router;
