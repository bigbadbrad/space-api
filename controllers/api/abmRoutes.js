// /controllers/api/abmRoutes.js
const router = require('express').Router();
const { requireInternalUser, requireInternalAdmin } = require('../../middleware/auth.middleware');
const { 
  ProspectCompany, 
  IntentSignal, 
  Contact,
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
 * GET /api/abm/activity
 * Activity feed from intent_signals + KPIs + trending topics/lanes
 */
router.get('/activity', requireInternalUser, async (req, res) => {
  try {
    const { range = '7d', limit = 200 } = req.query;
    const days = range === '30d' ? 30 : 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoff7d = new Date();
    cutoff7d.setDate(cutoff7d.getDate() - 7);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const where = { occurred_at: { [Op.gte]: cutoff } };

    const signals = await IntentSignal.findAll({
      where,
      order: [['occurred_at', 'DESC']],
      limit: Math.min(parseInt(limit) || 200, 500),
      include: [
        {
          model: ProspectCompany,
          as: 'prospectCompany',
          attributes: ['id', 'name', 'domain'],
          required: true,
        },
      ],
    });

    // Include lead requests that may not have intent signals (e.g. when prospect_company was null)
    const leadRequests = await LeadRequest.findAll({
      where: { created_at: { [Op.gte]: cutoff } },
      order: [['created_at', 'DESC']],
      limit: Math.min(parseInt(limit) || 200, 500),
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
    const accountsActive7d = new Set(uniqueAccounts7d.map((s) => s.prospect_company_id)).size;

    const leadRequests7d = await LeadRequest.count({
      where: { created_at: { [Op.gte]: cutoff7d } },
    });

    const todayDate = new Date().toISOString().slice(0, 10);
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

    const trendingLanes = Object.entries(laneWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, score]) => ({ name, score }));

    const trendingTypes = Object.entries(typeWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, score]) => ({ name, score }));

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

    // Add lead requests that have no matching lead_submitted intent signal (e.g. prospect_company was null)
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

    const feed = [...signalFeed, ...lrFeed]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, Math.min(parseInt(limit) || 200, 500));

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
 */
router.get('/overview', requireInternalUser, async (req, res) => {
  try {
    const { chart_range = '7d' } = req.query;
    const dateStr = today();
    const days = chart_range === '30d' ? 30 : 7;

    const allDaiToday = await DailyAccountIntent.findAll({
      where: { date: dateStr },
      include: [{ model: ProspectCompany, as: 'prospectCompany', required: true }],
      order: [['intent_score', 'DESC']],
    });

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

    const [daiToday, daiYesterday, leadRequestsRecent, allOperatorActions, missionsDue, missionsStale, missionsNewFromLr] = await Promise.all([
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

// ---------- Phase 2 Dashboard Endpoints ----------

/**
 * GET /api/abm/accounts
 * Hot Accounts dashboard (Phase 2)
 * When lane is specified: returns accounts with lane_score_7d for that lane, ranked by it.
 */
router.get('/accounts', requireInternalUser, async (req, res) => {
  try {
    const { range = '7d', stage, lane, surge, search, page = 1, limit = 50 } = req.query;
    const date = today();
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let daiList;
    let totalCount;

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

    await lr.update({ mission_id: mission.id });
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

/**
 * POST /api/abm/jobs/recompute-intent
 * Manual trigger for ABM intent recompute job (internal only)
 */
const abmIntentQueue = require('../../queues/abmIntentQueue');
router.post('/jobs/recompute-intent', requireInternalUser, async (req, res) => {
  try {
    const job = await abmIntentQueue.add('recompute-intent', {}, { removeOnComplete: true });
    res.json({ message: 'Job enqueued', jobId: job.id });
  } catch (err) {
    console.error('Error enqueueing ABM intent job:', err);
    res.status(500).json({ message: 'Failed to enqueue job' });
  }
});

// ---------- Admin routes (Super User only) ----------
const registry = require('../../abm/registry');
const { logAudit } = require('../../services/abmAuditLog.service');
const { AbmScoreConfig, AbmScoreWeight } = require('../../models');

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
