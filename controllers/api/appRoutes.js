// /controllers/api/appRoutes.js
const router = require('express').Router();
const { requireCustomerUser } = require('../../middleware/auth.middleware');
const { User, CustomerCompany } = require('../../models');

/**
 * GET /api/app/me
 * Get current customer user's profile
 * Strict Rule: All queries MUST filter by req.tenant_id
 */
router.get('/me', requireCustomerUser, async (req, res) => {
  try {
    // req.tenant_id is injected by requireCustomerUser middleware
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash'] },
      include: [
        {
          model: CustomerCompany,
          as: 'customerCompany',
          where: { id: req.tenant_id },
          attributes: ['id', 'name', 'plan_tier', 'status'],
        },
      ],
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/app/billing
 * Get subscription/billing information for the customer company
 * Strict Rule: MUST filter by req.tenant_id
 */
router.get('/billing', requireCustomerUser, async (req, res) => {
  try {
    const customerCompany = await CustomerCompany.findByPk(req.tenant_id, {
      attributes: ['id', 'name', 'plan_tier', 'status', 'stripe_customer_id', 'created_at'],
    });

    if (!customerCompany) {
      return res.status(404).json({ message: 'Customer company not found' });
    }

    // In a real implementation, you'd fetch more billing details from Stripe
    res.json({
      company: customerCompany,
      // Add more billing details here (subscription status, invoices, etc.)
    });
  } catch (err) {
    console.error('Error fetching billing info:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
