// /controllers/api/abmRoutes.js
const router = require('express').Router();
const { requireInternalUser } = require('../../middleware/auth.middleware');
const { 
  ProspectCompany, 
  IntentSignal, 
  Contact,
  CompanyDomain,
  CustomerCompany 
} = require('../../models');
const { Op } = require('sequelize');
const { updateIntentScore } = require('../../services/scoring.service');

/**
 * GET /api/abm/companies
 * List all prospect companies, sorted by intent_score (descending)
 */
router.get('/companies', requireInternalUser, async (req, res) => {
  try {
    const { 
      stage, 
      owner_id, 
      limit = 50, 
      offset = 0,
      search 
    } = req.query;

    const where = {};
    
    if (stage) {
      where.stage = stage;
    }
    
    if (owner_id) {
      where.owner_user_id = owner_id;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { domain: { [Op.like]: `%${search}%` } },
      ];
    }

    const companies = await ProspectCompany.findAll({
      where,
      order: [['intent_score', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: Contact,
          as: 'contacts',
          attributes: ['id', 'email', 'first_name', 'last_name', 'title', 'status'],
        },
        {
          model: CompanyDomain,
          as: 'domains',
          attributes: ['id', 'domain', 'is_primary'],
        },
      ],
    });

    res.json(companies);
  } catch (err) {
    console.error('Error fetching companies:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/companies/:id
 * Get detailed view of a prospect company with aggregated signals
 */
router.get('/companies/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;

    const company = await ProspectCompany.findByPk(id, {
      include: [
        {
          model: Contact,
          as: 'contacts',
          attributes: ['id', 'email', 'first_name', 'last_name', 'title', 'status'],
        },
        {
          model: CompanyDomain,
          as: 'domains',
          attributes: ['id', 'domain', 'is_primary'],
        },
        {
          model: IntentSignal,
          as: 'intentSignals',
          order: [['occurred_at', 'DESC']],
          limit: 50,
          attributes: ['id', 'signal_type', 'service_lane', 'topic', 'weight', 'occurred_at'],
        },
      ],
    });

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Aggregate signal statistics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSignals = await IntentSignal.findAll({
      where: {
        prospect_company_id: id,
        occurred_at: { [Op.gte]: thirtyDaysAgo },
      },
      attributes: ['signal_type', 'service_lane', 'weight'],
    });

    const signalStats = {
      total_recent_signals: recentSignals.length,
      total_weight: recentSignals.reduce((sum, s) => sum + (s.weight || 0), 0),
      by_type: {},
      by_service_lane: {},
    };

    recentSignals.forEach(signal => {
      signalStats.by_type[signal.signal_type] = 
        (signalStats.by_type[signal.signal_type] || 0) + 1;
      
      if (signal.service_lane) {
        signalStats.by_service_lane[signal.service_lane] = 
          (signalStats.by_service_lane[signal.service_lane] || 0) + 1;
      }
    });

    res.json({
      ...company.toJSON(),
      signal_stats: signalStats,
    });
  } catch (err) {
    console.error('Error fetching company details:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/companies/:id/convert
 * Convert a ProspectCompany to a CustomerCompany
 */
router.post('/companies/:id/convert', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_company_id, name, plan_tier } = req.body;

    const prospect = await ProspectCompany.findByPk(id);
    if (!prospect) {
      return res.status(404).json({ message: 'Prospect company not found' });
    }

    let customerCompany;

    if (customer_company_id) {
      // Use existing customer company
      customerCompany = await CustomerCompany.findByPk(customer_company_id);
      if (!customerCompany) {
        return res.status(404).json({ message: 'Customer company not found' });
      }
    } else {
      // Create new customer company
      if (!name) {
        return res.status(400).json({ message: 'Name is required to create customer company' });
      }

      customerCompany = await CustomerCompany.create({
        name: name || prospect.name,
        plan_tier: plan_tier || 'trial',
        status: 'trial',
      });
    }

    // Update prospect
    prospect.stage = 'customer';
    prospect.customer_company_id = customerCompany.id;
    await prospect.save();

    res.json({
      message: 'Prospect converted to customer',
      prospect: prospect,
      customer_company: customerCompany,
    });
  } catch (err) {
    console.error('Error converting prospect:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/signals/feed
 * Global feed of intent signals across all prospect companies
 */
router.get('/signals/feed', requireInternalUser, async (req, res) => {
  try {
    const { 
      limit = 100, 
      offset = 0,
      signal_type,
      service_lane,
      prospect_company_id 
    } = req.query;

    const where = {};

    if (signal_type) {
      where.signal_type = signal_type;
    }

    if (service_lane) {
      where.service_lane = service_lane;
    }

    if (prospect_company_id) {
      where.prospect_company_id = prospect_company_id;
    }

    const signals = await IntentSignal.findAll({
      where,
      order: [['occurred_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          attributes: ['id', 'name', 'domain', 'intent_score', 'stage'],
        },
      ],
    });

    res.json(signals);
  } catch (err) {
    console.error('Error fetching signal feed:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
