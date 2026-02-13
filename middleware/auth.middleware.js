// /middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Base authentication middleware - verifies JWT and loads user
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401); // Unauthorized
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET);

    // Load full user from database
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password_hash'] },
    });

    if (!user) {
      return res.sendStatus(403); // Forbidden - user not found
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expired',
        code: 'TOKEN_EXPIRED',
        expiredAt: err.expiredAt,
      });
    }
    console.error('Token verification failed:', err);
    return res.sendStatus(403); // Forbidden
  }
};

/**
 * Require Internal User - user must have customer_company_id IS NULL
 */
const requireInternalUser = async (req, res, next) => {
  await authenticateToken(req, res, () => {
    if (req.user.customer_company_id !== null) {
      return res.status(403).json({ 
        message: 'Access denied. Internal users only.' 
      });
    }
    next();
  });
};

/**
 * Require Internal Admin (Super User) - user must be internal + role === 'internal_admin'
 */
const requireInternalAdmin = async (req, res, next) => {
  await requireInternalUser(req, res, () => {
    if (req.user.role !== 'internal_admin') {
      return res.status(403).json({ 
        message: 'Access denied. Admin only.' 
      });
    }
    next();
  });
};

/**
 * Require Customer User - user must have customer_company_id IS NOT NULL
 * Also injects req.tenant_id for tenant scoping
 */
const requireCustomerUser = async (req, res, next) => {
  await authenticateToken(req, res, () => {
    if (req.user.customer_company_id === null) {
      return res.status(403).json({ 
        message: 'Access denied. Customer users only.' 
      });
    }
    // Inject tenant_id for all customer routes
    req.tenant_id = req.user.customer_company_id;
    next();
  });
};

module.exports = {
  authenticateToken,
  requireInternalUser,
  requireInternalAdmin,
  requireCustomerUser,
};
