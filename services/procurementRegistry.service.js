/**
 * ABM Rev 3: Registry loader for procurement classification
 * Caches abm_topic_rules and abm_source_weights with TTL.
 * Used by: procurement import job, scoring job, AI summaries.
 */
const { AbmTopicRule, AbmSourceWeight } = require('../models');

const TTL_MS = 5 * 60 * 1000; // 5 minutes

let topicRulesCache = null;
let topicRulesCacheTime = 0;
let sourceWeightsCache = null;
let sourceWeightsCacheTime = 0;

/**
 * Load topic rules from DB (or cache)
 */
async function getTopicRules() {
  if (topicRulesCache && Date.now() - topicRulesCacheTime < TTL_MS) {
    return topicRulesCache;
  }
  const rules = await AbmTopicRule.findAll({
    where: { enabled: true },
    order: [['priority', 'DESC']],
  });
  topicRulesCache = rules;
  topicRulesCacheTime = Date.now();
  return rules;
}

/**
 * Load source weights from DB (or cache)
 */
async function getSourceWeights() {
  if (sourceWeightsCache && Date.now() - sourceWeightsCacheTime < TTL_MS) {
    return sourceWeightsCache;
  }
  const weights = await AbmSourceWeight.findAll({
    where: { enabled: true },
  });
  sourceWeightsCache = Object.fromEntries(weights.map((w) => [w.source, w.multiplier]));
  sourceWeightsCacheTime = Date.now();
  return sourceWeightsCache;
}

/**
 * Get source multiplier (default 1.0)
 */
async function getSourceMultiplier(source) {
  const weights = await getSourceWeights();
  return weights[source] ?? 1.0;
}

/**
 * Build field value map from program for matching
 */
function getProgramFields(program) {
  return {
    title: (program.title || '').toLowerCase(),
    summary: (program.summary || '').toLowerCase(),
    naics: (program.naics || '').toLowerCase(),
    psc: (program.psc || '').toLowerCase(),
    agency: (program.agency || '').toLowerCase(),
    office: (program.office || '').toLowerCase(),
    '*': [
      (program.title || ''),
      (program.summary || ''),
      (program.naics || ''),
      (program.agency || ''),
    ].join(' ').toLowerCase(),
  };
}

/**
 * Check if a rule matches the program
 */
function ruleMatches(rule, fields, programSource) {
  if (rule.source && rule.source !== '*' && rule.source !== programSource) {
    return false;
  }
  const fieldKey = rule.match_field || 'title';
  const matchValue = (rule.match_value || '').toLowerCase();
  let haystack;
  if (fieldKey === '*') {
    haystack = fields['*'];
  } else {
    haystack = fields[fieldKey] ?? '';
  }
  if (!haystack) return false;

  switch (rule.match_type) {
    case 'contains':
      return haystack.includes(matchValue);
    case 'equals':
      return haystack === matchValue;
    case 'regex': {
      try {
        const re = new RegExp(rule.match_value, 'i');
        return re.test(haystack);
      } catch {
        return false;
      }
    }
    default:
      return haystack.includes(matchValue);
  }
}

/**
 * Classify a program using topic rules.
 * Returns { service_lane, topic, weight, matched_rule_id }.
 * Higher priority rules win. First match wins for a given priority tier.
 */
async function classifyProgram(program, programSource = 'sam_opportunity') {
  const rules = await getTopicRules();
  const fields = getProgramFields(program);

  for (const rule of rules) {
    if (ruleMatches(rule, fields, programSource)) {
      let weight = rule.weight ?? 1;
      const multiplier = await getSourceMultiplier(programSource);
      weight = Math.round(weight * multiplier);

      return {
        service_lane: rule.service_lane || null,
        topic: rule.topic || null,
        weight,
        matched_rule_id: rule.id,
      };
    }
  }

  const multiplier = await getSourceMultiplier(programSource);
  return {
    service_lane: null,
    topic: null,
    weight: Math.round(1 * multiplier),
    matched_rule_id: null,
  };
}

/**
 * Invalidate cache (call after admin updates topic rules or source weights)
 */
function invalidateCache() {
  topicRulesCache = null;
  topicRulesCacheTime = 0;
  sourceWeightsCache = null;
  sourceWeightsCacheTime = 0;
}

module.exports = {
  getTopicRules,
  getSourceWeights,
  getSourceMultiplier,
  classifyProgram,
  invalidateCache,
};
