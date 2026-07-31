const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const BlacklistedToken = require('../models/BlacklistedToken');
const { resolveHierarchyId } = require('../utils/hierarchy');
const { sendVerificationEmail } = require('../utils/mailer');

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, parentId: user.parentId, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

// POST /api/auth/signup
// Body: { role, parentId (required for stockist/retailer), name, password, confirmPassword, mobileNumber, email }
async function signup(req, res) {
  try {
    const { role, parentId, name, password, confirmPassword, mobileNumber, email } = req.body;

    if (!role || !['admin', 'mainagent', 'stockist', 'retailer'].includes(role)) {
      return res.status(400).json({
        errorCode: 1,
        msg: 'role is required and must be one of admin, mainagent, stockist, retailer.',
      });
    }

    const missing = [];
    if (!name) missing.push('name');
    if (!password) missing.push('password');
    if (!confirmPassword) missing.push('confirmPassword');
    if (!mobileNumber) missing.push('mobileNumber');
    if (!email) missing.push('email');

    if (missing.length > 0) {
      return res.status(400).json({
        errorCode: 1,
        msg: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required.`,
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        errorCode: 1,
        msg: 'Password and confirm password do not match.',
      });
    }

    const existing = await User.findOne({ $or: [{ name }, { email }] });
    if (existing) {
      return res.status(409).json({
        errorCode: 1,
        msg: existing.name === name ? 'Name is already exists' : 'Email is already exists',
      });
    }

    let hierarchy;
    try {
      hierarchy = await resolveHierarchyId(role, parentId);
    } catch (hierarchyErr) {
      return res.status(400).json({ errorCode: 1, msg: hierarchyErr.message });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    const user = await User.create({
      id: hierarchy.id,
      role,
      parentId: hierarchy.parentId,
      name,
      password,
      mobileNumber,
      email,
      isVerified: false,
      verificationToken,
      verificationTokenExpires,
    });

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const verifyLink = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

    // Always print this so you can verify locally even without SMTP configured.
    console.log(`\n[Verification link for ${user.name}]: ${verifyLink}\n`);

    try {
      await sendVerificationEmail(user.email, user.name, verificationToken);
    } catch (mailErr) {
      console.error('Failed to send verification email:', mailErr.message);
      // The account is created either way; the link above is printed to the
      // console as a fallback so testing isn't blocked by email delivery issues.
      return res.status(201).json({
        errorCode: 0,
        msg: 'User registered Successfully, but the verification email failed to send. Check the server console for the verification link, or use /resend-verification once SMTP is configured.',
        data: { id: hierarchy.id, role, parentId: hierarchy.parentId },
      });
    }

    res.status(201).json({
      errorCode: 0,
      msg: 'User registered Successfully. Please check your email to verify your account.',
      data: { id: hierarchy.id, role, parentId: hierarchy.parentId },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ errorCode: 1, msg: 'Name or email is already exists' });
    }
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

// GET /api/auth/verify-email?token=...
async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ errorCode: 1, msg: 'token is required.' });
    }

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ errorCode: 1, msg: 'Invalid or already-used verification link.' });
    }

    if (!user.verificationTokenExpires || user.verificationTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ errorCode: 1, msg: 'Verification link has expired. Please request a new one.' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    res.json({
      errorCode: 0,
      msg: 'Email verified Successfully. You can now sign in.',
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

// POST /api/auth/resend-verification
// Body: { name }
async function resendVerification(req, res) {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ errorCode: 1, msg: 'name is required.' });
    }

    const user = await User.findOne({ name });
    if (!user) {
      return res.status(404).json({ errorCode: 1, msg: 'User not found.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ errorCode: 1, msg: 'This account is already verified.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await user.save();

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const verifyLink = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;
    console.log(`\n[Verification link for ${user.name}]: ${verifyLink}\n`);

    await sendVerificationEmail(user.email, user.name, verificationToken);

    res.json({
      errorCode: 0,
      msg: 'Verification email sent Successfully.',
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

// POST /api/auth/signin
// Body: { name, password }
async function signin(req, res) {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({
        errorCode: 1,
        msg: 'name and password are required.',
      });
    }

    const user = await User.findOne({ name });
    if (!user) {
      return res.status(401).json({ errorCode: 1, msg: 'Invalid name or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ errorCode: 1, msg: 'Invalid name or password.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        errorCode: 8,
        msg: 'Please verify your email before signing in.',
      });
    }

    const authToken = generateToken(user);

    res.json({
      errorCode: 0,
      msg: 'Signed in Successfully',
      authToken,
      id: user.id,
      userName: user.name,
      role: user.role,
      parentId: user.parentId,
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

// POST /api/auth/change-password  (requires authToken header)
// Body: { oldPassword, newPassword, confirmNewPassword }
async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    const missing = [];
    if (!oldPassword) missing.push('oldPassword');
    if (!newPassword) missing.push('newPassword');
    if (!confirmNewPassword) missing.push('confirmNewPassword');

    if (missing.length > 0) {
      return res.status(400).json({
        errorCode: 1,
        msg: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required.`,
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        errorCode: 1,
        msg: 'New password and confirm new password do not match.',
      });
    }

    const user = await User.findOne({ id: req.user.id });
    if (!user) {
      return res.status(404).json({ errorCode: 1, msg: 'User not found.' });
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(401).json({ errorCode: 1, msg: 'Old password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      errorCode: 0,
      msg: 'Password changed Successfully',
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

// POST /api/auth/signout  (requires authToken header)
// Invalidates the current token so it can't be reused even before it expires.
async function signout(req, res) {
  try {
    const decoded = jwt.decode(req.token);
    const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 15 * 60 * 1000);

    await BlacklistedToken.create({ token: req.token, expiresAt });

    res.json({
      errorCode: 0,
      msg: 'Signed out Successfully',
    });
  } catch (err) {
    res.status(400).json({ errorCode: 1, msg: err.message });
  }
}

module.exports = { signup, signin, changePassword, signout, verifyEmail, resendVerification };
