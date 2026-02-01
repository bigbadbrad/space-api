/**
 * Phase 2 MVP Step 7: Recompute account intent (daily batch job)
 * - Pulls aggregates from PostHog (or intent_signals as fallback)
 * - Computes daily snapshot for today
 * - Upserts prospect_companies + daily_account_intent
 * Idempotent per date.
 */

require('dotenv').config();
const { Op } = require('sequelize');
const {
  ProspectCompany,
  DailyAccountIntent,
  IntentSignal,
  LeadRequest,
} = require('../../models');
const registry = require('../registry');
const scoring = require('../scoring');
const { buildWhyHot, buildKeyEventsJson } = require('../scoring/whyHot');

let posthogClient;
try {
  posthogClient = require('../posthog/client');
} catch {
  posthogClient = null;
}

/**
 * Apply event rules to infer content_type and lane from path/event
 */
function applyEventRules(path, eventName, rules) {
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
      return {
        content_type: r.content_type || 'other',
        lane: r.lane || 'other',
        weight_override: r.weight_override,
      };
    }
  }
  return { content_type: 'other', lane: 'other', weight_override: null };
}

/**
 * Build events from intent_signals (fallback when PostHog not configured)
 */
async function getEventsFromIntentSignals() {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const signals = await IntentSignal.findAll({
    where: { occurred_at: { [Op.gte]: since } },
    include: [{ model: ProspectCompany, as: 'prospectCompany', required: true }],
  });

  const byAccount = {};
  for (const s of signals) {
    const domain = s.prospectCompany?.domain;
    if (!domain) continue;
    if (!byAccount[domain]) byAccount[domain] = [];
    const ageDays = (Date.now() - new Date(s.occurred_at)) / (24 * 60 * 60 * 1000);
    byAccount[domain].push({
      event_name: s.signal_type || 'page_view',
      content_type: s.topic || 'other',
      lane: s.service_lane || 'other',
      weight: s.weight || 1,
      ageDays,
      timestamp: s.occurred_at,
    });
  }
  return byAccount;
}

/**
 * Build events from PostHog fetch + event rules
 */
async function getEventsFromPostHog() {
  if (!posthogClient) return {};
  const rules = await registry.getEventRules();

  let rows;
  try {
    rows = await posthogClient.fetchEventsForAbm(30);
  } catch (err) {
    console.warn('PostHog fetch failed, using intent_signals fallback:', err.message);
    return getEventsFromIntentSignals();
  }

  const byAccount = {};
  const now = Date.now();
  for (const r of rows || []) {
    const arr = Array.isArray(r) ? r : [r.date, r.account_key, r.event, r.content_type, r.lane, r.distinct_id, r.pathname, r.timestamp];
    const accountKey = (arr[1] || '').toString().trim().toLowerCase();
    if (!accountKey) continue;
    const path = arr[6] || r.pathname || r.$current_url || '';
    const eventName = ((arr[2] || 'page_view') + '').replace('$pageview', 'page_view');
    const { content_type, lane, weight_override } = applyEventRules(path, eventName, rules);

    const ts = (arr[7] || arr[6]) ? new Date(arr[7] || arr[6]) : new Date(r.timestamp || Date.now());
    const ageDays = (now - ts.getTime()) / (24 * 60 * 60 * 1000);

    if (!byAccount[accountKey]) byAccount[accountKey] = [];
    byAccount[accountKey].push({
      event_name: eventName,
      content_type: arr[3] || content_type,
      lane: arr[4] || lane,
      distinct_id: arr[5],
      weight_override,
      ageDays,
      timestamp: ts,
    });
  }
  return byAccount;
}

/**
 * Compute key events counts for why_hot
 */
function computeKeyEventsCounts(events7d) {
  const counts = {};
  for (const e of events7d || []) {
    let key;
    if (e.event_name === 'page_view') key = `${e.content_type || 'other'}_page_view`;
    else if (e.event_name === 'cta_click' && e.cta_id) key = `cta_click_${e.cta_id}`;
    else key = e.event_name || 'other';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/**
 * Main job entry
 */
async function runRecomputeIntentJob() {
  const config = await registry.getActiveScoreConfig();
  if (!config) throw new Error('No active score config');

  const weightsMap = await registry.getWeightsMap(config.id);
  const configJson = config.toJSON ? config.toJSON() : config;

  let byAccount;
  if (process.env.POSTHOG_API_KEY) {
    byAccount = await getEventsFromPostHog();
  } else {
    byAccount = await getEventsFromIntentSignals();
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [accountKey, events] of Object.entries(byAccount)) {
    if (!accountKey) continue;

    let prospect = await ProspectCompany.findOne({ where: { domain: accountKey } });
    if (!prospect) {
      prospect = await ProspectCompany.create({
        name: accountKey.replace(/\.[^.]+$/, '').replace(/\./g, ' '),
        domain: accountKey,
        intent_score: 0,
      });
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const events7d = events.filter((e) => e.ageDays < 7);
    const eventsPrev7d = events.filter((e) => e.ageDays >= 7 && e.ageDays < 14);
    const events30d = events.filter((e) => e.ageDays < 30);

    const keyEventsCounts = computeKeyEventsCounts(events7d);
    const events7dWithWeight = events7d.map((e) => ({
      ...e,
      weight: e.weight_override ?? scoring.getWeight(weightsMap, e.event_name, e.content_type, e.cta_id),
    }));
    const eventsPrev7dWithWeight = eventsPrev7d.map((e) => ({
      ...e,
      weight: e.weight_override ?? scoring.getWeight(weightsMap, e.event_name, e.content_type, e.cta_id),
    }));
    const events30dWithWeight = events30d.map((e) => ({
      ...e,
      weight: e.weight_override ?? scoring.getWeight(weightsMap, e.event_name, e.content_type, e.cta_id),
    }));

    const result = scoring.computeFullScore({
      weightsMap,
      config: configJson,
      events7d: events7dWithWeight,
      eventsPrev7d: eventsPrev7dWithWeight,
      events30d: events30dWithWeight,
      keyEventsCounts,
    });

    const uniquePeople7d = new Set(events7d.map((e) => e.distinct_id || '')).size || 0;

    let dai = await DailyAccountIntent.findOne({
      where: { prospect_company_id: prospect.id, date: today },
    });
    const daiData = {
      score_config_id: config.id,
      raw_score_7d: result.raw_7d,
      raw_score_prev_7d: result.raw_prev_7d,
      raw_score_30d: result.raw_30d,
      intent_score: result.intent_score,
      intent_stage: result.intent_stage,
      surge_ratio: result.surge_ratio,
      surge_level: result.surge_level,
      unique_people_7d: uniquePeople7d,
      top_lane: result.top_lane,
      lane_scores_7d_json: result.lane_scores_7d_json,
      lane_scores_30d_json: result.lane_scores_30d_json,
      key_events_7d_json: keyEventsCounts,
      top_categories_7d_json: keyEventsCounts,
    };
    if (dai) {
      await dai.update(daiData);
    } else {
      await DailyAccountIntent.create({
        prospect_company_id: prospect.id,
        date: today,
        ...daiData,
      });
    }

    await prospect.update({
      intent_score: result.intent_score,
      intent_stage: result.intent_stage,
      surge_level: result.surge_level,
      top_lane: result.top_lane,
      last_seen_at: events.length ? new Date(Math.max(...events.map((e) => new Date(e.timestamp)))) : null,
      score_updated_at: new Date(),
      score_7d_raw: result.raw_7d,
      score_30d_raw: result.raw_30d,
    });
  }

  return { accountsProcessed: Object.keys(byAccount).length };
}

module.exports = { runRecomputeIntentJob };
