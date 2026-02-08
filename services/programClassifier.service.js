/**
 * ABM Procurement Addendum: Program Intelligence – rules-based classifier
 * Uses abm_agency_blacklist, abm_program_rules (positive), abm_program_suppression_rules (negative).
 * Returns { service_lane, topic, relevance_score, match_confidence, match_reasons_json, suppressed, suppressed_reason }.
 */
const { AbmProgramRule, AbmProgramSuppressionRule, AbmAgencyBlacklist } = require('../models');

const TTL_MS = 5 * 60 * 1000; // 5 minutes
let positiveRulesCache = null;
let positiveRulesCacheTime = 0;
let suppressionRulesCache = null;
let suppressionRulesCacheTime = 0;
let agencyBlacklistCache = null;
let agencyBlacklistCacheTime = 0;

const RELEVANT_THRESHOLD = 35;
const HIGHLY_RELEVANT_THRESHOLD = 60;
const CONFIDENCE_DIVISOR = 80;

function toSearchableString(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function getProgramFields(program) {
  const title = toSearchableString(program.title).toLowerCase();
  const summary = toSearchableString(program.summary).toLowerCase();
  const agency = toSearchableString(program.agency).toLowerCase();
  const naics = toSearchableString(program.naics).toLowerCase();
  const psc = toSearchableString(program.psc).toLowerCase();
  const url = toSearchableString(program.url).toLowerCase();
  const all = [title, summary, agency, naics, psc].join(' ').toLowerCase();

  return {
    title,
    summary,
    agency,
    naics,
    psc,
    url,
    '*': all,
  };
}

function ruleMatches(rule, fields, matchField, matchType, matchValue) {
  const fieldKey = matchField || 'title';
  const haystack = fieldKey === '*' ? fields['*'] : (fields[fieldKey] ?? '');
  if (!haystack) return false;

  const value = (matchValue || '').toLowerCase();
  if (!value) return false;

  switch (matchType) {
    case 'contains':
      if (value.includes('|')) {
        const parts = value.split('|').map((p) => p.trim()).filter(Boolean);
        return parts.some((p) => haystack.includes(p));
      }
      return haystack.includes(value);
    case 'equals':
      return haystack === value;
    case 'regex': {
      try {
        return new RegExp(matchValue, 'i').test(haystack);
      } catch {
        return false;
      }
    }
    default:
      return haystack.includes(value);
  }
}

/**
 * For regex match_value with pipe-separated alternatives (e.g. "HVAC|plumbing|actuator")
 * we match if ANY of the alternatives matches.
 */
function suppressionRuleMatches(rule, fields) {
  const matchField = rule.match_field || '*';
  const matchType = rule.match_type || 'contains';
  const matchValue = rule.match_value || '';

  if (matchType === 'regex') {
    try {
      const re = new RegExp(matchValue, 'i');
      const haystack = matchField === '*' ? fields['*'] : (fields[matchField] ?? '');
      return re.test(haystack);
    } catch {
      return false;
    }
  }

  // For "contains" with pipe-separated values, check each
  if (matchType === 'contains' && matchValue.includes('|')) {
    const haystack = matchField === '*' ? fields['*'] : (fields[matchField] ?? '');
    const parts = matchValue.split('|').map((p) => p.trim().toLowerCase()).filter(Boolean);
    return parts.some((p) => haystack.includes(p));
  }

  return ruleMatches(rule, fields, rule.match_field, rule.match_type, rule.match_value);
}

async function getPositiveRules() {
  if (positiveRulesCache && Date.now() - positiveRulesCacheTime < TTL_MS) {
    return positiveRulesCache;
  }
  const rules = await AbmProgramRule.findAll({
    where: { enabled: true },
    order: [['priority', 'DESC']],
  });
  positiveRulesCache = rules;
  positiveRulesCacheTime = Date.now();
  return rules;
}

async function getSuppressionRules() {
  if (suppressionRulesCache && Date.now() - suppressionRulesCacheTime < TTL_MS) {
    return suppressionRulesCache;
  }
  const rules = await AbmProgramSuppressionRule.findAll({
    where: { enabled: true },
    order: [['priority', 'DESC']],
  });
  suppressionRulesCache = rules;
  suppressionRulesCacheTime = Date.now();
  return rules;
}

async function getAgencyBlacklist() {
  if (agencyBlacklistCache && Date.now() - agencyBlacklistCacheTime < TTL_MS) {
    return agencyBlacklistCache;
  }
  const entries = await AbmAgencyBlacklist.findAll({
    where: { enabled: true },
    attributes: ['id', 'agency_pattern', 'notes'],
  });
  agencyBlacklistCache = entries;
  agencyBlacklistCacheTime = Date.now();
  return entries;
}

/**
 * Classify a program. Returns object suitable for upsert onto ProcurementProgram.
 */
async function classifyProgram(program) {
  const fields = getProgramFields(program);
  const reasons = [];
  let relevanceScore = 0;
  let serviceLane = null;
  let topic = null;
  let suppressed = false;
  let suppressedReason = null;

  // 0) Check agency blacklist first
  const agencyBlacklist = await getAgencyBlacklist();
  const agencyText = fields.agency || '';
  for (const entry of agencyBlacklist) {
    const pattern = (entry.agency_pattern || '').toLowerCase();
    if (pattern && agencyText.includes(pattern)) {
      suppressed = true;
      suppressedReason = entry.notes || `Agency blacklisted: ${entry.agency_pattern}`;
      return {
        service_lane: null,
        topic: null,
        relevance_score: 0,
        match_confidence: 0,
        match_reasons_json: [{ type: 'agency_blacklist', rule_id: entry.id, reason: suppressedReason }],
        classification_version: 'v1',
        suppressed: true,
        suppressed_reason: suppressedReason,
      };
    }
  }

  // 1) Apply suppression rules
  const suppressionRules = await getSuppressionRules();
  for (const rule of suppressionRules) {
    if (suppressionRuleMatches(rule, fields)) {
      if (rule.suppress_score_threshold != null && relevanceScore < rule.suppress_score_threshold) {
        continue; // conditional: only suppress if score already above threshold
      }
      suppressed = true;
      suppressedReason = rule.suppress_reason || 'Matched suppression rule';
      return {
        service_lane: null,
        topic: null,
        relevance_score: 0,
        match_confidence: 0,
        match_reasons_json: [{ type: 'suppression', rule_id: rule.id, reason: suppressedReason }],
        classification_version: 'v1',
        suppressed: true,
        suppressed_reason: suppressedReason,
      };
    }
  }

  // 2) Apply positive rules
  const positiveRules = await getPositiveRules();
  for (const rule of positiveRules) {
    const matches = ruleMatches(rule, fields, rule.match_field, rule.match_type, rule.match_value);
    if (matches) {
      const addScore = rule.add_score ?? 20;
      relevanceScore += addScore;
      if (!serviceLane || (rule.priority > 0)) {
        serviceLane = rule.service_lane || serviceLane;
        topic = rule.topic || topic;
      }
      const label = rule.notes || `Matched '${(rule.match_value || '').slice(0, 50)}'`;
      reasons.push({
        type: 'rule',
        rule_id: rule.id,
        label,
        add_score: addScore,
        weight: addScore,
      });
    }
  }

  // 3) Normalize
  relevanceScore = Math.min(100, Math.max(0, relevanceScore));
  const matchConfidence = Math.min(1, relevanceScore / CONFIDENCE_DIVISOR);

  return {
    service_lane: serviceLane,
    topic,
    relevance_score: relevanceScore,
    match_confidence: matchConfidence,
    match_reasons_json: reasons,
    classification_version: 'v1',
    suppressed: false,
    suppressed_reason: null,
  };
}

function invalidateCache() {
  positiveRulesCache = null;
  positiveRulesCacheTime = 0;
  suppressionRulesCache = null;
  suppressionRulesCacheTime = 0;
  agencyBlacklistCache = null;
  agencyBlacklistCacheTime = 0;
}

module.exports = {
  classifyProgram,
  invalidateCache,
  RELEVANT_THRESHOLD,
  HIGHLY_RELEVANT_THRESHOLD,
};
