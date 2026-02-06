/**
 * ABM Rev 2: AI Mission Brief generation
 * Similar to account summary but focused on opportunity, what's missing, next steps.
 */
const OpenAI = require('openai');
const registry = require('../abm/registry');
const {
  Mission,
  MissionActivity,
  ProspectCompany,
  Contact,
  LeadRequest,
  IntentSignal,
  DailyAccountIntent,
} = require('../models');
const { Op } = require('sequelize');

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

async function generateMissionBrief(missionId, userId = null) {
  const mission = await Mission.findByPk(missionId, {
    include: [
      { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
      { model: Contact, as: 'primaryContact', attributes: ['id', 'email', 'first_name', 'last_name', 'title'] },
      { model: LeadRequest, as: 'leadRequest', attributes: ['id', 'organization_name', 'service_needed', 'created_at', 'payload_json'] },
      { model: MissionActivity, as: 'activities', attributes: ['id', 'type', 'body', 'created_at'], order: [['created_at', 'DESC']], limit: 10 },
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

  const inputJson = {
    mission: {
      id: mission.id,
      title: mission.title,
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
      stage: mission.stage,
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
    recent_activities: (mission.activities || []).slice(0, 5).map((a) => ({ type: a.type, body: a.body?.slice(0, 200), created_at: a.created_at })),
  };

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

  await MissionActivity.create({
    mission_id: missionId,
    type: 'ai_brief',
    body: summaryMd,
    meta_json: { model: AI_MODEL, prompt_template_id: template?.id || null },
    created_by_user_id: userId,
  });

  await Mission.update({ last_activity_at: new Date() }, { where: { id: missionId } });

  return { summary_md: summaryMd, cached: false };
}

module.exports = { generateMissionBrief };
