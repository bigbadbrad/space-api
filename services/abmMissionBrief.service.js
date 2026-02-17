/**
 * ABM Rev 2/3: AI Mission Brief generation with caching in mission_artifacts.
 */
const crypto = require('crypto');
const OpenAI = require('openai');
const registry = require('../abm/registry');
const {
  Mission,
  MissionArtifact,
  MissionTask,
  ProspectCompany,
  Contact,
  LeadRequest,
  IntentSignal,
  DailyAccountIntent,
} = require('../models');
const { Op } = require('sequelize');
const { logMissionActivity } = require('../utils/missionActivity');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

const FALLBACK_SYSTEM = `You are a space/defense sales operations analyst. Given a mission (procurement opportunity) summary, produce a concise brief (max 250 words) covering:
1. **Opportunity summary** - What is this mission about, who is the customer, what do they need?
2. **What we know** - Key facts from the brief (orbit, schedule, budget, readiness, etc.)
3. **Gaps / What's missing** - What information would help qualify or advance this opportunity?
4. **Recommended next steps** - 2-3 concrete actions the owner should take.

Be specific and actionable. Use markdown.`;

const FALLBACK_USER = `Generate a mission brief for this opportunity. Input data:
{{JSON_HERE}}

Produce a concise brief (max 250 words) covering: opportunity summary, what we know, gaps/what's missing, recommended next steps.`;

function inputHash(inputJson) {
  return crypto.createHash('sha256').update(JSON.stringify(inputJson)).digest('hex');
}

const BRIEF_MAX_AGE_DAYS = 7;

async function generateMissionBrief(missionId, userId = null) {
  const mission = await Mission.findByPk(missionId, {
    include: [
      { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
      { model: Contact, as: 'primaryContact', attributes: ['id', 'email', 'first_name', 'last_name', 'title'] },
      { model: LeadRequest, as: 'leadRequest', attributes: ['id', 'organization_name', 'service_needed', 'created_at', 'payload_json'] },
      { model: MissionTask, as: 'tasks', where: { status: 'open' }, required: false, attributes: ['id', 'title', 'due_at'], order: [['due_at', 'ASC']], limit: 3 },
    ],
  });
  if (!mission) return null;

  const pcId = mission.prospect_company_id;
  let accountSummary = null;
  let recentSignals = [];

  if (pcId) {
    const dai = await DailyAccountIntent.findOne({
      where: { prospect_company_id: pcId },
      order: [['date', 'DESC']],
    });
    if (dai) {
      accountSummary = {
        intent_score: dai.intent_score,
        intent_stage: dai.intent_stage,
        surge_level: dai.surge_level,
        top_lane: dai.top_lane,
      };
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    recentSignals = await IntentSignal.findAll({
      where: {
        prospect_company_id: pcId,
        occurred_at: { [Op.gte]: thirtyDaysAgo },
        ...(mission.service_lane ? { service_lane: mission.service_lane } : {}),
      },
      order: [['occurred_at', 'DESC']],
      limit: 15,
      attributes: ['event_name', 'occurred_at', 'content_type'],
    });
  }

  const nextTasks = (mission.tasks || []).slice(0, 3).map((t) => ({ title: t.title, due_at: t.due_at }));

  const inputJson = {
    mission: {
      id: mission.id,
      title: mission.title,
      stage: mission.stage,
      service_lane: mission.service_lane,
      mission_type: mission.mission_type,
      mission_pattern: mission.mission_pattern,
      target_orbit: mission.target_orbit,
      payload_mass_kg: mission.payload_mass_kg,
      earliest_date: mission.earliest_date,
      latest_date: mission.latest_date,
      schedule_urgency: mission.schedule_urgency,
      integration_status: mission.integration_status,
      readiness_confidence: mission.readiness_confidence,
      funding_status: mission.funding_status,
      budget_band: mission.budget_band,
      priority: mission.priority,
      confidence: mission.confidence,
      next_step: mission.next_step,
      next_step_due_at: mission.next_step_due_at,
    },
    account: mission.prospectCompany ? { name: mission.prospectCompany.name, domain: mission.prospectCompany.domain } : null,
    primary_contact: mission.primaryContact ? {
      name: [mission.primaryContact.first_name, mission.primaryContact.last_name].filter(Boolean).join(' '),
      email: mission.primaryContact.email,
      title: mission.primaryContact.title,
    } : null,
    lead_request: mission.leadRequest ? {
      organization_name: mission.leadRequest.organization_name,
      service_needed: mission.leadRequest.service_needed,
      created_at: mission.leadRequest.created_at,
    } : null,
    account_summary: accountSummary,
    recent_signals: recentSignals.map((s) => ({ event_name: s.event_name, occurred_at: s.occurred_at, content_type: s.content_type })),
    next_tasks: nextTasks,
  };

  const hash = inputHash(inputJson);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BRIEF_MAX_AGE_DAYS);
  const cached = await MissionArtifact.findOne({
    where: {
      mission_id: missionId,
      type: 'mission_brief',
      input_hash: hash,
      created_at: { [Op.gte]: cutoff },
    },
    order: [['created_at', 'DESC']],
  });
  if (cached && cached.content_md) {
    return { summary_md: cached.content_md, cached: true, artifact_id: cached.id };
  }

  const template = await registry.getPromptTemplate({
    lane: mission.service_lane || '*',
    persona: 'mission',
    intent_stage: '*',
  });

  const systemPrompt = template?.system_prompt || FALLBACK_SYSTEM;
  const userPrompt = (template?.user_prompt_template || FALLBACK_USER)
    .replace(/\{\{JSON_HERE\}\}/g, JSON.stringify(inputJson, null, 2))
    .replace(/\{\{MAX_WORDS\}\}/g, '250');

  const res = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 800,
    temperature: 0.5,
  });

  const summaryMd = res.choices[0]?.message?.content?.trim() || '';

  await MissionArtifact.create({
    mission_id: missionId,
    type: 'mission_brief',
    content_md: summaryMd,
    input_hash: hash,
    model_name: AI_MODEL,
    created_by_user_id: userId,
  });

  await logMissionActivity(missionId, 'brief_generated', { model: AI_MODEL, input_hash: hash }, userId);
  await Mission.update({ last_activity_at: new Date() }, { where: { id: missionId } });

  return { summary_md: summaryMd, cached: false };
}

module.exports = { generateMissionBrief };
