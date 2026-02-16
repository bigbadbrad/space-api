// /controllers/api/abmRoutes.js
const router = require('express').Router();
const { requireInternalUser, requireInternalAdmin } = require('../../middleware/auth.middleware');
const {
  ProspectCompany,
  IntentSignal,
  Contact,
  ContactIdentity,
  CompanyDomain,
  CustomerCompany,
  LeadRequest,
  User,
  DailyAccountIntent,
  AccountAiSummary,
  AbmEventRule,
  AbmPromptTemplate,
  AbmOperatorAction,
  Mission,
  MissionActivity,
  AbmMissionTemplate,
  ProcurementProgram,
  ProcurementProgramNote,
  ProgramAccountLink,
  ProgramMissionLink,
  ProgramItem,
  ProgramItemNote,
  ProgramItemAccountLink,
  ProgramItemMissionLink,
} = require('../../models');
const { buildProgramDetailView } = require('../../services/programDetailView.service');
const { buildProgramItemDetailView } = require('../../services/programItemDetailView.service');
const { Op } = require('sequelize');
const sequelize = require('../../config/connection');
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
 * GET /api/abm/activity
 * Activity feed from intent_signals + lead_requests + DailyAccountIntent (fallback when signals sparse)
 * KPIs and trending use both intent_signals and daily_account_intent so Activity shows data after Epic 4 recompute.
 */
router.get('/activity', requireInternalUser, async (req, res) => {
  try {
    const { range = '7d', limit = 200 } = req.query;
    const days = range === '30d' ? 30 : 7;
    const limitNum = Math.min(parseInt(limit) || 200, 500);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoff7d = new Date();
    cutoff7d.setDate(cutoff7d.getDate() - 7);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayDate = new Date().toISOString().slice(0, 10);

    const where = { occurred_at: { [Op.gte]: cutoff } };

    const signals = await IntentSignal.findAll({
      where,
      order: [['occurred_at', 'DESC']],
      limit: limitNum,
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          attributes: ['id', 'name', 'domain'],
          required: true,
        },
      ],
    });

    const leadRequests = await LeadRequest.findAll({
      where: { created_at: { [Op.gte]: cutoff } },
      order: [['created_at', 'DESC']],
      limit: limitNum,
      include: [
        { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: false },
      ],
    });

    const eventsToday = await IntentSignal.count({
      where: { occurred_at: { [Op.gte]: todayStart } },
    });

    const uniqueAccounts7d = await IntentSignal.findAll({
      where: { occurred_at: { [Op.gte]: cutoff7d } },
      attributes: ['prospect_company_id'],
      raw: true,
    });
    let accountsActive7d = new Set(uniqueAccounts7d.map((s) => s.prospect_company_id)).size;

    const leadRequests7d = await LeadRequest.count({
      where: { created_at: { [Op.gte]: cutoff7d } },
    });

    const explodingAccounts7d = await DailyAccountIntent.count({
      where: { date: todayDate, surge_level: 'Exploding' },
    }).catch(() => 0);

    const laneWeights = {};
    const typeWeights = {};
    for (const s of signals) {
      const w = s.weight || 1;
      const lane = s.service_lane || s.topic || 'other';
      const type = s.signal_type || 'unknown';
      laneWeights[lane] = (laneWeights[lane] || 0) + w;
      typeWeights[type] = (typeWeights[type] || 0) + w;
    }

    const signalFeed = signals.map((s) => ({
      id: s.id,
      time: s.occurred_at,
      account_id: s.prospectCompany?.id,
      account_name: s.prospectCompany?.name,
      account_domain: s.prospectCompany?.domain,
      person: null,
      activity_type: s.signal_type,
      lane: s.service_lane || s.topic,
      weight: s.weight,
      link: null,
    }));

    const hasLeadSubmittedSignal = (pcId, createdAt) =>
      signals.some(
        (s) =>
          s.signal_type === 'lead_submitted' &&
          String(s.prospect_company_id) === String(pcId) &&
          Math.abs(new Date(s.occurred_at) - new Date(createdAt)) < 120000
      );
    const lrFeed = leadRequests
      .filter((lr) => !hasLeadSubmittedSignal(lr.prospect_company_id, lr.created_at))
      .map((lr) => ({
        id: `lr-${lr.id}`,
        time: lr.created_at,
        account_id: lr.prospectCompany?.id,
        account_name: lr.prospectCompany?.name || lr.organization_name,
        account_domain: lr.prospectCompany?.domain || lr.organization_website,
        person: null,
        activity_type: 'lead_submitted',
        lane: lr.service_needed || null,
        weight: lr.lead_score || 50,
        link: `/dashboard/lead-requests?id=${lr.id}`,
      }));

    const dateStrings = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dateStrings.push(d.toISOString().slice(0, 10));
    }
    const daiRows = await DailyAccountIntent.findAll({
      where: { date: { [Op.in]: dateStrings } },
      order: [['date', 'DESC']],
      limit: limitNum,
      include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: true }],
    });
    const daiFeed = daiRows.map((dai) => {
      const dateEnd = new Date(dai.date);
      dateEnd.setHours(23, 59, 59, 999);
      return {
        id: `dai-${dai.id}`,
        time: dateEnd,
        account_id: dai.prospectCompany?.id,
        account_name: dai.prospectCompany?.name,
        account_domain: dai.prospectCompany?.domain,
        person: null,
        activity_type: 'intent_computed',
        lane: dai.top_lane || 'other',
        weight: dai.intent_score ?? 0,
        link: dai.prospectCompany?.id ? `/dashboard/accounts/${dai.prospectCompany.id}` : null,
      };
    });
    const cutoff7dStr = cutoff7d.toISOString().slice(0, 10);
    const daiAccountIds7d = new Set();
    for (const d of daiRows) {
      if (String(d.date) >= cutoff7dStr) daiAccountIds7d.add(d.prospect_company_id);
    }
    accountsActive7d = Math.max(accountsActive7d, daiAccountIds7d.size);

    for (const d of daiRows) {
      const lane = d.top_lane || 'other';
      const w = d.intent_score ?? 0;
      laneWeights[lane] = (laneWeights[lane] || 0) + w;
      typeWeights['intent_computed'] = (typeWeights['intent_computed'] || 0) + w;
    }

    const trendingLanes = Object.entries(laneWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, score]) => ({ name, score }));

    const trendingTypes = Object.entries(typeWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, score]) => ({ name, score }));

    const feed = [...signalFeed, ...lrFeed, ...daiFeed]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, limitNum);

    res.json({
      kpis: {
        events_today: eventsToday,
        accounts_active_7d: accountsActive7d,
        lead_requests_7d: leadRequests7d,
        exploding_accounts_7d: explodingAccounts7d,
      },
      feed,
      trending_lanes: trendingLanes,
      trending_types: trendingTypes,
    });
  } catch (err) {
    console.error('Error fetching activity:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/abm/overview
 * Executive summary for ABM home — no filters. Returns KPIs, top 10 hot accounts, top 10 lead requests, hot-over-time.
 * When daily_account_intent has no rows for today, falls back to prospect_companies so Command Center is not empty.
 */
router.get('/overview', requireInternalUser, async (req, res) => {
  try {
    const { chart_range = '7d' } = req.query;
    const dateStr = today();
    const days = chart_range === '30d' ? 30 : 7;

    let allDaiToday = await DailyAccountIntent.findAll({
      where: { date: dateStr },
      include: [{ model: ProspectCompany, as: 'prospectCompany', required: true }],
      order: [['intent_score', 'DESC']],
    });

    if (allDaiToday.length === 0) {
      const prospects = await ProspectCompany.findAll({
        where: { intent_score: { [Op.gt]: 0 } },
        order: [['intent_score', 'DESC']],
        limit: 500,
      });
      allDaiToday = prospects.map((pc) => ({
        intent_stage: pc.intent_stage || (pc.intent_score >= 50 ? 'Hot' : null),
        surge_level: pc.surge_level || 'Normal',
        top_lane: pc.top_lane || 'other',
        intent_score: pc.intent_score,
        key_events_7d_json: null,
        prospectCompany: pc,
        prospect_company_id: pc.id,
      }));
    }

    if (allDaiToday.length === 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const signalScores = await IntentSignal.findAll({
        attributes: ['prospect_company_id', [sequelize.fn('SUM', sequelize.col('weight')), 'score']],
        where: { occurred_at: { [Op.gte]: thirtyDaysAgo } },
        group: ['prospect_company_id'],
        raw: true,
      });
      const pcIds = signalScores.filter((r) => r.prospect_company_id).map((r) => r.prospect_company_id);
      if (pcIds.length > 0) {
        const prospects = await ProspectCompany.findAll({ where: { id: { [Op.in]: pcIds } } });
        const scoreByPc = signalScores.reduce((acc, r) => {
          acc[r.prospect_company_id] = Math.round(Number(r.score) || 0);
          return acc;
        }, {});
        allDaiToday = prospects
          .filter((pc) => (scoreByPc[pc.id] || 0) > 0)
          .map((pc) => {
            const intent_score = scoreByPc[pc.id] || 0;
            return {
              intent_stage: intent_score >= 50 ? 'Hot' : null,
              surge_level: 'Normal',
              top_lane: 'other',
              intent_score,
              key_events_7d_json: null,
              prospectCompany: pc,
              prospect_company_id: pc.id,
            };
          })
          .sort((a, b) => b.intent_score - a.intent_score)
          .slice(0, 500);
      }
    }

    const hotAccounts = allDaiToday.filter((d) => d.intent_stage === 'Hot');
    const surgingAccounts = allDaiToday.filter((d) => ['Surging', 'Exploding'].includes(d.surge_level || ''));
    const topLaneRow = allDaiToday
      .filter((d) => d.top_lane && d.top_lane !== 'other')
      .reduce((acc, d) => {
        const l = d.top_lane;
        acc[l] = (acc[l] || 0) + (d.intent_stage === 'Hot' ? 1 : 0);
        return acc;
      }, {});
    let topLaneEntry = Object.entries(topLaneRow).sort((a, b) => b[1] - a[1])[0];
    let topLane = topLaneEntry ? { lane: topLaneEntry[0], hot_count: topLaneEntry[1] } : null;
    if (!topLane || topLane.lane === 'other') {
      const lrCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentLrs = await LeadRequest.findAll({
        where: { created_at: { [Op.gte]: lrCutoff } },
        attributes: ['service_needed'],
      });
      const laneCount = {};
      for (const lr of recentLrs) {
        const sid = (lr.service_needed || '').trim().toLowerCase();
        const label = SERVICE_ID_TO_LANE[sid] || sid || 'Other';
        laneCount[label] = (laneCount[label] || 0) + 1;
      }
      const lrTop = Object.entries(laneCount).sort((a, b) => b[1] - a[1])[0];
      if (lrTop) topLane = { lane: lrTop[0], hot_count: 0 };
    }

    const recentLeadRequests = await LeadRequest.findAll({
      order: [['created_at', 'DESC']],
      limit: 10,
      include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: false }],
    });
    const newLeadRequestCount = await LeadRequest.count({
      where: { created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });

    const hotAccountsPreview = hotAccounts.slice(0, 10).map((d) => {
      const pc = d.prospectCompany;
      return {
        id: pc?.id,
        name: pc?.name,
        domain: pc?.domain,
        intent_score: d.intent_score,
        surge_level: d.surge_level,
        top_lane: d.top_lane,
      };
    });

    const leadRequestsPreview = recentLeadRequests.map((lr) => ({
      id: lr.id,
      lead_score: lr.lead_score,
      service_needed: lr.service_needed,
      routing_status: lr.routing_status,
      organization_name: lr.organization_name,
      organization_domain: lr.organization_domain,
      created_at: lr.created_at,
      prospectCompany: lr.prospectCompany,
    }));

    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const hotOverTime = await Promise.all(
      dates.map(async (date) => {
        const count = await DailyAccountIntent.count({
          where: { date, intent_stage: 'Hot' },
        });
        return { date, hot_count: count };
      })
    );

    res.json({
      kpis: {
        hot_accounts: hotAccounts.length,
        surging_accounts: surgingAccounts.length,
        new_lead_requests: newLeadRequestCount,
        top_lane: topLane?.lane || null,
        top_lane_hot_count: topLane?.hot_count ?? null,
      },
      hot_accounts_preview: hotAccountsPreview,
      recent_lead_requests: leadRequestsPreview,
      hot_over_time: hotOverTime,
    });
  } catch (err) {
    console.error('Error fetching overview:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/queue
 * Today's Priorities action queue: new leads, newly hot, spiking, outbound, stale.
 */
router.get('/queue', requireInternalUser, async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    const dateStr = today();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateYesterday = yesterday.toISOString().slice(0, 10);
    const days = range === '30d' ? 30 : 7;
    const rangeMs = days * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - rangeMs);
    const staleCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const outboundLrCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const items = [];
    const now = new Date();

    let [daiToday, daiYesterday, leadRequestsRecent, allOperatorActions, missionsDue, missionsStale, missionsNewFromLr] = await Promise.all([
      DailyAccountIntent.findAll({
        where: { date: dateStr },
        include: [{ model: ProspectCompany, as: 'prospectCompany', required: true }],
        order: [['intent_score', 'DESC']],
      }),
      DailyAccountIntent.findAll({
        where: { date: dateYesterday },
        attributes: ['prospect_company_id', 'intent_stage', 'surge_level'],
      }),
      LeadRequest.findAll({
        where: { created_at: { [Op.gte]: cutoff } },
        include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: false }],
        order: [['created_at', 'DESC']],
      }),
      AbmOperatorAction.findAll({
        where: { created_at: { [Op.gte]: staleCutoff } },
        attributes: ['prospect_company_id', 'lead_request_id', 'action_type', 'created_at', 'snooze_until'],
      }),
      Mission.findAll({
        where: {
          stage: { [Op.notIn]: ['won', 'lost', 'on_hold'] },
          next_step_due_at: {
            [Op.gte]: now,
            [Op.lte]: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: false }],
        limit: 20,
      }),
      Mission.findAll({
        where: {
          stage: { [Op.notIn]: ['won', 'lost', 'on_hold'] },
          [Op.or]: [
            { last_activity_at: { [Op.lt]: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
            { last_activity_at: null },
          ],
        },
        include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: false }],
        limit: 20,
      }),
      Mission.findAll({
        where: { source: 'lead_request', created_at: { [Op.gte]: cutoff } },
        include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: false }],
        order: [['created_at', 'DESC']],
        limit: 10,
      }),
    ]);

    if (daiToday.length === 0) {
      const prospects = await ProspectCompany.findAll({
        where: { intent_score: { [Op.gt]: 0 } },
        order: [['intent_score', 'DESC']],
        limit: 500,
      });
      daiToday = prospects.map((pc) => ({
        intent_stage: pc.intent_stage || (pc.intent_score >= 50 ? 'Hot' : null),
        surge_level: pc.surge_level || 'Normal',
        top_lane: pc.top_lane || 'other',
        intent_score: pc.intent_score,
        key_events_7d_json: pc.key_events_7d_json || null,
        prospect_company_id: pc.id,
        prospectCompany: pc,
        updated_at: pc.score_updated_at || pc.updated_at,
        created_at: pc.created_at,
      }));
    }

    if (daiToday.length === 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const signalScores = await IntentSignal.findAll({
        attributes: ['prospect_company_id', [sequelize.fn('SUM', sequelize.col('weight')), 'score']],
        where: { occurred_at: { [Op.gte]: thirtyDaysAgo } },
        group: ['prospect_company_id'],
        raw: true,
      });
      const pcIds = signalScores.filter((r) => r.prospect_company_id).map((r) => r.prospect_company_id);
      if (pcIds.length > 0) {
        const prospects = await ProspectCompany.findAll({ where: { id: { [Op.in]: pcIds } } });
        const scoreByPc = signalScores.reduce((acc, r) => {
          acc[r.prospect_company_id] = Math.round(Number(r.score) || 0);
          return acc;
        }, {});
        daiToday = prospects
          .filter((pc) => (scoreByPc[pc.id] || 0) > 0)
          .map((pc) => {
            const intent_score = scoreByPc[pc.id] || 0;
            return {
              intent_stage: intent_score >= 50 ? 'Hot' : null,
              surge_level: 'Normal',
              top_lane: 'other',
              intent_score,
              key_events_7d_json: null,
              prospect_company_id: pc.id,
              prospectCompany: pc,
              updated_at: pc.score_updated_at || pc.updated_at,
              created_at: pc.created_at,
            };
          })
          .sort((a, b) => b.intent_score - a.intent_score)
          .slice(0, 500);
      }
    }

    const snoozedPcIds = new Set();
    const snoozedLrIds = new Set();
    for (const a of allOperatorActions || []) {
      if (a.action_type === 'snoozed' && a.snooze_until && new Date(a.snooze_until) > now) {
        if (a.prospect_company_id) snoozedPcIds.add(a.prospect_company_id);
        if (a.lead_request_id) snoozedLrIds.add(a.lead_request_id);
      }
    }

    const daiYesterdayByPc = (daiYesterday || []).reduce((acc, d) => {
      acc[d.prospect_company_id] = d;
      return acc;
    }, {});

    const lastActionByPc = (allOperatorActions || []).reduce((acc, a) => {
      if (a.prospect_company_id && (!acc[a.prospect_company_id] || new Date(a.created_at) > new Date(acc[a.prospect_company_id]))) {
        acc[a.prospect_company_id] = a.created_at;
      }
      return acc;
    }, {});

    const prospectIdsWithRecentLr = new Set();
    for (const lr of leadRequestsRecent) {
      if (lr.prospect_company_id) prospectIdsWithRecentLr.add(lr.prospect_company_id);
    }

    const prospectIdsWithLr30d = new Set();
    const lrs30d = await LeadRequest.findAll({
      where: { created_at: { [Op.gte]: outboundLrCutoff } },
      attributes: ['prospect_company_id'],
    });
    for (const lr of lrs30d) {
      if (lr.prospect_company_id) prospectIdsWithLr30d.add(lr.prospect_company_id);
    }

    const formatWhyHot = (keyEvents) => {
      if (!keyEvents || typeof keyEvents !== 'object') return [];
      return Object.entries(keyEvents)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k, v]) =>
          `${v}× ${String(k).replace(/_page_view|cta_click_/g, ' ').replace(/_/g, ' ').trim()}`
        );
    };

    for (const lr of leadRequestsRecent) {
      if (snoozedLrIds.has(lr.id)) continue;
      const sid = (lr.service_needed || '').trim().toLowerCase();
      const lane = SERVICE_ID_TO_LANE[sid] || sid || 'Other';
      items.push({
        type: 'new_lead_request',
        lead_request_id: lr.id,
        prospect_company_id: lr.prospect_company_id,
        org_name: lr.organization_name || lr.organization_domain || lr.prospectCompany?.name || lr.prospectCompany?.domain || '—',
        lane,
        lead_score: lr.lead_score,
        submitted_at: lr.created_at,
      });
    }

    for (const dai of daiToday) {
      if (snoozedPcIds.has(dai.prospect_company_id)) continue;
      const pc = dai.prospectCompany;
      const prev = daiYesterdayByPc[dai.prospect_company_id];
      const wasHot = prev?.intent_stage === 'Hot';
      const wasSpiking = prev && ['Surging', 'Exploding'].includes(prev.surge_level || '');
      const isHot = dai.intent_stage === 'Hot';
      const isSpiking = ['Surging', 'Exploding'].includes(dai.surge_level || '');

      if (isHot && !wasHot) {
        const whyHot = formatWhyHot(dai.key_events_7d_json);
        items.push({
          type: 'newly_hot',
          prospect_company_id: pc?.id,
          name: pc?.name,
          domain: pc?.domain,
          intent_score: dai.intent_score,
          surge_level: dai.surge_level,
          top_lane: dai.top_lane,
          why_hot: whyHot,
          changed_at: dai.updated_at || dai.created_at,
        });
      } else if (isSpiking && !wasSpiking) {
        const whyHot = formatWhyHot(dai.key_events_7d_json);
        items.push({
          type: 'spiking',
          prospect_company_id: pc?.id,
          name: pc?.name,
          domain: pc?.domain,
          intent_score: dai.intent_score,
          surge_level: dai.surge_level,
          top_lane: dai.top_lane,
          why_hot: whyHot,
          changed_at: dai.updated_at || dai.created_at,
        });
      } else if (isHot && !prospectIdsWithLr30d.has(dai.prospect_company_id)) {
        const whyHot = formatWhyHot(dai.key_events_7d_json);
        items.push({
          type: 'outbound',
          prospect_company_id: pc?.id,
          name: pc?.name,
          domain: pc?.domain,
          intent_score: dai.intent_score,
          surge_level: dai.surge_level,
          top_lane: dai.top_lane,
          why_hot: whyHot,
          changed_at: dai.updated_at || dai.created_at,
        });
      } else if (isHot) {
        const lastAt = lastActionByPc[dai.prospect_company_id] ? new Date(lastActionByPc[dai.prospect_company_id]) : null;
        if (!lastAt || lastAt < staleCutoff) {
          const whyHot = formatWhyHot(dai.key_events_7d_json);
          items.push({
            type: 'stale_followup',
            prospect_company_id: pc?.id,
            name: pc?.name,
            domain: pc?.domain,
            intent_score: dai.intent_score,
            surge_level: dai.surge_level,
            top_lane: dai.top_lane,
            why_hot: whyHot,
            last_contacted_at: lastActionByPc[dai.prospect_company_id] || null,
          });
        }
      }
    }

    for (const m of missionsDue || []) {
      items.push({
        type: 'mission_due',
        mission_id: m.id,
        prospect_company_id: m.prospect_company_id,
        org_name: m.prospectCompany?.name || m.prospectCompany?.domain || '—',
        title: m.title,
        lane: m.service_lane,
        lead_score: m.confidence != null ? Math.round((m.confidence || 0) * 100) : null,
        next_step_due_at: m.next_step_due_at,
      });
    }
    for (const m of missionsStale || []) {
      items.push({
        type: 'mission_stale',
        mission_id: m.id,
        prospect_company_id: m.prospect_company_id,
        org_name: m.prospectCompany?.name || m.prospectCompany?.domain || '—',
        title: m.title,
        lane: m.service_lane,
        lead_score: m.confidence != null ? Math.round((m.confidence || 0) * 100) : null,
        last_activity_at: m.last_activity_at,
      });
    }
    for (const m of missionsNewFromLr || []) {
      items.push({
        type: 'mission_new',
        mission_id: m.id,
        prospect_company_id: m.prospect_company_id,
        org_name: m.prospectCompany?.name || m.prospectCompany?.domain || '—',
        title: m.title,
        lane: m.service_lane,
        lead_score: m.confidence != null ? Math.round((m.confidence || 0) * 100) : null,
        created_at: m.created_at,
      });
    }

    res.json({
      generated_at: new Date().toISOString(),
      items,
    });
  } catch (err) {
    console.error('Error fetching queue:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/operator-actions
 * Record operator action (viewed, ai_brief, marked_contacted, snoozed).
 */
router.post('/operator-actions', requireInternalUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });
    const { action_type, prospect_company_id, lead_request_id, note, snooze_until } = req.body;
    if (!action_type || !['viewed', 'ai_brief', 'marked_contacted', 'snoozed'].includes(action_type)) {
      return res.status(400).json({ message: 'Invalid action_type' });
    }
    const action = await AbmOperatorAction.create({
      user_id: userId,
      prospect_company_id: prospect_company_id || null,
      lead_request_id: lead_request_id || null,
      action_type,
      note: note || null,
      snooze_until: snooze_until ? new Date(snooze_until) : null,
    });
    res.status(201).json(action);
  } catch (err) {
    console.error('Error creating operator action:', err);
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

    const allowedStatuses = ['new', 'promoted', 'closed'];

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

    // Mark lead as closed when converting to customer
    leadRequest.routing_status = 'closed';
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

// ---------- Phase 2 Dashboard Endpoints ----------

/**
 * GET /api/abm/accounts
 * Hot Accounts dashboard (Phase 2)
 * When lane is specified: returns accounts with lane_score_7d for that lane, ranked by it.
 */
router.get('/accounts', requireInternalUser, async (req, res) => {
  try {
    const { range = '7d', stage, lane, surge, search, page = 1, limit = 50, show_all } = req.query;
    const date = today();
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const showAll = show_all === 'true' || show_all === '1';

    let daiList;
    let totalCount;

    if (showAll && !lane) {
      const pcWhere = {};
      if (stage) pcWhere.intent_stage = stage;
      if (surge) pcWhere.surge_level = surge;
      if (search) {
        pcWhere[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { domain: { [Op.like]: `%${search}%` } },
        ];
      }
      const { count, rows } = await ProspectCompany.findAndCountAll({
        where: Object.keys(pcWhere).length ? pcWhere : undefined,
        order: [[sequelize.literal('COALESCE(ProspectCompany.intent_score, 0)'), 'DESC']],
        limit: limitNum,
        offset,
        include: [
          {
            model: DailyAccountIntent,
            as: 'dailyAccountIntents',
            required: false,
            where: { date },
            attributes: ['key_events_7d_json', 'unique_people_7d'],
          },
        ],
      });
      const accounts = await Promise.all(
        rows.map(async (pc) => {
          const dai = pc.dailyAccountIntents?.[0];
          const whyHot =
            dai?.key_events_7d_json && typeof dai.key_events_7d_json === 'object'
              ? Object.entries(dai.key_events_7d_json)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([k, v]) =>
                    `${v}× ${String(k).replace(/_page_view|cta_click_/g, ' ').replace(/_/g, ' ').trim()}`
                  )
              : [];
          const latestLr = await LeadRequest.findOne({
            where: { prospect_company_id: pc.id },
            attributes: ['id'],
            order: [['created_at', 'DESC']],
          });
          return {
            id: pc.id,
            name: pc.name,
            domain: pc.domain,
            intent_score: pc.intent_score ?? null,
            intent_stage: pc.intent_stage ?? null,
            surge_level: pc.surge_level ?? 'Normal',
            top_lane: pc.top_lane ?? null,
            last_seen_at: pc.last_seen_at,
            unique_people_7d: dai?.unique_people_7d ?? null,
            why_hot: whyHot,
            latest_lead_request_id: latestLr?.id,
          };
        })
      );
      return res.json({ accounts, total: count, page: pageNum, limit: limitNum });
    }

    if (lane) {
      const allDai = await DailyAccountIntent.findAll({
        where: { date },
        include: [{ model: ProspectCompany, as: 'prospectCompany', required: true }],
      });
      let withLaneScore = allDai
        .filter((d) => {
          const scores = d.lane_scores_7d_json;
          if (!scores || typeof scores !== 'object') return false;
          const score = scores[lane];
          return score != null && Number(score) > 0;
        })
        .map((d) => {
          const pc = d.prospectCompany;
          const laneScore = Number(d.lane_scores_7d_json[lane]) || 0;
          return { dai: d, pc, lane_score_7d: laneScore };
        });

      // Also include accounts from lead_requests with service_needed matching lane
      const laneToServiceId = Object.entries(SERVICE_ID_TO_LANE).reduce((acc, [k, v]) => {
        acc[v] = k;
        return acc;
      }, {});
      const orConditions = [{ service_needed: lane }];
      if (laneToServiceId[lane]) orConditions.push({ service_needed: laneToServiceId[lane] });
      const leadAccounts = await LeadRequest.findAll({
        where: {
          [Op.or]: orConditions,
          prospect_company_id: { [Op.ne]: null },
        },
        include: [{ model: ProspectCompany, as: 'prospectCompany', required: true }],
        order: [['created_at', 'DESC']],
      });
      const seenPc = new Set(withLaneScore.map((x) => x.pc.id));
      for (const lr of leadAccounts) {
        if (!lr.prospectCompany?.id || seenPc.has(lr.prospectCompany.id)) continue;
        seenPc.add(lr.prospectCompany.id);
        const dai = allDai.find((d) => d.prospect_company_id === lr.prospect_company_id);
        withLaneScore.push({
          dai: dai || {},
          pc: lr.prospectCompany,
          lane_score_7d: dai?.lane_scores_7d_json?.[lane] ?? 0,
        });
      }

      if (stage) withLaneScore = withLaneScore.filter((x) => (x.dai?.intent_stage ?? x.pc?.intent_stage) === stage);
      if (surge) withLaneScore = withLaneScore.filter((x) => (x.dai?.surge_level ?? x.pc?.surge_level) === surge);
      if (search) {
        const s = String(search).toLowerCase();
        withLaneScore = withLaneScore.filter(
          (x) =>
            (x.pc.name && x.pc.name.toLowerCase().includes(s)) ||
            (x.pc.domain && x.pc.domain.toLowerCase().includes(s))
        );
      }

      withLaneScore.sort((a, b) => b.lane_score_7d - a.lane_score_7d);
      totalCount = withLaneScore.length;
      const paginated = withLaneScore.slice(offset, offset + limitNum);

      const accounts = await Promise.all(
        paginated.map(async ({ dai, pc, lane_score_7d }) => {
          const whyHot =
            dai?.key_events_7d_json && typeof dai.key_events_7d_json === 'object'
              ? Object.entries(dai.key_events_7d_json)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([k, v]) =>
                    `${v}× ${String(k).replace(/_page_view|cta_click_/g, ' ').replace(/_/g, ' ').trim()}`
                  )
              : [];
          const latestLr = await LeadRequest.findOne({
            where: { prospect_company_id: pc.id },
            attributes: ['id'],
            order: [['created_at', 'DESC']],
          });
          return {
            id: pc.id,
            name: pc.name,
            domain: pc.domain,
            intent_score: dai?.intent_score ?? pc.intent_score,
            intent_stage: dai?.intent_stage ?? pc.intent_stage,
            surge_level: dai?.surge_level ?? pc.surge_level ?? 'Normal',
            top_lane: dai?.top_lane ?? pc.top_lane ?? lane,
            lane_score_7d: lane_score_7d,
            last_seen_at: pc.last_seen_at,
            unique_people_7d: dai?.unique_people_7d,
            why_hot: whyHot,
            latest_lead_request_id: latestLr?.id,
          };
        })
      );

      return res.json({ accounts, total: totalCount, page: pageNum, limit: limitNum });
    }

    const pcWhere = {};
    if (stage) pcWhere.intent_stage = stage;
    if (surge) pcWhere.surge_level = surge;
    if (search) {
      pcWhere[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { domain: { [Op.like]: `%${search}%` } },
      ];
    }

    daiList = await DailyAccountIntent.findAll({
      where: { date },
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          where: Object.keys(pcWhere).length ? pcWhere : undefined,
          required: true,
        },
      ],
      order: [['intent_score', 'DESC']],
      limit: limitNum,
      offset,
    });

    totalCount = await DailyAccountIntent.count({
      where: { date },
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          where: Object.keys(pcWhere).length ? pcWhere : undefined,
          required: true,
        },
      ],
    });

    const accounts = await Promise.all(
      daiList.map(async (dai) => {
        const pc = dai.prospectCompany;
        const whyHot =
          dai.key_events_7d_json && typeof dai.key_events_7d_json === 'object'
            ? Object.entries(dai.key_events_7d_json)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([k, v]) =>
                  `${v}× ${String(k).replace(/_page_view|cta_click_/g, ' ').replace(/_/g, ' ').trim()}`
                )
            : [];
        const latestLr = await LeadRequest.findOne({
          where: { prospect_company_id: pc.id },
          attributes: ['id'],
          order: [['created_at', 'DESC']],
        });
        return {
          id: pc.id,
          name: pc.name,
          domain: pc.domain,
          intent_score: dai.intent_score ?? pc.intent_score,
          intent_stage: dai.intent_stage ?? pc.intent_stage,
          surge_level: dai.surge_level ?? pc.surge_level,
          top_lane: dai.top_lane ?? pc.top_lane,
          last_seen_at: pc.last_seen_at,
          unique_people_7d: dai.unique_people_7d,
          why_hot: whyHot,
          latest_lead_request_id: latestLr?.id,
        };
      })
    );

    res.json({ accounts, total: totalCount, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Error fetching accounts:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/accounts/:id/people
 * People Inside Accounts: 3-tier (Known contacts, Anonymous visitors, Unmatched).
 * Option B: when PostHog not configured, returns only known_contacts; anonymous_visitors and unmatched are empty.
 */
router.get('/accounts/:id/people', requireInternalUser, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const rangeDays = Math.min(30, Math.max(7, parseInt(req.query.range_days, 10) || 7));
    const includeUnmatched = req.query.include_unmatched === 'true' || req.query.include_unmatched === '1';

    const prospect = await ProspectCompany.findByPk(accountId, { attributes: ['id', 'name', 'domain'] });
    if (!prospect) return res.status(404).json({ message: 'Account not found' });

    const accountKey = prospect.domain || prospect.id;

    const contacts = await Contact.findAll({
      where: { prospect_company_id: accountId },
      attributes: ['id', 'email', 'first_name', 'last_name', 'title', 'status'],
      order: [['updated_at', 'DESC']],
    });

    const contactIds = contacts.map((c) => c.id);
    const identities = contactIds.length
      ? await ContactIdentity.findAll({
          where: { contact_id: contactIds, identity_type: 'posthog_distinct_id' },
          attributes: ['contact_id', 'identity_value'],
        })
      : [];
    const distinctIdByContact = new Map(identities.map((i) => [i.contact_id, i.identity_value]));

    const known_contacts = contacts.map((c) => {
      const row = c.toJSON ? c.toJSON() : { ...c.get() };
      row.posthog_distinct_id = distinctIdByContact.get(c.id) ?? null;
      return row;
    });

    const posthogConfigured = !!(
      process.env.POSTHOG_HOST &&
      (process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY)
    );

    let anonymous_visitors = [];
    let unmatched = [];

    if (posthogConfigured) {
      try {
        const rangeMap = { 7: '7d', 30: '30d' };
        const rangeStr = rangeMap[rangeDays] || '7d';
        const { fetchPeopleDebugFromPostHog, fetchEventCountsByDistinctIds } = require('../../utils/posthogPeopleDebug');

        const distinctIds = identities
          .map((i) => (i.get ? i.get('identity_value') : i.identity_value))
          .filter(Boolean);

        if (distinctIds.length > 0) {
          const byId = await fetchEventCountsByDistinctIds(distinctIds, { range: rangeStr, limit: 20 });
          if (byId.length > 0) {
            anonymous_visitors = byId.map((a) => ({
              visitor_id: a.person_id,
              label: a.person_label,
              last_seen_at: a.last_seen_at,
              events_7d: a.events_count ?? 0,
              top_pages_7d: [],
              top_events_7d: [],
              lane_hint: null,
            }));
          } else {
            const { visitorLabel } = require('../../utils/posthogPeopleDebug');
            anonymous_visitors = distinctIds.slice(0, 10).map((did) => ({
              visitor_id: did,
              label: visitorLabel(did),
              last_seen_at: null,
              events_7d: 0,
              top_pages_7d: [],
              top_events_7d: [],
              lane_hint: null,
            }));
          }
        }

        if (anonymous_visitors.length === 0) {
          const { anonymous } = await fetchPeopleDebugFromPostHog({
            range: rangeStr,
            minEvents: 1,
            includeUnmatched: false,
            search: '',
            limit: 200,
            includeIdentified: true,
          });
          const domainNorm = (prospect.domain || '').toLowerCase().replace(/^www\./, '').split('/')[0];
          const matchAccount = (a) => {
            if (a.account_id != null && String(a.account_id) === String(accountId)) return true;
            const d = (a.account_domain || '').toLowerCase().replace(/^www\./, '').split('/')[0];
            return d && domainNorm && d === domainNorm;
          };
          anonymous_visitors = anonymous
            .filter(matchAccount)
            .map((a) => ({
              visitor_id: a.person_id,
              label: a.person_label,
              last_seen_at: a.last_seen_at,
              events_7d: a.events_count ?? 0,
              top_pages_7d: [],
              top_events_7d: [],
              lane_hint: null,
            }));
        }
      } catch (err) {
        console.warn('Account people PostHog fetch failed:', err?.message || err);
      }
    }

    const payload = {
      account: {
        id: prospect.id,
        name: prospect.name,
        domain: prospect.domain,
        account_key: accountKey,
      },
      range_days: rangeDays,
      known_contacts,
      anonymous_visitors,
      unmatched,
      generated_at: new Date().toISOString(),
      posthog_configured: posthogConfigured,
    };

    if (!posthogConfigured) {
      payload.banner = 'PostHog not configured. Anonymous visitors and unmatched are unavailable.';
    }

    return res.json(payload);
  } catch (err) {
    console.error('Error fetching account people:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/accounts/:id/people-activity
 * Contact-centric: one row per contact with all their activity (anonymous + known).
 * Each event includes identity: 'anonymous' | 'known' so the UI can show when they became known.
 * Query: range_days (default 7).
 */
router.get('/accounts/:id/people-activity', requireInternalUser, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const rangeDays = Math.min(30, Math.max(1, parseInt(req.query.range_days, 10) || 7));
    const prospect = await ProspectCompany.findByPk(accountId, { attributes: ['id', 'name', 'domain'] });
    if (!prospect) return res.status(404).json({ message: 'Account not found' });

    const contacts = await Contact.findAll({
      where: { prospect_company_id: accountId },
      attributes: ['id', 'email', 'first_name', 'last_name', 'title'],
    });
    const contactIds = contacts.map((c) => c.id);
    const identities = contactIds.length
      ? await ContactIdentity.findAll({
          where: { contact_id: contactIds, identity_type: 'posthog_distinct_id' },
          attributes: ['contact_id', 'identity_value'],
        })
      : [];

    const identifiedByContactId = new Map(identities.map((i) => [(i.get ? i.get('contact_id') : i.contact_id), (i.get ? i.get('identity_value') : i.identity_value)]));

    const { fetchEventsByDistinctIds, getPersonDistinctIds } = require('../../utils/posthogPeopleDebug');
    const contactByDistinctId = new Map();
    const allDistinctIds = new Set();
    for (const c of contacts) {
      const cid = c.id;
      const identifiedId = identifiedByContactId.get(cid);
      if (!identifiedId) continue;
      const personIds = await getPersonDistinctIds(identifiedId);
      for (const did of personIds) {
        contactByDistinctId.set(String(did), cid);
        allDistinctIds.add(String(did));
      }
    }
    const distinctIds = Array.from(allDistinctIds);

    const payload = {
      range_days: rangeDays,
      people: [],
      posthog_configured: !!(process.env.POSTHOG_HOST && (process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY)),
    };

    const byContactId = {};
    for (const c of contacts) {
      const cid = c.id;
      byContactId[cid] = {
        contact_id: cid,
        email: c.email || null,
        first_name: c.first_name || null,
        last_name: c.last_name || null,
        title: c.title || null,
        identified_distinct_id: identifiedByContactId.get(cid) || null,
        events_count: 0,
        last_seen_at: null,
        events: [],
        event_counts: {},
      };
    }

    const IDENTIFY_BOUNDARY_EVENTS = ['$identify', 'identify', 'lead_request_submitted'];

    if (distinctIds.length > 0) {
      const rangeStr = rangeDays <= 7 ? '7d' : '30d';
      const rawEvents = await fetchEventsByDistinctIds(distinctIds, { range: rangeStr, limit: 500 });

      for (const e of rawEvents) {
        const did = String(e.distinct_id);
        const contactId = contactByDistinctId.get(did);
        if (!contactId || !byContactId[contactId]) continue;
        const rec = byContactId[contactId];
        rec.events_count += 1;
        if (!rec.last_seen_at || new Date(e.timestamp) > new Date(rec.last_seen_at)) {
          rec.last_seen_at = e.timestamp;
        }
        rec.event_counts[e.event] = (rec.event_counts[e.event] || 0) + 1;
        if (rec.events.length < 100) {
          rec.events.push({
            event: e.event,
            event_display: e.event_display ?? e.event,
            timestamp: e.timestamp,
            path: e.path || null,
            identity: 'unknown',
          });
        }
      }

      for (const cid of Object.keys(byContactId)) {
        const rec = byContactId[cid];
        if (rec.events.length === 0) continue;
        const events = rec.events;
        const byTimeAsc = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const boundaryIdx = byTimeAsc.findIndex((ev) => IDENTIFY_BOUNDARY_EVENTS.includes(ev.event));
        const cut = boundaryIdx >= 0 ? boundaryIdx : byTimeAsc.length;
        byTimeAsc.forEach((ev, i) => {
          ev.identity = i < cut ? 'anonymous' : 'known';
        });
        rec.events = byTimeAsc.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
    }

    payload.people = Object.values(byContactId).map((p) => ({
      contact_id: p.contact_id,
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      identified_distinct_id: p.identified_distinct_id,
      events_count: p.events_count,
      last_seen_at: p.last_seen_at,
      events: p.events,
      top_events: Object.entries(p.event_counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => `${name} (${count})`),
    }));

    return res.json(payload);
  } catch (err) {
    console.error('Error fetching account people-activity:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/accounts/:id
 * Account detail (Phase 2) - latest snapshot, timeline, people, AI summary
 */
router.get('/accounts/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const prospect = await ProspectCompany.findByPk(id, {
      include: [
        { model: Contact, as: 'contacts' },
        { model: LeadRequest, as: 'leadRequests', limit: 10, order: [['created_at', 'DESC']] },
        { model: IntentSignal, as: 'intentSignals', limit: 20, order: [['occurred_at', 'DESC']] },
      ],
    });
    if (!prospect) return res.status(404).json({ message: 'Account not found' });

    const latestDai = await DailyAccountIntent.findOne({
      where: { prospect_company_id: id },
      order: [['date', 'DESC']],
    });
    const timeline = await DailyAccountIntent.findAll({
      where: { prospect_company_id: id },
      order: [['date', 'DESC']],
      limit: 30,
    });
    const cachedSummary = await AccountAiSummary.findOne({
      where: { prospect_company_id: id },
      order: [['cache_date', 'DESC']],
    });

    res.json({
      account: prospect,
      latest_snapshot: latestDai,
      lane_breakdown: latestDai?.lane_scores_7d_json || latestDai?.lane_scores_30d_json || {},
      timeline_30d: timeline,
      lead_requests: prospect.leadRequests,
      intent_signals: prospect.intentSignals,
      contacts: prospect.contacts,
      cached_ai_summary: cachedSummary,
    });
  } catch (err) {
    console.error('Error fetching account detail:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Map widget service_needed (id) to lane display label
const SERVICE_ID_TO_LANE = {
  launch: 'Launch',
  insertion_post_launch: 'Last-Mile Insertion (Post-Launch)',
  transfer_on_orbit: 'Orbit Transfer (On-Orbit)',
  refuel: 'Refuel',
  docking: 'Docking',
  upgrade: 'Upgrade',
  disposal: 'Disposal',
  unsure: 'Other',
};

/**
 * GET /api/abm/lanes
 * Service Lane Intent dashboard (Phase 2)
 * Sources: DailyAccountIntent (page-view scoring) + LeadRequest.service_needed (explicit from widget)
 */
router.get('/lanes', requireInternalUser, async (req, res) => {
  try {
    const { range = '7d', lane } = req.query;
    const date = today();

    const byLane = {};

    // 1) From DailyAccountIntent (page-view / intent scoring)
    const allDai = await DailyAccountIntent.findAll({
      where: { date },
      include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] }],
    });
    for (const d of allDai) {
      const l = (d.top_lane || 'other').replace(/^(.)/, (m) => m.toUpperCase());
      if (!byLane[l]) byLane[l] = { hot: 0, surging: 0, exploding: 0, scores: [], accounts: [], seen: new Set() };
      if (d.intent_stage === 'Hot') byLane[l].hot++;
      if (d.surge_level === 'Surging') byLane[l].surging++;
      if (d.surge_level === 'Exploding') byLane[l].exploding++;
      byLane[l].scores.push(d.intent_score || 0);
      if (d.prospectCompany?.id && !byLane[l].seen.has(d.prospectCompany.id)) {
        byLane[l].seen.add(d.prospectCompany.id);
        byLane[l].accounts.push({
          id: d.prospectCompany.id,
          name: d.prospectCompany.name,
          domain: d.prospectCompany.domain,
          intent_score: d.intent_score,
          surge_level: d.surge_level,
          lane_score_7d: d.lane_scores_7d_json?.[l] ?? d.intent_score,
        });
      }
    }

    // 2) From LeadRequest.service_needed (accounts that submitted a lead request with that service)
    const leadLanes = await LeadRequest.findAll({
      where: { prospect_company_id: { [Op.ne]: null } },
      include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: true }],
      order: [['created_at', 'DESC']],
    });
    for (const lr of leadLanes) {
      const sid = (lr.service_needed || '').trim().toLowerCase();
      const l = SERVICE_ID_TO_LANE[sid] || sid || 'Other';
      if (!l) continue;
      if (!byLane[l]) byLane[l] = { hot: 0, surging: 0, exploding: 0, scores: [], accounts: [], seen: new Set() };
      const pc = lr.prospectCompany;
      if (pc?.id && !byLane[l].seen.has(pc.id)) {
        byLane[l].seen.add(pc.id);
        const dai = allDai.find((d) => d.prospect_company_id === pc.id);
        byLane[l].accounts.push({
          id: pc.id,
          name: pc.name,
          domain: pc.domain,
          intent_score: dai?.intent_score ?? pc.intent_score,
          surge_level: dai?.surge_level ?? pc.surge_level ?? 'Normal',
          lane_score_7d: dai?.lane_scores_7d_json?.[l] ?? dai?.intent_score ?? 0,
        });
      }
    }

    // Build response (drop internal seen sets)
    const laneCards = Object.entries(byLane).map(([name, data]) => {
      const { seen, ...rest } = data;
      return {
        lane: name,
        hot_count: rest.hot,
        surging_count: rest.surging,
        exploding_count: rest.exploding,
        avg_intent_score: rest.scores.length
          ? Math.round(rest.scores.reduce((a, b) => a + b, 0) / rest.scores.length)
          : 0,
        accounts: lane ? (name === lane ? rest.accounts : []) : rest.accounts.slice(0, 10),
      };
    });

    res.json({ lanes: laneCards });
  } catch (err) {
    console.error('Error fetching lanes:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/lanes/explainer
 * Lane Explainer: why trending, top content, top lead requests for a lane
 */
router.get('/lanes/explainer', requireInternalUser, async (req, res) => {
  try {
    const { lane, range = '7d' } = req.query;
    if (!lane) return res.status(400).json({ message: 'lane is required' });

    const date = today();
    const allDai = await DailyAccountIntent.findAll({
      where: { date },
      include: [{ model: ProspectCompany, as: 'prospectCompany', required: true }],
    });

    const laneAccounts = allDai.filter((d) => {
      const scores = d.lane_scores_7d_json;
      if (!scores || typeof scores !== 'object') return false;
      const score = scores[lane];
      return score != null && Number(score) > 0;
    });

    const hotCount = laneAccounts.filter((d) => d.intent_stage === 'Hot').length;
    const surgingCount = laneAccounts.filter((d) =>
      ['Surging', 'Exploding'].includes(d.surge_level || '')
    ).length;

    const topContent = {};
    for (const d of laneAccounts) {
      const pages = d.top_pages_7d_json || d.key_events_7d_json;
      if (pages && typeof pages === 'object') {
        for (const [k, v] of Object.entries(pages)) {
          const label = String(k).replace(/_page_view|cta_click_/g, ' ').replace(/_/g, ' ').trim() || k;
          topContent[label] = (topContent[label] || 0) + Number(v || 0);
        }
      }
    }
    const topContentList = Object.entries(topContent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, score]) => ({ name, score }));

    const laneToServiceId = Object.entries(SERVICE_ID_TO_LANE).reduce((acc, [k, v]) => {
      acc[v] = k;
      return acc;
    }, {});
    const lrOr = [{ service_needed: { [Op.like]: `%${String(lane)}%` } }];
    if (laneToServiceId[lane]) lrOr.push({ service_needed: laneToServiceId[lane] });
    const leadRequests = await LeadRequest.findAll({
      where: { [Op.or]: lrOr },
      order: [['created_at', 'DESC']],
      limit: 10,
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          attributes: ['id', 'name', 'domain'],
          required: false,
        },
      ],
    });

    res.json({
      lane,
      why_trending: `${hotCount} hot accounts, ${surgingCount} surging in this lane`,
      hot_count: hotCount,
      surging_count: surgingCount,
      account_count: laneAccounts.length,
      top_content: topContentList,
      top_lead_requests: leadRequests.map((lr) => ({
        id: lr.id,
        lead_score: lr.lead_score,
        service_needed: lr.service_needed,
        organization_name: lr.organization_name,
        organization_domain: lr.organization_domain,
        created_at: lr.created_at,
        prospect_company_id: lr.prospect_company_id,
      })),
    });
  } catch (err) {
    console.error('Error fetching lane explainer:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/people/debug
 * People Debug feed: combined known + anonymous + unmatched for debugging PostHog.
 * Query: range=15m|1h|24h|7d|30d, min_events=1, include_unmatched=false, search=...
 * When PostHog not configured, returns known contacts only in the same row shape.
 */
router.get('/people/debug', requireInternalUser, async (req, res) => {
  try {
    const range = ['15m', '1h', '24h', '7d', '30d'].includes(req.query.range) ? req.query.range : '24h';
    const minEvents = Math.max(1, parseInt(req.query.min_events, 10) || 1);
    const includeUnmatched = req.query.include_unmatched === 'true' || req.query.include_unmatched === '1';
    const search = (req.query.search || '').trim().toLowerCase();
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));

    const rows = [];

    const contacts = await Contact.findAll({
      include: [{ model: ProspectCompany, as: 'prospectCompany', required: true }],
      limit: limit * 2,
    });

    for (const c of contacts) {
      const account = c.prospectCompany;
      if (!account) continue;
      const personLabel = c.first_name || c.last_name ? `${(c.first_name || '').trim()} ${(c.last_name || '').trim()}`.trim() : c.email || '—';
      if (search) {
        const matchAccount = (account.name || '').toLowerCase().includes(search) || (account.domain || '').toLowerCase().includes(search);
        const matchPerson = (c.email || '').toLowerCase().includes(search) || (personLabel || '').toLowerCase().includes(search);
        if (!matchAccount && !matchPerson) continue;
      }
      rows.push({
        type: 'known',
        person_label: c.email || personLabel,
        person_id: c.id,
        account_id: account.id,
        account_name: account.name || account.domain,
        account_domain: account.domain,
        role_title: c.title || null,
        events_count: null,
        last_seen_at: c.last_seen_at || c.updated_at,
      });
      if (rows.length >= limit) break;
    }

    const posthogConfigured = !!(process.env.POSTHOG_HOST && process.env.POSTHOG_PROJECT_API_KEY);
    if (posthogConfigured) {
      try {
        const { fetchPeopleDebugFromPostHog } = require('../../utils/posthogPeopleDebug');
        const { anonymous, unmatched } = await fetchPeopleDebugFromPostHog({ range, minEvents, includeUnmatched, search, limit });
        for (const a of anonymous) {
          if (search && !a.account_domain?.toLowerCase().includes(search) && !a.account_name?.toLowerCase().includes(search) && !(a.person_label || '').toLowerCase().includes(search)) continue;
          rows.push(a);
        }
        if (includeUnmatched) for (const u of unmatched) rows.push(u);
      } catch (err) {
        console.warn('PostHog people debug fetch failed:', err?.message || err);
      }
    }

    const limitedRows = rows.slice(0, limit);

    res.json({
      range,
      min_events: minEvents,
      include_unmatched: includeUnmatched,
      rows: limitedRows,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error fetching people debug:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/people
 * People Inside Accounts dashboard (Phase 2)
 */
router.get('/people', requireInternalUser, async (req, res) => {
  try {
    const { range = '7d', account_id } = req.query;
    const where = {};
    if (account_id) where.prospect_company_id = account_id;

    const contacts = await Contact.findAll({
      where,
      include: [{
        model: ProspectCompany,
        as: 'prospectCompany',
        include: [{
          model: DailyAccountIntent,
          as: 'dailyAccountIntents',
          where: { date: today() },
          required: false,
          attributes: ['top_categories_7d_json'],
        }],
      }],
      limit: 100,
    });

    const people = contacts.map((c) => {
      const dai = c.prospectCompany?.dailyAccountIntents?.[0];
      const topCategories = dai?.top_categories_7d_json
        ? Object.entries(dai.top_categories_7d_json)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([k]) => k)
        : [];
      return {
        id: c.id,
        account_id: c.prospect_company_id ?? c.prospectCompany?.id,
        display: c.first_name || c.last_name ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : c.email || 'Anonymous',
        email: c.email,
        account_name: c.prospectCompany?.name,
        account_domain: c.prospectCompany?.domain,
        role: c.title,
        last_seen_at: c.updated_at,
        top_categories_7d: topCategories,
      };
    });

    res.json({ people });
  } catch (err) {
    console.error('Error fetching people:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/accounts/:id/ai-summary
 * Generate or return cached AI account summary (Phase 2)
 */
const { getOrGenerateSummary } = require('../../services/abmAiSummary.service');
router.post('/accounts/:id/ai-summary', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const forceRegenerate = req.query.force === 'true';
    const result = await getOrGenerateSummary(id, forceRegenerate);
    if (!result) return res.status(404).json({ message: 'Account not found' });
    res.json(result);
  } catch (err) {
    console.error('Error generating AI summary:', err);
    res.status(500).json({ message: err.message || 'Failed to generate summary' });
  }
});

// Missions (ABM Rev 2)
const missionsRoutes = require('./missionsRoutes');
router.use('/missions', missionsRoutes);

/**
 * POST /api/abm/lead-requests/:id/promote
 * Promote lead request to mission
 */
router.post('/lead-requests/:id/promote', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, owner_user_id, priority } = req.body;
    const lr = await LeadRequest.findByPk(id, {
      include: [{ model: ProspectCompany, as: 'prospectCompany' }, { model: Contact, as: 'contact' }],
    });
    if (!lr) return res.status(404).json({ message: 'Lead request not found' });

    const defaultTitle = title || `${lr.service_needed || 'Mission'} — ${lr.organization_name || lr.prospectCompany?.name || 'Unknown'}`;
    const ownerId = owner_user_id || req.user?.id;
    if (!ownerId) return res.status(400).json({ message: 'owner_user_id or current user required' });

    const mission = await Mission.create({
      title: defaultTitle,
      service_lane: lr.service_needed || 'other',
      owner_user_id: ownerId,
      source: 'lead_request',
      prospect_company_id: lr.prospect_company_id,
      primary_contact_id: lr.contact_id,
      lead_request_id: lr.id,
      mission_type: lr.mission_type,
      target_orbit: lr.target_orbit,
      inclination_deg: lr.inclination_deg,
      payload_mass_kg: lr.payload_mass_kg,
      payload_volume: lr.payload_volume,
      earliest_date: lr.earliest_date,
      latest_date: lr.latest_date,
      schedule_urgency: lr.schedule_urgency,
      integration_status: lr.integration_status,
      readiness_confidence: lr.readiness_confidence,
      funding_status: lr.funding_status,
      budget_band: lr.budget_band,
      stage: 'new',
      priority: priority || 'medium',
      confidence: 0.7,
      last_activity_at: new Date(),
    });

    await lr.update({ mission_id: mission.id, routing_status: 'promoted' });
    await MissionActivity.create({
      mission_id: mission.id,
      type: 'linked_lead_request',
      body: 'Promoted from lead request',
      meta_json: { lead_request_id: lr.id },
      created_by_user_id: req.user?.id,
    });
    await MissionActivity.create({
      mission_id: mission.id,
      type: 'note',
      body: 'Procurement brief attached',
      created_by_user_id: req.user?.id,
    });

    const full = await Mission.findByPk(mission.id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
        { model: Contact, as: 'primaryContact', attributes: ['id', 'email', 'first_name', 'last_name', 'title'] },
        { model: LeadRequest, as: 'leadRequest', attributes: ['id', 'organization_name', 'service_needed', 'created_at'] },
      ],
    });

    res.status(201).json({ mission: full, message: 'Promoted to mission' });
  } catch (err) {
    console.error('Error promoting lead request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- Procurement Programs (ABM Rev 3) ----------
const dayjs = require('dayjs');

/**
 * GET /api/abm/programs/summary
 */
router.get('/programs/summary', requireInternalUser, async (req, res) => {
  try {
    const range = req.query.range || '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = dayjs().subtract(days, 'day').toDate();

    const programs = await ProgramItem.findAll({
      where: { posted_at: { [Op.gte]: since } },
      attributes: ['id', 'service_lane', 'status', 'posted_at', 'due_at', 'agency'],
    });

    const countsByLane = {};
    let openCount = 0;
    let dueSoonCount = 0;
    let newPostedCount = 0;
    const agencyCounts = {};

    const now = new Date();
    const dueSoon = dayjs().add(14, 'day').toDate();

    for (const p of programs) {
      const lane = p.service_lane || 'uncategorized';
      countsByLane[lane] = (countsByLane[lane] || 0) + 1;
      if (p.status === 'open') openCount++;
      if (p.due_at && p.due_at <= dueSoon && p.due_at >= now) dueSoonCount++;
      if (p.posted_at && dayjs(p.posted_at).isAfter(dayjs().subtract(7, 'day'))) newPostedCount++;
      if (p.agency) {
        const a = String(p.agency).trim().slice(0, 200);
        agencyCounts[a] = (agencyCounts[a] || 0) + 1;
      }
    }

    const awardedCount = programs.filter((p) => p.status === 'awarded').length;
    const topAgencies = Object.entries(agencyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    res.json({
      counts_by_lane: countsByLane,
      open_count: openCount,
      due_soon_count: dueSoonCount,
      new_posted_count: newPostedCount,
      awarded_count: awardedCount,
      top_agencies: topAgencies,
    });
  } catch (err) {
    console.error('Error fetching programs summary:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/programs
 * Filters: relevant=true|false (default true), lane=..., min_score=35, suppressed=false (default), confidence_min=...
 */
router.get('/programs', requireInternalUser, async (req, res) => {
  try {
    const {
      range = '30d',
      status = 'all',
      lane,
      source: sourceFilter,
      topic,
      agency,
      due,
      search,
      page = 1,
      limit = 50,
      sort = 'posted_desc',
      relevant = 'true',
      min_score,
      suppressed = 'false',
      confidence_min,
    } = req.query;

    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = dayjs().subtract(days, 'day').toDate();
    const where = {
      [Op.and]: [
        { [Op.or]: [{ posted_at: { [Op.gte]: since } }, { posted_at: null }] },
      ],
    };

    if (status && status !== 'all') where[Op.and].push({ status });
    if (lane) where[Op.and].push({ service_lane: lane });
    if (sourceFilter && sourceFilter !== 'all') where[Op.and].push({ source_type: sourceFilter });
    if (topic) where[Op.and].push({ topic });
    if (agency) where[Op.and].push({ agency: { [Op.like]: `%${agency}%` } });

    if (relevant === 'true') {
      where[Op.and].push({ relevance_score: { [Op.gte]: min_score ? parseInt(min_score, 10) : 35 } });
      where[Op.and].push({ suppressed: false });
    } else if (relevant === 'suppressed') {
      where[Op.and].push({ suppressed: true });
    } else {
      if (suppressed === 'false') where[Op.and].push({ suppressed: false });
      if (min_score != null) where[Op.and].push({ relevance_score: { [Op.gte]: parseInt(min_score, 10) } });
    }
    if (confidence_min != null) where[Op.and].push({ match_confidence: { [Op.gte]: parseFloat(confidence_min) } });

    if (due === 'soon') {
      where[Op.and].push({
        due_at: { [Op.and]: [{ [Op.gte]: new Date() }, { [Op.lte]: dayjs().add(14, 'day').toDate() }] },
      });
    }

    if (search) {
      where[Op.and].push({
        [Op.or]: [
          { title: { [Op.like]: `%${search}%` } },
          { agency: { [Op.like]: `%${search}%` } },
          { source_id: { [Op.like]: `%${search}%` } },
        ],
      });
    }

    const order = sort === 'due_asc' ? [['due_at', 'ASC']] : [['posted_at', 'DESC']];
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows, count } = await ProgramItem.findAndCountAll({
      where,
      order,
      limit: parseInt(limit),
      offset,
      attributes: ['id', 'title', 'source_type', 'status', 'posted_at', 'due_at', 'service_lane', 'topic', 'agency', 'links_json', 'source_id', 'relevance_score', 'match_confidence', 'match_reasons_json', 'suppressed', 'suppressed_reason'],
    });

    const ids = rows.map((r) => r.id);
    const accountRows = ids.length ? await ProgramItemAccountLink.findAll({ where: { program_item_id: { [Op.in]: ids } }, attributes: ['program_item_id'], raw: true }) : [];
    const missionRows = ids.length ? await ProgramItemMissionLink.findAll({ where: { program_item_id: { [Op.in]: ids } }, attributes: ['program_item_id'], raw: true }) : [];

    const accMap = {};
    for (const r of accountRows) accMap[r.program_item_id] = (accMap[r.program_item_id] || 0) + 1;
    const misMap = {};
    for (const r of missionRows) misMap[r.program_item_id] = (misMap[r.program_item_id] || 0) + 1;

    const programs = rows.map((r) => {
      const j = r.toJSON();
      j.source = j.source_type;
      j.url = Array.isArray(j.links_json) && j.links_json[0] ? (j.links_json[0].url || j.links_json[0].href) : null;
      j.external_id = j.source_id;
      j.linked_accounts_count = accMap[j.id] || 0;
      j.linked_missions_count = misMap[j.id] || 0;
      const reasons = Array.isArray(j.match_reasons_json) ? j.match_reasons_json : [];
      j.reasons_summary = reasons
        .filter((x) => x.type === 'rule')
        .map((x) => x.label || x.topic)
        .slice(0, 3)
        .join(', ') || null;
      return j;
    });

    res.json({ programs, total: count });
  } catch (err) {
    console.error('Error fetching programs:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/programs/:id
 * Returns full program detail view model (overview, requirements, attachments, contacts, triage, matching)
 */
router.get('/programs/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const program = await ProgramItem.findByPk(id, {
      include: [
        { model: ProgramItemAccountLink, as: 'accountLinks', include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] }] },
        { model: ProgramItemMissionLink, as: 'missionLinks', include: [{ model: Mission, as: 'mission', attributes: ['id', 'title', 'stage', 'service_lane'] }] },
      ],
    });
    if (!program) return res.status(404).json({ message: 'Program not found' });

    const intentSignals = await IntentSignal.findAll({
      where: {
        external_ref_type: { [Op.in]: ['program_item', 'procurement_program'] },
        external_ref_id: id,
      },
      attributes: ['id', 'prospect_company_id', 'occurred_at', 'topic', 'weight', 'source'],
    });

    const notes = await ProgramItemNote.findAll({
      where: { program_item_id: id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'preferred_name', 'email'] }],
      order: [['created_at', 'DESC']],
    });

    let owner = null;
    if (program.owner_user_id) {
      owner = await User.findByPk(program.owner_user_id, { attributes: ['id', 'name', 'preferred_name', 'email'] });
    }

    const out = program.toJSON();
    out.intent_signals = intentSignals;
    out.match_reasons_json = out.match_reasons_json ?? [];
    out.suppression_reason = out.suppressed ? out.suppressed_reason : null;

    const view = buildProgramItemDetailView(out, notes, owner);
    res.json(view);
  } catch (err) {
    console.error('Error fetching program:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/abm/programs/:id
 * Update triage fields: owner_user_id, triage_status, priority, internal_notes
 */
router.patch('/programs/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { owner_user_id, triage_status, priority, internal_notes, suppressed, suppressed_reason } = req.body;

    const program = await ProcurementProgram.findByPk(id);
    if (!program) return res.status(404).json({ message: 'Program not found' });

    const updates = {};
    if (owner_user_id !== undefined) updates.owner_user_id = owner_user_id || null;
    if (triage_status !== undefined) updates.triage_status = triage_status;
    if (priority !== undefined) updates.priority = priority;
    if (internal_notes !== undefined) updates.internal_notes = internal_notes;
    if (suppressed !== undefined) updates.suppressed = suppressed;
    if (suppressed_reason !== undefined) updates.suppressed_reason = suppressed_reason;

    if (Object.keys(updates).length > 0) {
      updates.last_triaged_at = new Date();
      await program.update(updates);
    }

    const full = await ProcurementProgram.findByPk(id, {
      include: [
        { model: ProgramAccountLink, as: 'accountLinks', include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] }] },
        { model: ProgramMissionLink, as: 'missionLinks', include: [{ model: Mission, as: 'mission', attributes: ['id', 'title', 'stage', 'service_lane'] }] },
      ],
    });
    res.json(full.toJSON());
  } catch (err) {
    console.error('Error updating program:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/programs/:id/notes
 */
router.post('/programs/:id/notes', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const program = await ProgramItem.findByPk(id);
    if (!program) return res.status(404).json({ message: 'Program not found' });
    if (!note || typeof note !== 'string' || !note.trim()) {
      return res.status(400).json({ message: 'note is required' });
    }

    const n = await ProgramItemNote.create({
      program_item_id: id,
      user_id: req.user?.id || null,
      note: note.trim(),
    });

    const full = await ProgramItemNote.findByPk(n.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'preferred_name', 'email'] }],
    });
    res.status(201).json({ note: full });
  } catch (err) {
    console.error('Error adding note:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/programs/:id/notes
 */
router.get('/programs/:id/notes', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const notes = await ProcurementProgramNote.findAll({
      where: { procurement_program_id: id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'preferred_name', 'email'] }],
      order: [['created_at', 'DESC']],
    });
    res.json({ notes });
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/programs/:id/link-account
 */
router.post('/programs/:id/link-account', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { prospect_company_id, link_type, confidence, evidence_json } = req.body;
    if (!prospect_company_id) return res.status(400).json({ message: 'prospect_company_id required' });

    const program = await ProgramItem.findByPk(id);
    if (!program) return res.status(404).json({ message: 'Program not found' });

    const [link] = await ProgramItemAccountLink.findOrCreate({
      where: { program_item_id: id, prospect_company_id },
      defaults: {
        program_item_id: id,
        prospect_company_id,
        link_type: link_type || 'unknown',
        confidence: confidence ?? 0.5,
        evidence_json: evidence_json || null,
        created_by_user_id: req.user?.id,
      },
    });

    const full = await ProgramItemAccountLink.findByPk(link.id, {
      include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] }],
    });
    res.status(201).json({ link: full });
  } catch (err) {
    console.error('Error linking account:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/abm/programs/:id/link-account/:link_id
 */
router.delete('/programs/:id/link-account/:link_id', requireInternalUser, async (req, res) => {
  try {
    const { id, link_id } = req.params;
    const link = await ProgramAccountLink.findOne({ where: { id: link_id, procurement_program_id: id } });
    if (!link) return res.status(404).json({ message: 'Link not found' });
    await link.destroy();
    res.json({ message: 'Unlinked' });
  } catch (err) {
    console.error('Error unlinking account:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/programs/:id/link-mission
 */
router.post('/programs/:id/link-mission', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { mission_id, notes } = req.body;
    if (!mission_id) return res.status(400).json({ message: 'mission_id required' });

    const program = await ProgramItem.findByPk(id);
    if (!program) return res.status(404).json({ message: 'Program not found' });

    const [link] = await ProgramItemMissionLink.findOrCreate({
      where: { program_item_id: id, mission_id },
      defaults: {
        program_item_id: id,
        mission_id,
        notes: notes || null,
        created_by_user_id: req.user?.id,
      },
    });

    const full = await ProgramItemMissionLink.findByPk(link.id, {
      include: [{ model: Mission, as: 'mission', attributes: ['id', 'title', 'stage', 'service_lane'] }],
    });
    res.status(201).json({ link: full });
  } catch (err) {
    console.error('Error linking mission:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/programs/:id/create-mission
 */
router.post('/programs/:id/create-mission', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { owner_user_id, title, priority } = req.body;
    const program = await ProgramItem.findByPk(id);
    if (!program) return res.status(404).json({ message: 'Program not found' });

    const ownerId = owner_user_id || req.user?.id;
    if (!ownerId) return res.status(400).json({ message: 'owner_user_id or current user required' });

    const defaultTitle = title || `${program.title?.slice(0, 200) || 'Mission'} — ${program.service_lane || 'Procurement'}`;

    const mission = await Mission.create({
      title: defaultTitle,
      service_lane: program.service_lane || 'other',
      owner_user_id: ownerId,
      source: 'inferred',
      prospect_company_id: null,
      stage: 'new',
      priority: priority || 'medium',
      confidence: 0.6,
      last_activity_at: new Date(),
    });

    await ProgramItemMissionLink.create({
      program_item_id: id,
      mission_id: mission.id,
      notes: 'Created from Procurement Program',
      created_by_user_id: req.user?.id,
    });

    await MissionActivity.create({
      mission_id: mission.id,
      type: 'note',
      body: 'Created from Procurement Program',
      meta_json: { program_item_id: id },
      created_by_user_id: req.user?.id,
    });

    const full = await Mission.findByPk(mission.id, {
      include: [
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
      ],
    });

    res.status(201).json({ mission: full, message: 'Mission created' });
  } catch (err) {
    console.error('Error creating mission from program:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/jobs/recompute-intent
 * Manual trigger for ABM intent recompute job (internal only).
 * Body: { range_days?: number, account_keys?: string[] } — defaults range_days=30.
 */
const abmIntentQueue = require('../../queues/abmIntentQueue');
router.post('/jobs/recompute-intent', requireInternalUser, async (req, res) => {
  try {
    const range_days = Math.min(Math.max(parseInt(req.body?.range_days, 10) || 30, 1), 365);
    const account_keys = Array.isArray(req.body?.account_keys) ? req.body.account_keys : undefined;
    const job = await abmIntentQueue.add('recompute-intent', { range_days, account_keys }, { removeOnComplete: true });
    res.status(200).json({
      ok: true,
      started_at: new Date().toISOString(),
      range_days,
      jobId: job.id,
    });
  } catch (err) {
    console.error('Error enqueueing ABM intent job:', err);
    res.status(500).json({ message: 'Failed to enqueue job' });
  }
});

/**
 * POST /api/abm/jobs/import-sam
 * Manual trigger for SAM.gov opportunities import (admin only, runs in background)
 */
router.post('/jobs/import-sam', requireInternalAdmin, async (req, res) => {
  try {
    const { runImport } = require('../../jobs/importSamOpportunities');
    runImport().then((r) => console.log('SAM import complete', r)).catch((e) => console.error('SAM import failed', e));
    res.json({ message: 'SAM import started in background' });
  } catch (err) {
    console.error('Error starting SAM import:', err);
    res.status(500).json({ message: err.message || 'Failed to start SAM import' });
  }
});

/**
 * POST /api/abm/jobs/ingest-usaspending
 * Manual trigger for USAspending awards ingest (admin only, runs in background)
 */
router.post('/jobs/ingest-usaspending', requireInternalAdmin, async (req, res) => {
  try {
    const { runIngest } = require('../../jobs/ingestUsaspendingAwards');
    const days = req.body?.days ?? req.query?.days ?? 30;
    runIngest(parseInt(days, 10)).then((r) => console.log('USAspending ingest complete', r)).catch((e) => console.error('USAspending ingest failed', e));
    res.json({ message: 'USAspending ingest started in background' });
  } catch (err) {
    console.error('Error starting USAspending ingest:', err);
    res.status(500).json({ message: err.message || 'Failed to start USAspending ingest' });
  }
});

/**
 * POST /api/abm/jobs/ingest-spacewerx
 * Manual trigger for SpaceWERX STRATFI/TACFI ingest (admin only, runs in background)
 */
router.post('/jobs/ingest-spacewerx', requireInternalAdmin, async (req, res) => {
  try {
    const { runIngest } = require('../../jobs/ingestSpacewerxAwards');
    runIngest().then((r) => console.log('SpaceWERX ingest complete', r)).catch((e) => console.error('SpaceWERX ingest failed', e));
    res.json({ message: 'SpaceWERX ingest started in background' });
  } catch (err) {
    console.error('Error starting SpaceWERX ingest:', err);
    res.status(500).json({ message: err.message || 'Failed to start SpaceWERX ingest' });
  }
});

// ---------- Admin routes (Super User only) ----------
const registry = require('../../abm/registry');
const { logAudit } = require('../../services/abmAuditLog.service');
const { invalidateCache } = require('../../services/procurementRegistry.service');
const { classifyProgram, invalidateCache: invalidateProgramClassifierCache } = require('../../services/programClassifier.service');
const { AbmScoreConfig, AbmScoreWeight, AbmTopicRule, AbmSourceWeight, ProcurementImportRun, AbmProgramRule, AbmProgramSuppressionRule, AbmLaneDefinition, AbmAgencyBlacklist } = require('../../models');

// Procurement admin: topic rules
router.get('/admin/topic-rules', requireInternalAdmin, async (req, res) => {
  try {
    const rules = await AbmTopicRule.findAll({ order: [['priority', 'DESC']] });
    res.json({ rules: rules.map((r) => r.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch topic rules' });
  }
});

router.post('/admin/topic-rules', requireInternalAdmin, async (req, res) => {
  try {
    const { enabled, priority, source, match_field, match_type, match_value, service_lane, topic, weight } = req.body;
    const rule = await AbmTopicRule.create({
      enabled: enabled !== false,
      priority: priority ?? 0,
      source: source || null,
      match_field: match_field || null,
      match_type: match_type || 'contains',
      match_value: match_value || null,
      service_lane: service_lane || null,
      topic: topic || null,
      weight: weight ?? null,
    });
    invalidateCache();
    res.json({ rule: rule.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to create topic rule' });
  }
});

router.patch('/admin/topic-rules/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await AbmTopicRule.findByPk(id);
    if (!rule) return res.status(404).json({ message: 'Topic rule not found' });
    const { enabled, priority, source, match_field, match_type, match_value, service_lane, topic, weight } = req.body;
    const updates = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (typeof priority === 'number') updates.priority = priority;
    if (source != null) updates.source = source;
    if (match_field != null) updates.match_field = match_field;
    if (match_type != null) updates.match_type = match_type;
    if (match_value != null) updates.match_value = match_value;
    if (service_lane != null) updates.service_lane = service_lane;
    if (topic != null) updates.topic = topic;
    if (weight != null) updates.weight = weight;
    await rule.update(updates);
    invalidateCache();
    res.json({ rule: rule.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update topic rule' });
  }
});

router.post('/admin/topic-rules/reorder', requireInternalAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ message: 'ids must be an array' });
    for (let i = 0; i < ids.length; i++) {
      await AbmTopicRule.update({ priority: ids.length - 1 - i }, { where: { id: ids[i] } });
    }
    invalidateCache();
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to reorder' });
  }
});

// Procurement admin: source weights
router.get('/admin/source-weights', requireInternalAdmin, async (req, res) => {
  try {
    const weights = await AbmSourceWeight.findAll();
    res.json({ weights: weights.map((w) => w.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch source weights' });
  }
});

router.post('/admin/source-weights', requireInternalAdmin, async (req, res) => {
  try {
    const { source, multiplier, enabled } = req.body;
    if (!source) return res.status(400).json({ message: 'source required' });
    const [w] = await AbmSourceWeight.upsert(
      { source, multiplier: multiplier ?? 1.0, enabled: enabled !== false },
      { conflictFields: ['source'] }
    );
    invalidateCache();
    res.json({ weight: w.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to upsert source weight' });
  }
});

// Procurement admin: import runs
router.get('/admin/import-runs', requireInternalAdmin, async (req, res) => {
  try {
    const runs = await ProcurementImportRun.findAll({
      order: [['started_at', 'DESC']],
      limit: 50,
    });
    res.json({ runs: runs.map((r) => r.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch import runs' });
  }
});

// Cache flush (procurement registry)
router.post('/admin/cache/flush', requireInternalAdmin, async (req, res) => {
  try {
    invalidateCache();
    invalidateProgramClassifierCache();
    if (typeof registry.invalidateCache === 'function') registry.invalidateCache();
    res.json({ message: 'Cache flushed' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to flush cache' });
  }
});

// Program Intelligence (Addendum): program rules, suppression rules, lane definitions, reclassify
router.get('/admin/agency-blacklist', requireInternalAdmin, async (req, res) => {
  try {
    const entries = await AbmAgencyBlacklist.findAll({ order: [['agency_pattern', 'ASC']] });
    res.json({ entries: entries.map((e) => e.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch agency blacklist' });
  }
});

router.post('/admin/agency-blacklist', requireInternalAdmin, async (req, res) => {
  try {
    const { agency_pattern, enabled, notes } = req.body;
    if (!agency_pattern || typeof agency_pattern !== 'string') {
      return res.status(400).json({ message: 'agency_pattern required' });
    }
    const entry = await AbmAgencyBlacklist.create({
      agency_pattern: agency_pattern.trim(),
      enabled: enabled !== false,
      notes: notes || null,
    });
    invalidateProgramClassifierCache();
    res.status(201).json({ entry: entry.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to add agency blacklist' });
  }
});

router.delete('/admin/agency-blacklist/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await AbmAgencyBlacklist.findByPk(id);
    if (!entry) return res.status(404).json({ message: 'Agency blacklist entry not found' });
    await entry.destroy();
    invalidateProgramClassifierCache();
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to remove agency blacklist' });
  }
});

router.patch('/admin/agency-blacklist/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await AbmAgencyBlacklist.findByPk(id);
    if (!entry) return res.status(404).json({ message: 'Agency blacklist entry not found' });
    const updates = {};
    if (typeof req.body.enabled === 'boolean') updates.enabled = req.body.enabled;
    if (typeof req.body.agency_pattern === 'string') updates.agency_pattern = req.body.agency_pattern.trim();
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    await entry.update(updates);
    invalidateProgramClassifierCache();
    res.json({ entry: entry.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update agency blacklist' });
  }
});

router.get('/admin/program-rules', requireInternalAdmin, async (req, res) => {
  try {
    const rules = await AbmProgramRule.findAll({ order: [['priority', 'DESC']] });
    res.json({ rules: rules.map((r) => r.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch program rules' });
  }
});

router.post('/admin/program-rules', requireInternalAdmin, async (req, res) => {
  try {
    const { enabled, priority, match_field, match_type, match_value, service_lane, topic, add_score, set_confidence, notes } = req.body;
    const rule = await AbmProgramRule.create({
      enabled: enabled !== false,
      priority: priority ?? 0,
      match_field: match_field || null,
      match_type: match_type || 'contains',
      match_value: match_value || null,
      service_lane: service_lane || null,
      topic: topic || null,
      add_score: add_score ?? 20,
      set_confidence: set_confidence ?? null,
      notes: notes || null,
    });
    invalidateProgramClassifierCache();
    res.json({ rule: rule.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to create program rule' });
  }
});

router.patch('/admin/program-rules/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await AbmProgramRule.findByPk(id);
    if (!rule) return res.status(404).json({ message: 'Program rule not found' });
    const updates = {};
    ['enabled', 'priority', 'match_field', 'match_type', 'match_value', 'service_lane', 'topic', 'add_score', 'set_confidence', 'notes'].forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    await rule.update(updates);
    invalidateProgramClassifierCache();
    res.json({ rule: rule.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update program rule' });
  }
});

router.get('/admin/program-suppression-rules', requireInternalAdmin, async (req, res) => {
  try {
    const rules = await AbmProgramSuppressionRule.findAll({ order: [['priority', 'DESC']] });
    res.json({ rules: rules.map((r) => r.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch suppression rules' });
  }
});

router.post('/admin/program-suppression-rules', requireInternalAdmin, async (req, res) => {
  try {
    const { enabled, priority, match_field, match_type, match_value, suppress_reason, suppress_score_threshold } = req.body;
    const rule = await AbmProgramSuppressionRule.create({
      enabled: enabled !== false,
      priority: priority ?? 0,
      match_field: match_field || null,
      match_type: match_type || 'contains',
      match_value: match_value || null,
      suppress_reason: suppress_reason || null,
      suppress_score_threshold: suppress_score_threshold ?? null,
    });
    invalidateProgramClassifierCache();
    res.json({ rule: rule.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to create suppression rule' });
  }
});

router.patch('/admin/program-suppression-rules/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await AbmProgramSuppressionRule.findByPk(id);
    if (!rule) return res.status(404).json({ message: 'Suppression rule not found' });
    const updates = {};
    ['enabled', 'priority', 'match_field', 'match_type', 'match_value', 'suppress_reason', 'suppress_score_threshold'].forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    await rule.update(updates);
    invalidateProgramClassifierCache();
    res.json({ rule: rule.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update suppression rule' });
  }
});

router.get('/admin/lane-definitions', requireInternalAdmin, async (req, res) => {
  try {
    const lanes = await AbmLaneDefinition.findAll({ order: [['lane_key', 'ASC']] });
    res.json({ lanes: lanes.map((l) => l.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch lane definitions' });
  }
});

router.patch('/admin/lane-definitions/:lane_key', requireInternalAdmin, async (req, res) => {
  try {
    const { lane_key } = req.params;
    const lane = await AbmLaneDefinition.findByPk(lane_key);
    if (!lane) return res.status(404).json({ message: 'Lane definition not found' });
    const updates = {};
    ['display_name', 'description', 'keywords_json'].forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    await lane.update(updates);
    res.json({ lane: lane.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update lane definition' });
  }
});

router.post('/admin/programs/reclassify', requireInternalAdmin, async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    const days = range === '30d' ? 30 : 7;
    const since = dayjs().subtract(days, 'day').toDate();

    const programs = await ProcurementProgram.findAll({
      where: { posted_at: { [Op.gte]: since } },
      attributes: ['id', 'title', 'summary', 'agency', 'naics', 'psc', 'url'],
    });

    let reclassified = 0;
    for (const p of programs) {
      const result = await classifyProgram(p);
      await ProcurementProgram.update(
        {
          service_lane: result.service_lane,
          topic: result.topic,
          relevance_score: result.relevance_score,
          match_confidence: result.match_confidence,
          match_reasons_json: result.match_reasons_json,
          classification_version: result.classification_version,
          suppressed: result.suppressed,
          suppressed_reason: result.suppressed_reason,
        },
        { where: { id: p.id } }
      );
      reclassified += 1;
    }
    res.json({ message: `Reclassified ${reclassified} programs` });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to reclassify' });
  }
});

router.post('/admin/programs/:id/override', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { service_lane, topic, relevance_score, suppressed, notes } = req.body;
    const program = await ProcurementProgram.findByPk(id);
    if (!program) return res.status(404).json({ message: 'Program not found' });

    const updates = {};
    if (service_lane !== undefined) updates.service_lane = service_lane;
    if (topic !== undefined) updates.topic = topic;
    if (relevance_score !== undefined) updates.relevance_score = relevance_score;
    if (typeof suppressed === 'boolean') {
      updates.suppressed = suppressed;
      updates.suppressed_reason = suppressed ? (notes || 'Manual override') : null;
    }
    if (Object.keys(updates).length) await program.update(updates);
    res.json({ program: program.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to override' });
  }
});

function applyEventRulesTest(path, eventName, rules) {
  for (const r of rules || []) {
    if (r.event_name !== eventName && !r.event_name.includes('*')) continue;
    const matchVal = (r.match_value || '').toLowerCase();
    const p = (path || '').toLowerCase();
    let matched = false;
    if (r.match_type === 'path_prefix') matched = p.startsWith(matchVal);
    else if (r.match_type === 'contains') matched = p.includes(matchVal);
    else if (r.match_type === 'equals') matched = p === matchVal;
    else if (r.match_type === 'path_regex') matched = new RegExp(matchVal).test(p);
    if (matched) {
      return { matched: true, rule: r.toJSON ? r.toJSON() : r, content_type: r.content_type || 'other', lane: r.lane || 'other', weight_override: r.weight_override };
    }
  }
  return { matched: false, content_type: 'other', lane: 'other', weight_override: null };
}

// Event rules
router.get('/admin/event-rules', requireInternalAdmin, async (req, res) => {
  try {
    const rules = await AbmEventRule.findAll({ order: [['priority', 'ASC']] });
    res.json({ rules: rules.map((r) => r.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch event rules' });
  }
});

router.post('/admin/event-rules/reorder', requireInternalAdmin, async (req, res) => {
  try {
    const { ids } = req.body; // [id1, id2, ...] ordered
    if (!Array.isArray(ids)) {
      return res.status(400).json({ message: 'ids must be an array' });
    }
    for (let i = 0; i < ids.length; i++) {
      await AbmEventRule.update({ priority: i }, { where: { id: ids[i] } });
    }
    registry.invalidateCache();
    await logAudit({ userId: req.user?.id, action: 'update', tableName: 'abm_event_rules', recordId: 'reorder', after: { ids } });
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to reorder' });
  }
});

router.post('/admin/event-rules/test', requireInternalAdmin, async (req, res) => {
  try {
    const { path, event_name } = req.body;
    const rules = await registry.getEventRules();
    const result = applyEventRulesTest(path || '', event_name || 'page_view', rules);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Test failed' });
  }
});

router.post('/admin/event-rules', requireInternalAdmin, async (req, res) => {
  try {
    const { enabled, priority, event_name, match_type, match_value, content_type, lane, weight_override, notes } = req.body;
    const rule = await AbmEventRule.create({
      enabled: enabled !== false,
      priority: priority ?? 100,
      event_name: event_name || 'page_view',
      match_type: match_type || 'path_prefix',
      match_value: match_value || '',
      content_type: content_type || null,
      lane: lane || null,
      weight_override: weight_override ?? null,
      notes: notes || null,
    });
    registry.invalidateCache();
    await logAudit({ userId: req.user?.id, action: 'create', tableName: 'abm_event_rules', recordId: rule.id, after: rule.toJSON() });
    res.json({ rule: rule.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to create rule' });
  }
});

router.patch('/admin/event-rules/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await AbmEventRule.findByPk(id);
    if (!before) return res.status(404).json({ message: 'Rule not found' });
    const { enabled, priority, event_name, match_type, match_value, content_type, lane, weight_override, notes } = req.body;
    const updates = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (typeof priority === 'number') updates.priority = priority;
    if (event_name != null) updates.event_name = event_name;
    if (match_type != null) updates.match_type = match_type;
    if (match_value != null) updates.match_value = match_value;
    if (content_type != null) updates.content_type = content_type;
    if (lane != null) updates.lane = lane;
    if (weight_override != null) updates.weight_override = weight_override;
    if (notes != null) updates.notes = notes;
    const [n] = await AbmEventRule.update(updates, { where: { id } });
    if (!n) return res.status(404).json({ message: 'Rule not found' });
    registry.invalidateCache();
    const rule = await AbmEventRule.findByPk(id);
    await logAudit({ userId: req.user?.id, action: 'update', tableName: 'abm_event_rules', recordId: id, before: before.toJSON(), after: rule.toJSON() });
    res.json({ rule: rule.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update rule' });
  }
});

router.delete('/admin/event-rules/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await AbmEventRule.findByPk(id);
    if (!before) return res.status(404).json({ message: 'Rule not found' });
    const [n] = await AbmEventRule.update({ enabled: false }, { where: { id } });
    if (!n) return res.status(404).json({ message: 'Rule not found' });
    registry.invalidateCache();
    await logAudit({ userId: req.user?.id, action: 'delete', tableName: 'abm_event_rules', recordId: id, before: before.toJSON() });
    res.json({ message: 'Disabled' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to delete rule' });
  }
});

// Prompt templates
router.get('/admin/prompt-templates', requireInternalAdmin, async (req, res) => {
  try {
    const templates = await AbmPromptTemplate.findAll({ order: [['lane', 'ASC'], ['persona', 'ASC'], ['intent_stage', 'ASC']] });
    res.json({ templates: templates.map((t) => t.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch templates' });
  }
});

router.post('/admin/prompt-templates', requireInternalAdmin, async (req, res) => {
  try {
    const { enabled, lane, persona, intent_stage, version, system_prompt, user_prompt_template, max_words } = req.body;
    const t = await AbmPromptTemplate.create({
      enabled: enabled !== false,
      lane: lane || '*',
      persona: persona || '*',
      intent_stage: intent_stage || '*',
      version: version || '1.0',
      system_prompt: system_prompt || '',
      user_prompt_template: user_prompt_template || '{{JSON_HERE}}',
      max_words: max_words ?? 180,
    });
    await logAudit({ userId: req.user?.id, action: 'create', tableName: 'abm_prompt_templates', recordId: t.id, after: t.toJSON() });
    res.json({ template: t.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to create template' });
  }
});

router.patch('/admin/prompt-templates/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await AbmPromptTemplate.findByPk(id);
    if (!before) return res.status(404).json({ message: 'Template not found' });
    const { enabled, lane, persona, intent_stage, version, system_prompt, user_prompt_template, max_words } = req.body;
    const updates = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (lane != null) updates.lane = lane;
    if (persona != null) updates.persona = persona;
    if (intent_stage != null) updates.intent_stage = intent_stage;
    if (version != null) updates.version = version;
    if (system_prompt != null) updates.system_prompt = system_prompt;
    if (user_prompt_template != null) updates.user_prompt_template = user_prompt_template;
    if (typeof max_words === 'number') updates.max_words = max_words;
    const [n] = await AbmPromptTemplate.update(updates, { where: { id } });
    if (!n) return res.status(404).json({ message: 'Template not found' });
    const t = await AbmPromptTemplate.findByPk(id);
    await logAudit({ userId: req.user?.id, action: 'update', tableName: 'abm_prompt_templates', recordId: id, before: before.toJSON(), after: t.toJSON() });
    res.json({ template: t.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update template' });
  }
});

// Mission Templates (ABM Rev 2)
router.get('/admin/mission-templates', requireInternalAdmin, async (req, res) => {
  try {
    const templates = await AbmMissionTemplate.findAll({ order: [['lane', 'ASC'], ['template_name', 'ASC']] });
    res.json({ templates: templates.map((t) => t.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch mission templates' });
  }
});

router.post('/admin/mission-templates', requireInternalAdmin, async (req, res) => {
  try {
    const { lane, template_name, default_title_pattern, default_fields_json, enabled } = req.body;
    if (!lane || !template_name) return res.status(400).json({ message: 'lane and template_name are required' });
    const t = await AbmMissionTemplate.create({
      lane,
      template_name,
      default_title_pattern: default_title_pattern || null,
      default_fields_json: default_fields_json || null,
      enabled: enabled !== false,
    });
    res.status(201).json({ template: t.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to create mission template' });
  }
});

router.patch('/admin/mission-templates/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    const allowed = ['lane', 'template_name', 'default_title_pattern', 'default_fields_json', 'enabled'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    const [n] = await AbmMissionTemplate.update(updates, { where: { id } });
    if (!n) return res.status(404).json({ message: 'Mission template not found' });
    const t = await AbmMissionTemplate.findByPk(id);
    res.json({ template: t.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update mission template' });
  }
});

router.delete('/admin/mission-templates/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const n = await AbmMissionTemplate.destroy({ where: { id } });
    if (!n) return res.status(404).json({ message: 'Mission template not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to delete mission template' });
  }
});

// Jobs & Health
router.get('/admin/jobs/status', requireInternalAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const count = await DailyAccountIntent.count({ where: { date: today } });
    res.json({
      last_recompute_date: today,
      accounts_scored_today: count,
      message: `Last run: today. ${count} accounts scored.`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch status' });
  }
});

router.post('/admin/jobs/recompute', requireInternalAdmin, async (req, res) => {
  try {
    const job = await abmIntentQueue.add('recompute-intent', {}, { removeOnComplete: true });
    res.json({ message: 'Job enqueued', jobId: job.id });
  } catch (err) {
    console.error('Error enqueueing ABM intent job:', err);
    res.status(500).json({ message: 'Failed to enqueue job' });
  }
});

// Audit log
router.get('/admin/audit-log', requireInternalAdmin, async (req, res) => {
  try {
    const { AbmAdminAuditLog } = require('../../models');
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const tableName = req.query.table_name;
    const where = tableName ? { table_name: tableName } : {};
    const rows = await AbmAdminAuditLog.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
    const total = await AbmAdminAuditLog.count({ where });
    res.json({ items: rows.map((r) => r.toJSON()), total });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch audit log' });
  }
});

// Score configs
router.get('/admin/score-configs', requireInternalAdmin, async (req, res) => {
  try {
    const configs = await AbmScoreConfig.findAll({ order: [['created_at', 'DESC']] });
    res.json({ configs: configs.map((c) => c.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch configs' });
  }
});

router.post('/admin/score-configs', requireInternalAdmin, async (req, res) => {
  try {
    const active = await AbmScoreConfig.findOne({ where: { status: 'active' } });
    if (!active) return res.status(400).json({ message: 'No active config to clone' });
    const c = await AbmScoreConfig.create({
      name: req.body.name || `draft_${Date.now()}`,
      status: 'draft',
      lambda_decay: req.body.lambda_decay ?? active.lambda_decay,
      normalize_k: req.body.normalize_k ?? active.normalize_k,
      cold_max: req.body.cold_max ?? active.cold_max,
      warm_max: req.body.warm_max ?? active.warm_max,
      surge_surging_min: req.body.surge_surging_min ?? active.surge_surging_min,
      surge_exploding_min: req.body.surge_exploding_min ?? active.surge_exploding_min,
    });
    const weights = await AbmScoreWeight.findAll({ where: { score_config_id: active.id } });
    for (const w of weights) {
      await AbmScoreWeight.create({
        score_config_id: c.id,
        event_name: w.event_name,
        content_type: w.content_type,
        cta_id: w.cta_id,
        weight: w.weight,
      });
    }
    await logAudit({ userId: req.user?.id, action: 'create', tableName: 'abm_score_configs', recordId: c.id, after: c.toJSON() });
    res.json({ config: c.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to create config' });
  }
});

router.patch('/admin/score-configs/:id', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await AbmScoreConfig.findByPk(id);
    if (!before) return res.status(404).json({ message: 'Config not found' });
    const updates = {};
    ['name', 'status', 'lambda_decay', 'normalize_k', 'cold_max', 'warm_max', 'surge_surging_min', 'surge_exploding_min'].forEach((k) => {
      if (req.body[k] != null) updates[k] = req.body[k];
    });
    await AbmScoreConfig.update(updates, { where: { id } });
    const c = await AbmScoreConfig.findByPk(id);
    await logAudit({ userId: req.user?.id, action: 'update', tableName: 'abm_score_configs', recordId: id, before: before.toJSON(), after: c.toJSON() });
    res.json({ config: c.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update config' });
  }
});

router.post('/admin/score-configs/:id/activate', requireInternalAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await AbmScoreConfig.findByPk(id);
    if (!target) return res.status(404).json({ message: 'Config not found' });
    await AbmScoreConfig.update({ status: 'active' }, { where: { status: 'active' } });
    await target.update({ status: 'active' });
    registry.invalidateCache();
    await logAudit({ userId: req.user?.id, action: 'activate', tableName: 'abm_score_configs', recordId: id, after: target.toJSON() });
    res.json({ config: target.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to activate' });
  }
});

router.get('/admin/score-weights', requireInternalAdmin, async (req, res) => {
  try {
    const { score_config_id } = req.query;
    if (!score_config_id) return res.status(400).json({ message: 'score_config_id required' });
    const weights = await AbmScoreWeight.findAll({ where: { score_config_id }, order: [['event_name', 'ASC'], ['content_type', 'ASC']] });
    res.json({ weights: weights.map((w) => w.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch weights' });
  }
});

router.post('/admin/score-weights', requireInternalAdmin, async (req, res) => {
  try {
    const { score_config_id, weights } = req.body; // weights: [{ event_name, content_type?, cta_id?, weight }]
    if (!score_config_id || !Array.isArray(weights)) return res.status(400).json({ message: 'score_config_id and weights required' });
    for (const row of weights) {
      const [w] = await AbmScoreWeight.findOrCreate({
        where: { score_config_id, event_name: row.event_name || 'page_view', content_type: row.content_type ?? null, cta_id: row.cta_id ?? null },
        defaults: { weight: row.weight ?? 1 },
      });
      await w.update({ weight: row.weight ?? 1 });
    }
    registry.invalidateCache();
    const all = await AbmScoreWeight.findAll({ where: { score_config_id } });
    res.json({ weights: all.map((w) => w.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to upsert weights' });
  }
});

// Scoring details (explainability) - lead request (delegates to prospect company)
router.get('/lead-requests/:id/scoring-details', requireInternalUser, async (req, res) => {
  try {
    const lr = await LeadRequest.findByPk(req.params.id, { include: [{ model: ProspectCompany, as: 'prospectCompany' }] });
    if (!lr?.prospectCompany) return res.json({ config_name: null, config_updated_at: null, top_contributors: [] });
    const pcId = lr.prospectCompany.id;
    const dai = await DailyAccountIntent.findOne({ where: { prospect_company_id: pcId }, order: [['date', 'DESC']] });
    if (!dai) return res.json({ config_name: null, config_updated_at: null, top_contributors: [] });
    const config = dai.score_config_id ? await AbmScoreConfig.findByPk(dai.score_config_id) : await registry.getActiveScoreConfig();
    const weightsMap = await registry.getWeightsMap(config?.id);
    const keyEvents = dai.key_events_7d_json || {};
    const contributors = [];
    for (const [key, count] of Object.entries(keyEvents)) {
      let eventName = 'page_view', contentType = 'other', ctaId = null;
      if (key.includes('_page_view')) contentType = key.replace('_page_view', '');
      else if (key.startsWith('cta_click_')) { eventName = 'cta_click'; ctaId = key.replace('cta_click_', ''); }
      else contentType = key;
      const weightKey = `${eventName}:${contentType}:${ctaId || ''}`;
      const weight = weightsMap[weightKey] ?? 1;
      contributors.push({ event_key: key, count: Number(count), weight, contribution: Number(count) * weight });
    }
    contributors.sort((a, b) => b.contribution - a.contribution);
    res.json({ config_name: config?.name ?? 'default_v1', config_updated_at: config?.updated_at ?? null, top_contributors: contributors.slice(0, 10) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch scoring details' });
  }
});

// Scoring details (explainability) - account
router.get('/accounts/:id/scoring-details', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const dai = await DailyAccountIntent.findOne({ where: { prospect_company_id: id }, order: [['date', 'DESC']] });
    if (!dai) return res.json({ config_name: null, config_updated_at: null, top_contributors: [] });
    const config = dai.score_config_id
      ? await AbmScoreConfig.findByPk(dai.score_config_id)
      : await registry.getActiveScoreConfig();
    const weightsMap = await registry.getWeightsMap(config?.id);
    const keyEvents = dai.key_events_7d_json || {};
    const contributors = [];
    for (const [key, count] of Object.entries(keyEvents)) {
      let eventName = 'page_view';
      let contentType = 'other';
      let ctaId = null;
      if (key.includes('_page_view')) {
        contentType = key.replace('_page_view', '');
      } else if (key.startsWith('cta_click_')) {
        eventName = 'cta_click';
        ctaId = key.replace('cta_click_', '');
      } else {
        contentType = key;
      }
      const weightKey = `${eventName}:${contentType}:${ctaId || ''}`;
      const weight = weightsMap[weightKey] ?? 1;
      contributors.push({ event_key: key, count: Number(count), weight, contribution: Number(count) * weight });
    }
    contributors.sort((a, b) => b.contribution - a.contribution);
    res.json({
      config_name: config?.name ?? 'default_v1',
      config_updated_at: config?.updated_at ?? null,
      top_contributors: contributors.slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch scoring details' });
  }
});

module.exports = router;
