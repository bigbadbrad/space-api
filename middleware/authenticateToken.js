// middleware/authenticateToken.js
// Legacy middleware - use auth.middleware.js for new code
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401); // Unauthorized
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET);
    
    // Load full user from database for backward compatibility
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password_hash'] },
    });

    if (!user) {
      return res.sendStatus(403); // Forbidden - user not found
    }

    req.user = user;
    console.log('Authenticated User ID:', req.user.id);
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.sendStatus(403); // Forbidden
  }
};

module.exports = authenticateToken;
