// /controllers/api/abmRoutes.js
const router = require('express').Router();
const { requireInternalUser } = require('../../middleware/auth.middleware');
const { 
  ProspectCompany, 
  IntentSignal, 
  Contact,
  CompanyDomain,
  CustomerCompany,
  LeadRequest,
  User,
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

/**
 * GET /api/abm/lead-requests
 * List lead requests with filters
 */
router.get('/lead-requests', requireInternalUser, async (req, res) => {
  try {
    const {
      status,
      min_score,
      service_needed,
      prospect_company_id,
      limit = 50,
      page = 1,
    } = req.query;

    const where = {};

    if (status) {
      where.routing_status = status;
    }

    if (min_score) {
      where.lead_score = { [Op.gte]: parseInt(min_score, 10) };
    }

    if (service_needed) {
      where.service_needed = service_needed;
    }

    if (prospect_company_id) {
      where.prospect_company_id = prospect_company_id;
    }

    const pageSize = Math.min(parseInt(limit, 10) || 50, 200);
    const offset = (parseInt(page, 10) - 1) * pageSize;

    const { rows, count } = await LeadRequest.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset,
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          attributes: ['id', 'name', 'domain', 'intent_score', 'stage'],
        },
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'email', 'title', 'status'],
        },
      ],
    });

    res.json({
      items: rows,
      total: count,
      page: parseInt(page, 10),
      pageSize,
    });
  } catch (err) {
    console.error('Error fetching lead requests:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/lead-requests/:id
 * Detail view for a single lead request
 */
router.get('/lead-requests/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;

    const leadRequest = await LeadRequest.findByPk(id, {
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          attributes: ['id', 'name', 'domain', 'intent_score', 'stage'],
        },
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'email', 'title', 'status'],
        },
      ],
    });

    if (!leadRequest) {
      return res.status(404).json({ message: 'Lead request not found' });
    }

    res.json(leadRequest);
  } catch (err) {
    console.error('Error fetching lead request detail:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/abm/lead-requests/:id
 * Update workflow state for a lead request
 */
router.patch('/lead-requests/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      routing_status,
      routed_to_user_id,
      internal_notes,
      tags,
      disposition_reason,
    } = req.body;

    const leadRequest = await LeadRequest.findByPk(id);

    if (!leadRequest) {
      return res.status(404).json({ message: 'Lead request not found' });
    }

    const allowedStatuses = ['new', 'routed', 'contacted', 'closed_won', 'closed_lost'];

    if (routing_status) {
      if (!allowedStatuses.includes(routing_status)) {
        return res.status(400).json({
          message: `Invalid routing_status. Allowed: ${allowedStatuses.join(', ')}`,
        });
      }
      leadRequest.routing_status = routing_status;
    }

    if (typeof internal_notes === 'string') {
      leadRequest.internal_notes = internal_notes;
    }

    if (typeof disposition_reason === 'string') {
      leadRequest.disposition_reason = disposition_reason;
    }

    if (Array.isArray(tags)) {
      leadRequest.tags_json = tags;
    }

    if (routed_to_user_id) {
      const assignee = await User.findByPk(routed_to_user_id);
      if (!assignee) {
        return res.status(400).json({ message: 'routed_to_user_id does not reference a user' });
      }
      // Internal user only (no customer_company_id)
      if (assignee.customer_company_id) {
        return res.status(400).json({
          message: 'routed_to_user_id must reference an internal user (no customer_company_id)',
        });
      }

      leadRequest.routed_to_user_id = routed_to_user_id;
    }

    await leadRequest.save();

    res.json({ ok: true, lead_request_id: leadRequest.id });
  } catch (err) {
    console.error('Error updating lead request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/lead-requests/:id/convert
 * Convert a lead's prospect company into a customer tenant and optionally create a customer user
 */
router.post('/lead-requests/:id/convert', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customer_company_id,
      name,
      plan_tier,
      create_customer_user,
      customer_user_role,
    } = req.body;

    const leadRequest = await LeadRequest.findByPk(id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany' },
        { model: Contact, as: 'contact' },
      ],
    });

    if (!leadRequest) {
      return res.status(404).json({ message: 'Lead request not found' });
    }

    const prospectCompanyId = leadRequest.prospect_company_id;

    if (!prospectCompanyId) {
      return res
        .status(400)
        .json({ message: 'Lead request is not linked to a prospect company' });
    }

    const prospect = await ProspectCompany.findByPk(prospectCompanyId);
    if (!prospect) {
      return res.status(404).json({ message: 'Prospect company not found' });
    }

    let customerCompany;

    if (customer_company_id) {
      customerCompany = await CustomerCompany.findByPk(customer_company_id);
      if (!customerCompany) {
        return res.status(404).json({ message: 'Customer company not found' });
      }
    } else {
      const companyName =
        name || leadRequest.organization_name || prospect.name || prospect.domain;

      customerCompany = await CustomerCompany.create({
        name: companyName,
        plan_tier: plan_tier || 'trial',
        status: 'trial',
      });
    }

    // Update prospect to point to new customer
    prospect.stage = 'customer';
    prospect.customer_company_id = customerCompany.id;
    await prospect.save();

    let customerUser = null;

    if (create_customer_user) {
      const role = customer_user_role || 'customer_admin';
      const validRoles = ['customer_admin', 'customer_member'];
      if (!validRoles.includes(role)) {
        return res
          .status(400)
          .json({ message: `Invalid customer_user_role. Allowed: ${validRoles.join(', ')}` });
      }

      const email = leadRequest.work_email || leadRequest.contact?.email || null;
      const phone = leadRequest.phone || null;

      customerUser = await User.create({
        name: leadRequest.organization_name || null,
        email,
        phone,
        role,
        customer_company_id: customerCompany.id,
        status: 'active',
      });
    }

    // Mark lead as routed/closed_won by default if converting
    leadRequest.routing_status = leadRequest.routing_status === 'closed_won'
      ? 'closed_won'
      : 'routed';
    await leadRequest.save();

    res.json({
      message: 'Lead converted to customer',
      customer_company: customerCompany,
      prospect,
      customer_user: customerUser,
    });
  } catch (err) {
    console.error('Error converting lead request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/lead-requests/summary
 * Aggregate counters for dashboards
 */
router.get('/lead-requests/summary', requireInternalUser, async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Counts by routing_status
    const statusCountsRaw = await LeadRequest.findAll({
      attributes: ['routing_status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['routing_status'],
      raw: true,
    });
    const byStatus = {};
    statusCountsRaw.forEach((row) => {
      byStatus[row.routing_status] = Number(row.count);
    });

    // Counts by service_needed
    const serviceCountsRaw = await LeadRequest.findAll({
      attributes: ['service_needed', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['service_needed'],
      raw: true,
    });
    const byService = {};
    serviceCountsRaw.forEach((row) => {
      byService[row.service_needed] = Number(row.count);
    });

    // Score buckets
    const bucket0to49 = await LeadRequest.count({
      where: { lead_score: { [Op.between]: [0, 49] } },
    });
    const bucket50to99 = await LeadRequest.count({
      where: { lead_score: { [Op.between]: [50, 99] } },
    });
    const bucket100plus = await LeadRequest.count({
      where: { lead_score: { [Op.gte]: 100 } },
    });

    // New leads
    const new24h = await LeadRequest.count({
      where: { created_at: { [Op.gte]: last24h } },
    });
    const new7d = await LeadRequest.count({
      where: { created_at: { [Op.gte]: last7d } },
    });

    res.json({
      by_status: byStatus,
      by_service: byService,
      score_buckets: {
        '0-49': bucket0to49,
        '50-99': bucket50to99,
        '100+': bucket100plus,
      },
      new_leads: {
        last_24h: new24h,
        last_7d: new7d,
      },
    });
  } catch (err) {
    console.error('Error fetching lead request summary:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/lead-requests/:id/timeline
 * Context timeline around a lead: signals + recent requests
 */
router.get('/lead-requests/:id/timeline', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;

    const leadRequest = await LeadRequest.findByPk(id, {
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          attributes: ['id', 'name', 'domain', 'intent_score', 'stage'],
        },
        {
          model: Contact,
          as: 'contact',
          attributes: ['id', 'email', 'title', 'status'],
        },
      ],
    });

    if (!leadRequest) {
      return res.status(404).json({ message: 'Lead request not found' });
    }

    const prospectCompanyId = leadRequest.prospect_company_id;
    const contactId = leadRequest.contact_id;

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let intentSignals = [];
    let recentLeadRequests = [];

    if (prospectCompanyId) {
      intentSignals = await IntentSignal.findAll({
        where: {
          prospect_company_id: prospectCompanyId,
          occurred_at: { [Op.gte]: cutoff },
        },
        order: [['occurred_at', 'DESC']],
        limit: 100,
      });

      recentLeadRequests = await LeadRequest.findAll({
        where: {
          prospect_company_id: prospectCompanyId,
          id: { [Op.ne]: id },
        },
        order: [['created_at', 'DESC']],
        limit: 10,
      });
    }

    res.json({
      lead_request: leadRequest,
      intent_signals: intentSignals,
      recent_lead_requests: recentLeadRequests,
    });
  } catch (err) {
    console.error('Error fetching lead request timeline:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
