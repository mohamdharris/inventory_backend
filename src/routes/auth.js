const express = require('express');
const router = express.Router();
const { signup, signin, changePassword, signout, verifyEmail, resendVerification } = require('../controllers/authController');
const requireAuth = require('../middleware/auth');

router.post('/signup', signup);
router.post('/signin', signin);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/change-password', requireAuth, changePassword);
router.post('/signout', requireAuth, signout);

module.exports = router;
