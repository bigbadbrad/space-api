/**
 * Phase 2 MVP Step 10: AI Account Summary generation + caching
 */
const OpenAI = require('openai');
const registry = require('../abm/registry');
const { ProspectCompany, DailyAccountIntent, Contact, AccountAiSummary } = require('../models');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

async function generateAccountSummary(prospectCompanyId) {
  const prospect = await ProspectCompany.findByPk(prospectCompanyId, {
    include: [{ model: Contact, as: 'contacts', attributes: ['email', 'first_name', 'last_name', 'title'] }],
  });
  if (!prospect) return null;

  const latestDai = await DailyAccountIntent.findOne({
    where: { prospect_company_id: prospectCompanyId },
    order: [['date', 'DESC']],
  });

  const topLane = latestDai?.top_lane || prospect.top_lane || 'other';
  const intentScore = latestDai?.intent_score ?? prospect.intent_score ?? 0;
  const surgeLevel = latestDai?.surge_level || prospect.surge_level || 'Normal';

  const template = await registry.getPromptTemplate({
    lane: topLane,
    persona: '*',
    intent_stage: latestDai?.intent_stage || (intentScore >= 70 ? 'Hot' : intentScore >= 35 ? 'Warm' : 'Cold'),
  });
  if (!template) throw new Error('No prompt template found');

  const inputJson = {
    account: {
      id: prospect.id,
      name: prospect.name,
      domain: prospect.domain,
    },
    intent_score: intentScore,
    intent_stage: latestDai?.intent_stage,
    surge_level: surgeLevel,
    top_lane: topLane,
    lane_scores: latestDai?.lane_scores_7d_json || {},
    key_events: latestDai?.key_events_7d_json || {},
    known_people: (prospect.contacts || []).map((c) => ({
      email: c.email,
      name: [c.first_name, c.last_name].filter(Boolean).join(' '),
      title: c.title,
    })),
  };

  const userPrompt = template.user_prompt_template
    .replace(/\{\{JSON_HERE\}\}/g, JSON.stringify(inputJson, null, 2))
    .replace(/\{\{MAX_WORDS\}\}/g, String(template.max_words || 180));

  const res = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: template.system_prompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 800,
    temperature: 0.5,
  });

  const summaryMd = res.choices[0]?.message?.content?.trim() || '';

  const cacheDate = new Date().toISOString().slice(0, 10);
  let summary = await AccountAiSummary.findOne({
    where: { prospect_company_id: prospectCompanyId, cache_date: cacheDate, top_lane: topLane },
  });
  const data = {
    intent_score: intentScore,
    surge_level: surgeLevel,
    prompt_template_id: template.id,
    input_json: inputJson,
    summary_md: summaryMd,
    model: AI_MODEL,
  };
  if (summary) {
    await summary.update(data);
  } else {
    await AccountAiSummary.create({
      prospect_company_id: prospectCompanyId,
      cache_date: cacheDate,
      top_lane: topLane,
      ...data,
    });
  }

  return {
    summary_md: summaryMd,
    cache_date: cacheDate,
    top_lane: topLane,
  };
}

async function getOrGenerateSummary(prospectCompanyId, forceRegenerate = false) {
  const prospect = await ProspectCompany.findByPk(prospectCompanyId);
  if (!prospect) return null;

  const latestDai = await DailyAccountIntent.findOne({
    where: { prospect_company_id: prospectCompanyId },
    order: [['date', 'DESC']],
  });
  const topLane = latestDai?.top_lane || prospect.top_lane || 'other';
  const cacheDate = new Date().toISOString().slice(0, 10);

  const cached = await AccountAiSummary.findOne({
    where: {
      prospect_company_id: prospectCompanyId,
      cache_date: cacheDate,
      top_lane: topLane,
    },
  });

  if (cached && !forceRegenerate) {
    const intentScore = latestDai?.intent_score ?? prospect.intent_score ?? 0;
    const surgeLevel = latestDai?.surge_level || prospect.surge_level || 'Normal';
    const scoreDiff = Math.abs(intentScore - (cached.intent_score || 0));
    const surgeChanged = cached.surge_level !== surgeLevel;
    if (scoreDiff < 10 && !surgeChanged) {
      return { summary_md: cached.summary_md, cache_date: cached.cache_date, top_lane: cached.top_lane, cached: true };
    }
  }

  return generateAccountSummary(prospectCompanyId);
}

module.exports = { generateAccountSummary, getOrGenerateSummary };
