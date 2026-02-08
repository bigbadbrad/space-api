/**
 * ABM Rev 2: Missions (Programs) API
 * /api/abm/missions
 */
const router = require('express').Router();
const { requireInternalUser, requireInternalAdmin } = require('../../middleware/auth.middleware');
const {
  Mission,
  MissionContact,
  MissionArtifact,
  MissionActivity,
  ProspectCompany,
  Contact,
  LeadRequest,
  IntentSignal,
  User,
  DailyAccountIntent,
  ProgramMissionLink,
  ProcurementProgram,
} = require('../../models');
const { Op } = require('sequelize');
const sequelize = require('../../config/connection');

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET /api/abm/missions/summary?range=7d
 */
router.get('/summary', requireInternalUser, async (req, res) => {
  try {
    const range = req.query.range || '7d';
    const days = range === '30d' ? 30 : 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const dueSoon = new Date();
    dueSoon.setDate(dueSoon.getDate() + 7);
    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - 14);

    const closedStages = ['won', 'lost', 'on_hold'];
    const whereActive = { stage: { [Op.notIn]: closedStages } };
    const whereDueSoon = {
      ...whereActive,
      next_step_due_at: { [Op.lte]: dueSoon, [Op.gte]: new Date() },
    };
    const whereStale = {
      ...whereActive,
      [Op.or]: [
        { last_activity_at: { [Op.lt]: staleCutoff } },
        { last_activity_at: null },
      ],
    };

    const hotPcIds = await DailyAccountIntent.findAll({
      where: { date: today(), intent_stage: 'Hot' },
      attributes: ['prospect_company_id'],
      raw: true,
    }).then((rows) => rows.map((r) => r.prospect_company_id).filter(Boolean));

    const whereHot = {
      ...whereActive,
      [Op.or]: [
        { confidence: { [Op.gte]: 0.75 } },
        ...(hotPcIds.length ? [{ prospect_company_id: { [Op.in]: hotPcIds } }] : []),
      ],
    };

    const [activeCount, dueSoonCount, staleCount, hotCount] = await Promise.all([
      Mission.count({ where: whereActive }),
      Mission.count({ where: whereDueSoon }),
      Mission.count({ where: whereStale }),
      Mission.count({ where: whereHot }),
    ]);

    const byStage = await Mission.findAll({
      where: whereActive,
      attributes: ['stage'],
      raw: true,
    });
    const stageCounts = byStage.reduce((acc, m) => {
      acc[m.stage] = (acc[m.stage] || 0) + 1;
      return acc;
    }, {});

    const byLane = await Mission.findAll({
      where: whereActive,
      attributes: ['service_lane'],
      raw: true,
    });
    const laneCounts = byLane.reduce((acc, m) => {
      const lane = m.service_lane || 'other';
      acc[lane] = (acc[lane] || 0) + 1;
      return acc;
    }, {});

    res.json({
      active: activeCount,
      due_soon: dueSoonCount,
      stale: staleCount,
      hot: hotCount,
      by_stage: stageCounts,
      by_lane: laneCounts,
    });
  } catch (err) {
    console.error('Error fetching missions summary:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/missions
 */
router.get('/', requireInternalUser, async (req, res) => {
  try {
    const {
      range = '7d',
      stage,
      lane,
      owner,
      search,
      sort = 'next_step_due_at_asc',
      page = 1,
      limit = 50,
      due_soon,
      stale,
      hot,
    } = req.query;

    const where = {};
    const closedStages = ['won', 'lost', 'on_hold'];
    if (stage === 'closed') {
      where.stage = { [Op.in]: closedStages };
    } else if (stage && !closedStages.includes(stage)) {
      where.stage = stage;
    } else if (!stage) {
      where.stage = { [Op.notIn]: closedStages };
    } else {
      where.stage = stage;
    }

    if (lane) where.service_lane = lane;
    if (owner === 'me' && req.user?.id) where.owner_user_id = req.user.id;
    else if (owner && owner !== 'me') where.owner_user_id = owner;

    if (due_soon === 'true') {
      const dueSoon = new Date();
      dueSoon.setDate(dueSoon.getDate() + 7);
      where.next_step_due_at = { [Op.lte]: dueSoon, [Op.gte]: new Date() };
    }
    if (stale === 'true') {
      const staleCutoff = new Date();
      staleCutoff.setDate(staleCutoff.getDate() - 14);
      where[Op.or] = [
        { last_activity_at: { [Op.lt]: staleCutoff } },
        { last_activity_at: null },
      ];
    }
    if (hot === 'true') {
      const hotPcIds = await DailyAccountIntent.findAll({
        where: { date: today(), intent_stage: 'Hot' },
        attributes: ['prospect_company_id'],
        raw: true,
      }).then((rows) => rows.map((r) => r.prospect_company_id).filter(Boolean));
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({
        [Op.or]: [
          { confidence: { [Op.gte]: 0.75 } },
          ...(hotPcIds.length ? [{ prospect_company_id: { [Op.in]: hotPcIds } }] : []),
        ],
      });
    }

    if (search) {
      const searchVal = `%${search}%`;
      const pcIds = (await ProspectCompany.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.like]: searchVal } },
            { domain: { [Op.like]: searchVal } },
          ],
        },
        attributes: ['id'],
        raw: true,
      })).map((r) => r.id);
      const searchOr = [
        { title: { [Op.like]: searchVal } },
        ...(pcIds.length ? [{ prospect_company_id: { [Op.in]: pcIds } }] : []),
      ];
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({ [Op.or]: searchOr });
    }

    const order = [];
    if (sort === 'next_step_due_at_asc') {
      order.push([sequelize.literal('CASE WHEN next_step_due_at IS NULL THEN 1 ELSE 0 END'), 'ASC']);
      order.push(['next_step_due_at', 'ASC']);
      order.push(['last_activity_at', 'DESC']);
    } else if (sort === 'last_activity_at_desc') {
      order.push(['last_activity_at', 'DESC']);
      order.push(['next_step_due_at', 'ASC']);
    } else if (sort === 'priority_desc') {
      order.push([sequelize.literal("FIELD(priority,'high','medium','low')"), 'ASC']);
      order.push(['next_step_due_at', 'ASC']);
    } else {
      order.push(['last_activity_at', 'DESC']);
    }

    const { count, rows } = await Mission.findAndCountAll({
      where,
      include: [
        { model: ProspectCompany, as: 'prospectCompany', required: false, attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
      ],
      order,
      limit: Math.min(parseInt(limit) || 50, 100),
      offset: (Math.max(parseInt(page) || 1, 1) - 1) * (parseInt(limit) || 50),
      distinct: true,
    });

    res.json({
      missions: rows,
      total: count,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
  } catch (err) {
    console.error('Error fetching missions:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/missions
 */
router.post('/', requireInternalUser, async (req, res) => {
  try {
    const body = req.body;
    const { title, service_lane, owner_user_id, prospect_company_id, lead_request_id } = body;

    if (!title || !service_lane) {
      return res.status(400).json({ message: 'title and service_lane are required' });
    }
    const ownerId = owner_user_id || req.user?.id;
    if (!ownerId) {
      return res.status(400).json({ message: 'owner_user_id is required' });
    }

    let missionData = {
      title,
      service_lane,
      owner_user_id: ownerId,
      source: lead_request_id ? 'lead_request' : 'manual',
      prospect_company_id: prospect_company_id || null,
      lead_request_id: lead_request_id || null,
      primary_contact_id: body.primary_contact_id || null,
      mission_type: body.mission_type || null,
      mission_pattern: body.mission_pattern || null,
      target_orbit: body.target_orbit || null,
      inclination_deg: body.inclination_deg ?? null,
      payload_mass_kg: body.payload_mass_kg ?? null,
      payload_volume: body.payload_volume || null,
      earliest_date: body.earliest_date || null,
      latest_date: body.latest_date || null,
      schedule_urgency: body.schedule_urgency || null,
      integration_status: body.integration_status || null,
      readiness_confidence: body.readiness_confidence || null,
      funding_status: body.funding_status || null,
      budget_band: body.budget_band || null,
      stage: body.stage || 'new',
      priority: body.priority || 'medium',
      confidence: body.confidence ?? 0.5,
      next_step: body.next_step || null,
      next_step_due_at: body.next_step_due_at || null,
      last_activity_at: new Date(),
    };

    if (lead_request_id) {
      const lr = await LeadRequest.findByPk(lead_request_id, {
        include: [{ model: ProspectCompany, as: 'prospectCompany' }],
      });
      if (lr) {
        if (!missionData.prospect_company_id) missionData.prospect_company_id = lr.prospect_company_id;
        if (!missionData.primary_contact_id) missionData.primary_contact_id = lr.contact_id;
        missionData.mission_type = missionData.mission_type || lr.mission_type;
        missionData.target_orbit = missionData.target_orbit || lr.target_orbit;
        missionData.earliest_date = missionData.earliest_date || lr.earliest_date;
        missionData.latest_date = missionData.latest_date || lr.latest_date;
        missionData.schedule_urgency = missionData.schedule_urgency || lr.schedule_urgency;
        missionData.integration_status = missionData.integration_status || lr.integration_status;
        missionData.readiness_confidence = missionData.readiness_confidence || lr.readiness_confidence;
        missionData.funding_status = missionData.funding_status || lr.funding_status;
        missionData.budget_band = missionData.budget_band || lr.budget_band;
      }
    }

    const mission = await Mission.create(missionData);

    if (lead_request_id) {
      await LeadRequest.update({ mission_id: mission.id }, { where: { id: lead_request_id } });
      await MissionActivity.create({
        mission_id: mission.id,
        type: 'linked_lead_request',
        body: 'Promoted from lead request',
        meta_json: { lead_request_id },
        created_by_user_id: req.user?.id,
      });
      await MissionActivity.create({
        mission_id: mission.id,
        type: 'note',
        body: 'Procurement brief attached',
        created_by_user_id: req.user?.id,
      });
    }

    const full = await Mission.findByPk(mission.id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
        { model: Contact, as: 'primaryContact', attributes: ['id', 'email', 'first_name', 'last_name', 'title'] },
      ],
    });

    res.status(201).json(full);
  } catch (err) {
    console.error('Error creating mission:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/abm/missions/:id
 */
router.get('/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const mission = await Mission.findByPk(id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany' },
        { model: Contact, as: 'primaryContact' },
        { model: LeadRequest, as: 'leadRequest' },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
        { model: MissionArtifact, as: 'artifacts', include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'preferred_name'] }] },
        { model: MissionActivity, as: 'activities', include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'preferred_name'] }], order: [['created_at', 'DESC']], limit: 50 },
        { model: Contact, as: 'contacts', through: { attributes: ['role'] }, attributes: ['id', 'email', 'first_name', 'last_name', 'title'] },
      ],
    });
    if (!mission) return res.status(404).json({ message: 'Mission not found' });

    const pcId = mission.prospect_company_id;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let accountSummary = null;
    if (pcId) {
      const dai = await DailyAccountIntent.findOne({
        where: { prospect_company_id: pcId, date: today() },
        include: [{ model: ProspectCompany, as: 'prospectCompany' }],
      });
      accountSummary = dai ? {
        intent_score: dai.intent_score,
        intent_stage: dai.intent_stage,
        surge_level: dai.surge_level,
        top_lane: dai.top_lane,
      } : null;
    }

    const relatedLeadRequests = pcId
      ? await LeadRequest.findAll({
          where: {
            prospect_company_id: pcId,
            id: { [Op.ne]: mission.lead_request_id || '' },
          },
          include: [{ model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] }],
          order: [['created_at', 'DESC']],
          limit: 10,
        })
      : [];

    const relatedSignals = pcId
      ? await IntentSignal.findAll({
          where: {
            prospect_company_id: pcId,
            occurred_at: { [Op.gte]: thirtyDaysAgo },
            ...(mission.service_lane ? { service_lane: mission.service_lane } : {}),
          },
          order: [['occurred_at', 'DESC']],
          limit: 30,
        })
      : [];

    const linkedPrograms = await ProgramMissionLink.findAll({
      where: { mission_id: id },
      include: [{ model: ProcurementProgram, as: 'procurementProgram', attributes: ['id', 'title', 'status', 'posted_at', 'due_at', 'service_lane', 'url'] }],
    });

    res.json({
      mission: mission.toJSON(),
      account_summary: accountSummary,
      related_lead_requests: relatedLeadRequests,
      related_intent_signals: relatedSignals,
      linked_programs: linkedPrograms.map((l) => ({ id: l.id, mission_id: l.mission_id, procurement_program_id: l.procurement_program_id, program: l.procurementProgram ? l.procurementProgram.toJSON() : null })),
    });
  } catch (err) {
    console.error('Error fetching mission:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/abm/missions/:id
 */
router.patch('/:id', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const mission = await Mission.findByPk(id);
    if (!mission) return res.status(404).json({ message: 'Mission not found' });

    const allowed = [
      'stage', 'priority', 'owner_user_id', 'next_step', 'next_step_due_at',
      'title', 'service_lane', 'mission_type', 'mission_pattern', 'target_orbit',
      'inclination_deg', 'payload_mass_kg', 'payload_volume', 'earliest_date', 'latest_date',
      'schedule_urgency', 'integration_status', 'readiness_confidence', 'funding_status', 'budget_band', 'confidence',
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    updates.last_activity_at = new Date();

    if (updates.stage && updates.stage !== mission.stage) {
      await MissionActivity.create({
        mission_id: id,
        type: 'status_change',
        body: `Stage changed from ${mission.stage} to ${updates.stage}`,
        meta_json: { from: mission.stage, to: updates.stage },
        created_by_user_id: req.user?.id,
      });
    }
    if (updates.next_step && updates.next_step !== mission.next_step) {
      await MissionActivity.create({
        mission_id: id,
        type: 'note',
        body: `Next step: ${updates.next_step}`,
        created_by_user_id: req.user?.id,
      });
    }

    await mission.update(updates);
    const updated = await Mission.findByPk(id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany' },
        { model: Contact, as: 'primaryContact' },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
      ],
    });
    res.json(updated);
  } catch (err) {
    console.error('Error updating mission:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/missions/:id/close
 */
router.post('/:id/close', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, reason } = req.body;
    if (!['won', 'lost', 'on_hold'].includes(outcome)) {
      return res.status(400).json({ message: 'outcome must be won, lost, or on_hold' });
    }
    const mission = await Mission.findByPk(id);
    if (!mission) return res.status(404).json({ message: 'Mission not found' });

    await mission.update({ stage: outcome, last_activity_at: new Date() });
    await MissionActivity.create({
      mission_id: id,
      type: 'status_change',
      body: reason ? `Closed as ${outcome}: ${reason}` : `Closed as ${outcome}`,
      meta_json: { outcome, reason: reason || null },
      created_by_user_id: req.user?.id,
    });

    const updated = await Mission.findByPk(id, {
      include: [
        { model: ProspectCompany, as: 'prospectCompany' },
        { model: User, as: 'owner', attributes: ['id', 'name', 'preferred_name', 'email'] },
      ],
    });
    res.json(updated);
  } catch (err) {
    console.error('Error closing mission:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/missions/:id/contacts
 */
router.post('/:id/contacts', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { contact_id, role } = req.body;
    if (!contact_id) return res.status(400).json({ message: 'contact_id is required' });
    const [mc] = await MissionContact.findOrCreate({
      where: { mission_id: id, contact_id },
      defaults: { role: role || null },
    });
    const contact = await Contact.findByPk(contact_id, { attributes: ['id', 'email', 'first_name', 'last_name', 'title'] });
    res.status(201).json({ mission_contact: mc, contact });
  } catch (err) {
    console.error('Error adding mission contact:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/abm/missions/:id/contacts/:contactId
 */
router.delete('/:id/contacts/:contactId', requireInternalUser, async (req, res) => {
  try {
    const { id, contactId } = req.params;
    const n = await MissionContact.destroy({ where: { mission_id: id, contact_id: contactId } });
    if (!n) return res.status(404).json({ message: 'Mission contact not found' });
    res.json({ message: 'Removed' });
  } catch (err) {
    console.error('Error removing mission contact:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/missions/:id/artifacts
 */
router.post('/:id/artifacts', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, url, meta_json } = req.body;
    if (!type) return res.status(400).json({ message: 'type is required' });
    const artifact = await MissionArtifact.create({
      mission_id: id,
      type,
      title: title || null,
      url: url || null,
      meta_json: meta_json || null,
      created_by_user_id: req.user?.id,
    });
    res.status(201).json(artifact);
  } catch (err) {
    console.error('Error adding artifact:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/abm/missions/:id/artifacts/:artifactId
 */
router.delete('/:id/artifacts/:artifactId', requireInternalUser, async (req, res) => {
  try {
    const { id, artifactId } = req.params;
    const n = await MissionArtifact.destroy({ where: { mission_id: id, id: artifactId } });
    if (!n) return res.status(404).json({ message: 'Artifact not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Error deleting artifact:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/abm/missions/:id/ai-brief
 * Generate AI mission brief (optional Rev 2)
 */
const { generateMissionBrief } = require('../../services/abmMissionBrief.service');
router.post('/:id/ai-brief', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const mission = await Mission.findByPk(id);
    if (!mission) return res.status(404).json({ message: 'Mission not found' });
    const result = await generateMissionBrief(id, req.user?.id);
    if (!result) return res.status(404).json({ message: 'Mission not found' });
    res.json(result);
  } catch (err) {
    console.error('Error generating mission AI brief:', err);
    res.status(500).json({ message: err.message || 'Failed to generate brief' });
  }
});

/**
 * POST /api/abm/missions/:id/activities
 */
router.post('/:id/activities', requireInternalUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'note', body, meta_json } = req.body;
    if (!body) return res.status(400).json({ message: 'body is required' });
    const activity = await MissionActivity.create({
      mission_id: id,
      type,
      body,
      meta_json: meta_json || null,
      created_by_user_id: req.user?.id,
    });
    await Mission.update({ last_activity_at: new Date() }, { where: { id } });
    res.status(201).json(activity);
  } catch (err) {
    console.error('Error adding activity:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
