const jwt = require('jsonwebtoken');
const BlacklistedToken = require('../models/BlacklistedToken');

// Expects the token in the "authToken" header, e.g. authToken: <token>
// Also accepts standard "Authorization: Bearer <token>" for convenience.
async function requireAuth(req, res, next) {
  let token = req.headers.authtoken;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ errorCode: 1, msg: 'Unauthorized. authToken is missing.' });
  }

  try {
    const wasSignedOut = await BlacklistedToken.findOne({ token });
    if (wasSignedOut) {
      return res.status(403).json({ errorCode: 403, msg: 'Session is expired' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        // Covers both expired tokens and invalid/tampered tokens
        return res.status(403).json({ errorCode: 403, msg: 'Session is expired' });
      }
      req.user = decoded;
      req.token = token;
      next();
    });
  } catch (err) {
    res.status(500).json({ errorCode: 1, msg: 'Authentication check failed.' });
  }
}

module.exports = requireAuth;
