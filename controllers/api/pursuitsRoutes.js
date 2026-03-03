/**
 * Pursuits v2 API — /api/abm/pursuits
 * Spec: docs/pursuits-workspace-spec-v2.md §8
 */
const router = require('express').Router();
const { requireInternalUser } = require('../../middleware/auth.middleware');
const {
  Pursuit,
  PursuitProgramLink,
  PursuitLeadRequestLink,
  PursuitIntelRun,
  PursuitIntelSnapshot,
  PursuitStakeholder,
  PursuitTask,
  PursuitActivity,
  ProspectCompany,
  User,
  Mission,
  LeadRequest,
  ProgramItem,
  IntentSignal,
  Contact,
  EnrichmentJob,
  EnrichmentSource,
} = require('../../models');
const { runEnrichmentJob } = require('../../jobs/runEnrichmentJob');
const { Op } = require('sequelize');
const sequelize = require('../../config/connection');

/**
 * GET /api/abm/pursuits — list with filters
 */
router.get('/', requireInternalUser, async (req, res) => {
  try {
    const {
      status,
      stage,
      owner,
      has_programs,
      hot,
      search,
      page = 1,
      limit = 50,
      sort = 'updated_at_desc',
    } = req.query;
    const where = {};
    if (status) where.status = status;
    if (stage) where.stage = stage;
    if (owner) where.owner_user_id = owner;

    const include = [
      { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'], required: true },
      { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'], required: false },
    ];
    if (has_programs === 'true') {
      include.push({
        model: PursuitProgramLink,
        as: 'programLinks',
        required: true,
        attributes: [],
      });
    }
    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { '$prospectCompany.name$': { [Op.like]: `%${search}%` } },
        { '$prospectCompany.domain$': { [Op.like]: `%${search}%` } },
      ];
    }

    const order = sort === 'next_action_asc'
      ? [[sequelize.literal('CASE WHEN next_action_due_at IS NULL THEN 1 ELSE 0 END'), 'ASC'], ['next_action_due_at', 'ASC'], ['updated_at', 'DESC']]
      : [['updated_at', 'DESC']];

    const { count, rows } = await Pursuit.findAndCountAll({
      where,
      include,
      order,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      offset: (Math.max(parseInt(page, 10) || 1, 1) - 1) * (parseInt(limit, 10) || 50),
      distinct: true,
    });

    const pursuitIds = rows.map((p) => p.id);
    let intelLatestMap = {};
    let programCountsMap = {};
    let nextDueByPursuit = {};
    let signalsCountByPursuit = {};

    if (pursuitIds.length > 0) {
      const [snapshots, pCountRows, pursuitsWithPc] = await Promise.all([
        PursuitIntelSnapshot.findAll({
          where: { pursuit_id: { [Op.in]: pursuitIds } },
          order: [['created_at', 'DESC']],
          raw: true,
        }),
        PursuitProgramLink.findAll({
          where: { pursuit_id: { [Op.in]: pursuitIds } },
          attributes: ['pursuit_id'],
          raw: true,
        }),
        Pursuit.findAll({ where: { id: { [Op.in]: pursuitIds } }, attributes: ['id', 'prospect_company_id'], raw: true }),
      ]);

      snapshots.forEach((s) => {
        if (!intelLatestMap[s.pursuit_id]) intelLatestMap[s.pursuit_id] = s;
      });
      pCountRows.forEach((r) => {
        programCountsMap[r.pursuit_id] = (programCountsMap[r.pursuit_id] || 0) + 1;
      });

      const tasks = await PursuitTask.findAll({
        where: { pursuit_id: { [Op.in]: pursuitIds }, status: 'open', due_at: { [Op.ne]: null } },
        attributes: ['pursuit_id', 'due_at'],
        order: [['due_at', 'ASC']],
        raw: true,
      });
      tasks.forEach((t) => {
        if (!nextDueByPursuit[t.pursuit_id] || new Date(t.due_at) < new Date(nextDueByPursuit[t.pursuit_id])) {
          nextDueByPursuit[t.pursuit_id] = t.due_at;
        }
      });

      const pcIds = [...new Set(pursuitsWithPc.map((p) => p.prospect_company_id))];
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const countRows = await IntentSignal.findAll({
        where: { prospect_company_id: { [Op.in]: pcIds }, created_at: { [Op.gte]: since } },
        attributes: ['prospect_company_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['prospect_company_id'],
        raw: true,
      });
      const pcToCount = {};
      (Array.isArray(countRows) ? countRows : []).forEach((c) => { pcToCount[c.prospect_company_id] = Number(c.count) || 0; });
      pursuitsWithPc.forEach((p) => { signalsCountByPursuit[p.id] = pcToCount[p.prospect_company_id] || 0; });
    }

    const list = rows.map((p) => {
      const j = p.toJSON();
      const intel = intelLatestMap[j.id];
      j.account = j.prospectCompany ? { id: j.prospectCompany.id, name: j.prospectCompany.name, domain: j.prospectCompany.domain } : null;
      j.intel = intel ? { score: intel.score, last_refreshed_at: intel.created_at } : null;
      j.signals_90d_count = signalsCountByPursuit[j.id] ?? 0;
      j.next_action_due = nextDueByPursuit[j.id] || j.next_action_due_at;
      j.program_count = programCountsMap[j.id] ?? 0;
      delete j.prospectCompany;
      return j;
    });

    if (hot === 'true') {
      const threshold = 70;
      const filtered = list.filter((p) => (p.intel && p.intel.score >= threshold) || false);
      return res.json({ pursuits: filtered, total: filtered.length, page: 1, limit: filtered.length });
    }
    res.json({ pursuits: list, total: count, page: parseInt(page, 10) || 1, limit: parseInt(limit, 10) || 50 });
  } catch (err) {
    console.error('Error listing pursuits:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits — create pursuit
 */
router.post('/', requireInternalUser, async (req, res) => {
  try {
    const { title, prospect_company_id, owner_user_id, mission_pattern, notes } = req.body;
    if (!title || !prospect_company_id) return res.status(400).json({ message: 'title and prospect_company_id are required' });
    const ownerId = owner_user_id || req.user?.id;
    if (!ownerId) return res.status(400).json({ message: 'owner_user_id or current user required' });

    const company = await ProspectCompany.findByPk(prospect_company_id);
    if (!company) return res.status(404).json({ message: 'Prospect company not found' });

    const pursuit = await Pursuit.create({
      title: title.trim(),
      prospect_company_id,
      owner_user_id: ownerId,
      status: 'open',
      stage: 'researching',
      mission_pattern: mission_pattern || null,
      notes: notes || null,
    });

    await PursuitActivity.create({
      pursuit_id: pursuit.id,
      type: 'pursuit_created',
      body: `Pursuit created for ${company.name}`,
      meta_json: { prospect_company_id },
      created_by_user_id: req.user?.id,
    });

    // §6.1 Real-time enrichment (headless Clay): fill firmographics + contacts
    const job = await EnrichmentJob.create({
      target_type: 'company',
      target_id: prospect_company_id,
      provider: 'clay',
      status: 'queued',
      triggered_by_pursuit_id: pursuit.id,
    });
    await runEnrichmentJob(job.id);

    const full = await Pursuit.findByPk(pursuit.id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
      ],
    });
    res.status(201).json(full);
  } catch (err) {
    console.error('Error creating pursuit:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/pursuits/:id — detail with intel_latest, signals, stakeholders, tasks, linked_programs, linked_lead_requests, mission_link
 */
router.get('/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const pursuit = await Pursuit.findByPk(id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
        { model: Mission, as: 'mission', attributes: ['id', 'title', 'stage', 'service_lane'], required: false },
        { model: PursuitIntelSnapshot, as: 'intelSnapshots', limit: 1, order: [['created_at', 'DESC']] },
        { model: PursuitStakeholder, as: 'stakeholders' },
        { model: PursuitTask, as: 'tasks' },
        { model: PursuitProgramLink, as: 'programLinks', include: [{ model: ProgramItem, as: 'programItem', attributes: ['id', 'title', 'source_type', 'status', 'due_at', 'agency'] }] },
        { model: PursuitLeadRequestLink, as: 'leadRequestLinks', include: [{ model: LeadRequest, as: 'leadRequest', attributes: ['id', 'organization_name', 'service_needed', 'created_at'] }] },
      ],
    });
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });

    const intelLatest = pursuit.intelSnapshots && pursuit.intelSnapshots[0] ? pursuit.intelSnapshots[0].toJSON() : null;
    if (intelLatest) {
      intelLatest.score_components = intelLatest.score_components_json || {};
      intelLatest.bullets = intelLatest.bullets_json || [];
      intelLatest.partners = intelLatest.partners_json || [];
      intelLatest.outreach = intelLatest.outreach_json || {};
      intelLatest.provenance = intelLatest.provenance_json || [];
    }

    const activities = await PursuitActivity.findAll({
      where: { pursuit_id: id },
      order: [['created_at', 'DESC']],
      limit: 50,
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'preferred_name'], required: false }],
    });

    const since = new Date();
    since.setDate(since.getDate() - 90);
    const signals = await IntentSignal.findAll({
      where: { prospect_company_id: pursuit.prospect_company_id, created_at: { [Op.gte]: since } },
      order: [['created_at', 'DESC']],
      limit: 100,
      raw: true,
    });

    const payload = {
      pursuit: {
        ...pursuit.toJSON(),
        account: pursuit.prospectCompany ? { id: pursuit.prospectCompany.id, name: pursuit.prospectCompany.name, domain: pursuit.prospectCompany.domain } : null,
        mission_link: pursuit.mission ? { id: pursuit.mission.id, title: pursuit.mission.title, stage: pursuit.mission.stage, service_lane: pursuit.mission.service_lane } : null,
      },
      intel_latest: intelLatest,
      signals: signals.map((s) => ({ ...s, type: s.signal_type || 'web_visit', source: s.source || 'first_party' })),
      stakeholders: (pursuit.stakeholders || []).map((s) => s.toJSON()),
      tasks: (pursuit.tasks || []).map((t) => t.toJSON()),
      linked_programs: (pursuit.programLinks || []).map((l) => ({ link: l.toJSON(), programItem: l.programItem ? l.programItem.toJSON() : null })),
      linked_lead_requests: (pursuit.leadRequestLinks || []).map((l) => ({ link: l.toJSON(), leadRequest: l.leadRequest ? l.leadRequest.toJSON() : null })),
      activities: activities.map((a) => a.toJSON()),
    };
    delete payload.pursuit.prospectCompany;
    delete payload.pursuit.mission;
    delete payload.pursuit.intelSnapshots;
    delete payload.pursuit.stakeholders;
    delete payload.pursuit.tasks;
    delete payload.pursuit.programLinks;
    delete payload.pursuit.leadRequestLinks;
    res.json(payload);
  } catch (err) {
    console.error('Error fetching pursuit:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/abm/pursuits/:id
 */
router.patch('/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['title', 'stage', 'status', 'notes', 'mission_pattern', 'next_action_due_at'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No allowed fields to update' });

    const pursuit = await Pursuit.findByPk(id);
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });
    if (pursuit.status === 'converted') return res.status(400).json({ message: 'Cannot update converted pursuit' });
    await pursuit.update(updates);

    const full = await Pursuit.findByPk(id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
      ],
    });
    res.json(full);
  } catch (err) {
    console.error('Error updating pursuit:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/convert-to-mission
 */
router.post('/:id/convert-to-mission', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const pursuit = await Pursuit.findByPk(id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany' },
        { model: PursuitIntelSnapshot, as: 'intelSnapshots', limit: 1, order: [['created_at', 'DESC']] },
      ],
    });
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });
    if (pursuit.status === 'converted') return res.status(400).json({ message: 'Pursuit already converted' });

    const ownerId = req.body.owner_user_id || pursuit.owner_user_id || req.user?.id;
    const title = req.body.title || pursuit.title || `${pursuit.prospectCompany?.name || 'Mission'} — from pursuit`;

    const mission = await Mission.create({
      title,
      prospect_company_id: pursuit.prospect_company_id,
      owner_user_id: ownerId,
      source: 'pursuit',
      stage: 'new',
      priority: 'medium',
      confidence: 0.5,
      mission_pattern: pursuit.mission_pattern || null,
      service_lane: req.body.service_lane || null,
    });

    await pursuit.update({ mission_id: mission.id, status: 'converted' });

    await PursuitActivity.create({
      pursuit_id: pursuit.id,
      type: 'converted_to_mission',
      body: `Converted to Mission: ${mission.title}`,
      meta_json: { mission_id: mission.id },
      created_by_user_id: req.user?.id,
    });

    const fullMission = await Mission.findByPk(mission.id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
      ],
    });
    res.status(201).json({ mission: fullMission, pursuit: await pursuit.reload() });
  } catch (err) {
    console.error('Error converting pursuit to mission:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/link-lead-request
 */
router.post('/:id/link-lead-request', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { lead_request_id } = req.body;
    if (!lead_request_id) return res.status(400).json({ message: 'lead_request_id is required' });
    const pursuit = await Pursuit.findByPk(id);
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });
    const lr = await LeadRequest.findByPk(lead_request_id);
    if (!lr) return res.status(404).json({ message: 'Lead request not found' });

    const existing = await PursuitLeadRequestLink.findOne({ where: { pursuit_id: id, lead_request_id } });
    if (existing) return res.json({ link: existing, message: 'Already linked' });

    const link = await PursuitLeadRequestLink.create({ pursuit_id: id, lead_request_id });
    await PursuitActivity.create({
      pursuit_id: id,
      type: 'lead_request_linked',
      body: `Linked lead request: ${lr.organization_name || lr.id}`,
      meta_json: { lead_request_id },
      created_by_user_id: req.user?.id,
    });
    res.status(201).json(link);
  } catch (err) {
    console.error('Error linking lead request:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/link-program
 */
router.post('/:id/link-program', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { program_item_id } = req.body;
    if (!program_item_id) return res.status(400).json({ message: 'program_item_id is required' });
    const pursuit = await Pursuit.findByPk(id);
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });
    const item = await ProgramItem.findByPk(program_item_id);
    if (!item) return res.status(404).json({ message: 'Program item not found' });

    const existing = await PursuitProgramLink.findOne({ where: { pursuit_id: id, program_item_id } });
    if (existing) return res.json({ link: existing, message: 'Already linked' });

    const link = await PursuitProgramLink.create({ pursuit_id: id, program_item_id });
    await PursuitActivity.create({
      pursuit_id: id,
      type: 'program_linked',
      body: `Linked program: ${item.title}`,
      meta_json: { program_item_id },
      created_by_user_id: req.user?.id,
    });
    res.status(201).json(link);
  } catch (err) {
    console.error('Error linking program:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/intel/run — run Mission Intel in real time (enrichment if stale, then intel)
 */
router.post('/:id/intel/run', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const pursuit = await Pursuit.findByPk(id, { include: [{ model: ProspectCompany, as: 'prospectCompany' }] });
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });

    const run = await PursuitIntelRun.create({
      pursuit_id: id,
      provider: 'rules_v1',
      status: 'running',
      started_at: new Date(),
    });

    // §6.2 Commodity enrichment (if stale / missing) — real-time
    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - 7);
    const recentEnrichment = await EnrichmentJob.findOne({
      where: {
        target_type: 'company',
        target_id: pursuit.prospect_company_id,
        status: 'done',
        completed_at: { [Op.gte]: staleCutoff },
      },
    });
    if (!recentEnrichment) {
      const enrichJob = await EnrichmentJob.create({
        target_type: 'company',
        target_id: pursuit.prospect_company_id,
        provider: 'clay',
        status: 'queued',
        triggered_by_pursuit_id: id,
      });
      await runEnrichmentJob(enrichJob.id);
    }

    // Use latest enrichment (just run or existing) for bullets + suggested stakeholders
    const latestJob = await EnrichmentJob.findOne({
      where: { target_type: 'company', target_id: pursuit.prospect_company_id, status: 'done' },
      order: [['completed_at', 'DESC']],
    });
    let enrichmentUsed = null;
    if (latestJob) {
      const src = await EnrichmentSource.findOne({ where: { enrichment_job_id: latestJob.id } });
      if (src && src.raw_json) enrichmentUsed = src.raw_json;
    }

    const companyName = pursuit.prospectCompany?.name || 'Unknown';
    const bullets = [
      `Account ${companyName} has limited visible procurement signals in the last 90 days.`,
      enrichmentUsed
        ? `Enrichment (${enrichmentUsed._stub ? 'stub' : 'Clay'}): firmographics + ${(enrichmentUsed.contacts || []).length} contact(s). Add stakeholders from suggested contacts to improve intel.`
        : 'Enrichment run; add stakeholders from suggested contacts to improve intel.',
      'Consider linking relevant program items from Programs to improve score.',
      pursuit.mission_pattern ? 'Mission pattern set; recommendations use it.' : 'Mission pattern not set; add one to refine recommendations.',
      'Next: Add at least one stakeholder (Contracting, PM, or Technical) to improve intel.',
    ];
    const stakeholdersSuggested = (enrichmentUsed?.contacts || []).slice(0, 5).map((c) => ({
      name: c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email,
      title: c.title || c.job_title,
      email: c.email || c.email_address,
      role: 'unknown',
      grade: 'C',
      source: 'clay',
    }));
    const provenance = [
      { field: 'rules_v1', source: 'system', confidence: 0.5, last_verified: new Date().toISOString().slice(0, 10) },
    ];
    if (enrichmentUsed && !enrichmentUsed._stub) {
      provenance.push({ field: 'firmographics', source: 'clay', confidence: 0.7, last_verified: new Date().toISOString().slice(0, 10) });
    }

    const snapshot = await PursuitIntelSnapshot.create({
      pursuit_id: id,
      score: 65,
      score_components_json: {
        mission_fit: 18,
        procurement_readiness: 15,
        timing: 12,
        partnerability: 10,
        competitive_pressure: 10,
      },
      bullets_json: bullets,
      signals_summary_json: [],
      stakeholders_suggested_json: stakeholdersSuggested,
      partners_json: [],
      outreach_json: { angle_bullets: [], draft: '' },
      provenance_json: provenance,
    });
    await run.update({ status: 'done', finished_at: new Date(), meta_json: { snapshot_id: snapshot.id } });
    await PursuitActivity.create({
      pursuit_id: id,
      type: 'intel_run_done',
      body: 'Mission Intel run completed',
      meta_json: { run_id: run.id, score: snapshot.score },
      created_by_user_id: req.user?.id,
    });

    res.json({ run: run.toJSON(), snapshot: snapshot.toJSON() });
  } catch (err) {
    console.error('Error running intel:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/pursuits/:id/intel/latest
 */
router.get('/:id/intel/latest', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const snapshot = await PursuitIntelSnapshot.findOne({
      where: { pursuit_id: id },
      order: [['created_at', 'DESC']],
    });
    if (!snapshot) return res.status(404).json({ message: 'No intel snapshot yet' });
    const j = snapshot.toJSON();
    j.score_components = j.score_components_json || {};
    j.bullets = j.bullets_json || [];
    j.partners = j.partners_json || [];
    j.outreach = j.outreach_json || {};
    j.provenance = j.provenance_json || [];
    res.json(j);
  } catch (err) {
    console.error('Error fetching intel latest:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/pursuits/:id/signals
 */
router.get('/:id/signals', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { range = '90d', source, type } = req.query;
    const pursuit = await Pursuit.findByPk(id, { attributes: ['prospect_company_id'] });
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });

    const days = range === '30d' ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = { prospect_company_id: pursuit.prospect_company_id, created_at: { [Op.gte]: since } };
    if (type) where.signal_type = type;
    if (source) where.source = source;

    const signals = await IntentSignal.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    res.json({ signals: signals.map((s) => ({ ...s.toJSON(), type: s.signal_type || 'web_visit', source: s.source || 'first_party' })) });
  } catch (err) {
    console.error('Error fetching pursuit signals:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/pursuits/:id/stakeholders
 */
router.get('/:id/stakeholders', requireInternalUser, async (req, res) => {
  try {
    const list = await PursuitStakeholder.findAll({
      where: { pursuit_id: req.params.id },
      include: [{ model: Contact, as: 'contact', attributes: ['id', 'email', 'first_name', 'last_name', 'title'], required: false }],
    });
    res.json({ stakeholders: list });
  } catch (err) {
    console.error('Error fetching stakeholders:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/stakeholders
 */
router.post('/:id/stakeholders', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, org, role, grade, relationship, notes, contact_id } = req.body;
    if (!name || !role) return res.status(400).json({ message: 'name and role are required' });
    const pursuit = await Pursuit.findByPk(id);
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });

    const sh = await PursuitStakeholder.create({
      pursuit_id: id,
      contact_id: contact_id || null,
      name,
      org: org || null,
      role,
      grade: grade || null,
      relationship: relationship || null,
      notes: notes || null,
      source: 'manual',
    });
    res.status(201).json(sh);
  } catch (err) {
    console.error('Error creating stakeholder:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/abm/pursuits/:id/stakeholders/:stakeholder_id
 */
router.patch('/:id/stakeholders/:stakeholderId', requireInternalUser, async (req, res) => {
  try {
    const sh = await PursuitStakeholder.findOne({
      where: { id: req.params.stakeholderId, pursuit_id: req.params.id },
    });
    if (!sh) return res.status(404).json({ message: 'Stakeholder not found' });
    const allowed = ['name', 'org', 'role', 'grade', 'relationship', 'notes', 'contact_id'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    await sh.update(updates);
    res.json(sh);
  } catch (err) {
    console.error('Error updating stakeholder:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/abm/pursuits/:id/stakeholders/:stakeholder_id
 */
router.delete('/:id/stakeholders/:stakeholderId', requireInternalUser, async (req, res) => {
  try {
    const sh = await PursuitStakeholder.findOne({
      where: { id: req.params.stakeholderId, pursuit_id: req.params.id },
    });
    if (!sh) return res.status(404).json({ message: 'Stakeholder not found' });
    await sh.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Error deleting stakeholder:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/actions/book-meeting — create task + activity
 */
router.post('/:id/actions/book-meeting', requireInternalUser, async (req, res) => {
  try {
    const pursuit = await Pursuit.findByPk(req.params.id);
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });
    const task = await PursuitTask.create({
      pursuit_id: pursuit.id,
      title: 'Book meeting',
      task_type: 'action',
      status: 'open',
      priority: 'med',
      owner_user_id: req.user?.id,
    });
    await PursuitActivity.create({
      pursuit_id: pursuit.id,
      type: 'task_created',
      body: 'Action: Book meeting',
      meta_json: { task_id: task.id },
      created_by_user_id: req.user?.id,
    });
    res.status(201).json({ task });
  } catch (err) {
    console.error('Error creating book-meeting action:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/actions/partner-intro
 */
router.post('/:id/actions/partner-intro', requireInternalUser, async (req, res) => {
  try {
    const pursuit = await Pursuit.findByPk(req.params.id);
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });
    const task = await PursuitTask.create({
      pursuit_id: pursuit.id,
      title: 'Request partner intro',
      task_type: 'action',
      status: 'open',
      priority: 'med',
      owner_user_id: req.user?.id,
    });
    await PursuitActivity.create({
      pursuit_id: pursuit.id,
      type: 'task_created',
      body: 'Action: Partner intro',
      meta_json: { task_id: task.id },
      created_by_user_id: req.user?.id,
    });
    res.status(201).json({ task });
  } catch (err) {
    console.error('Error creating partner-intro action:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/actions/draft-sequence
 */
router.post('/:id/actions/draft-sequence', requireInternalUser, async (req, res) => {
  try {
    const pursuit = await Pursuit.findByPk(req.params.id);
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });
    const task = await PursuitTask.create({
      pursuit_id: pursuit.id,
      title: 'Draft outreach sequence',
      task_type: 'action',
      status: 'open',
      priority: 'med',
      owner_user_id: req.user?.id,
    });
    await PursuitActivity.create({
      pursuit_id: pursuit.id,
      type: 'task_created',
      body: 'Action: Draft sequence',
      meta_json: { task_id: task.id },
      created_by_user_id: req.user?.id,
    });
    res.status(201).json({ task });
  } catch (err) {
    console.error('Error creating draft-sequence action:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/pursuits/:id/actions/add-to-campaign
 */
router.post('/:id/actions/add-to-campaign', requireInternalUser, async (req, res) => {
  try {
    const pursuit = await Pursuit.findByPk(req.params.id);
    if (!pursuit) return res.status(404).json({ message: 'Pursuit not found' });
    const task = await PursuitTask.create({
      pursuit_id: pursuit.id,
      title: 'Add to campaign',
      task_type: 'action',
      status: 'open',
      priority: 'med',
      owner_user_id: req.user?.id,
    });
    await PursuitActivity.create({
      pursuit_id: pursuit.id,
      type: 'task_created',
      body: 'Action: Add to campaign',
      meta_json: { task_id: task.id },
      created_by_user_id: req.user?.id,
    });
    res.status(201).json({ task });
  } catch (err) {
    console.error('Error creating add-to-campaign action:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
