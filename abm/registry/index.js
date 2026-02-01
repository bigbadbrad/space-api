/**
 * Phase 2 MVP Step 5: ABM Registry Loader
 * In-memory cache with 60s TTL. Loads config, weights, event rules, prompt templates.
 */
const { Op } = require('sequelize');
const { AbmScoreConfig, AbmScoreWeight, AbmEventRule, AbmPromptTemplate } = require('../../models');

const CACHE_TTL_MS = 60 * 1000;
const cache = {
  scoreConfig: { data: null, expiresAt: 0 },
  weights: {}, // scoreConfigId -> { data, expiresAt }
  eventRules: {}, // scoreConfigId ?? 'all' -> { data, expiresAt }
  promptTemplates: {}, // key(lane,persona,stage) -> { data, expiresAt }
};

function isExpired(entry) {
  return !entry || Date.now() > entry.expiresAt;
}

function getCacheKey(lane, persona, stage) {
  return `${lane || '*'}|${persona || '*'}|${stage || '*'}`;
}

/**
 * Get the active score config (status = 'active')
 */
async function getActiveScoreConfig() {
  if (isExpired(cache.scoreConfig)) {
    const config = await AbmScoreConfig.findOne({
      where: { status: 'active' },
      order: [['created_at', 'ASC']],
    });
    cache.scoreConfig = { data: config, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return cache.scoreConfig.data;
}

/**
 * Get weights map for a score config.
 * Returns Map-like object: key = `${event_name}:${content_type||''}:${cta_id||''}`, value = weight
 */
async function getWeightsMap(scoreConfigId) {
  if (!scoreConfigId) {
    const config = await getActiveScoreConfig();
    scoreConfigId = config?.id;
  }
  if (!scoreConfigId) return {};

  const key = scoreConfigId;
  if (isExpired(cache.weights[key])) {
    const rows = await AbmScoreWeight.findAll({
      where: { score_config_id: scoreConfigId },
    });
    const map = {};
    for (const r of rows) {
      const k = `${r.event_name}:${r.content_type || ''}:${r.cta_id || ''}`;
      map[k] = r.weight;
    }
    cache.weights[key] = { data: map, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return cache.weights[key].data;
}

/**
 * Get event rules, optionally scoped to a score config.
 * Returns rules sorted by priority ascending (first match wins).
 */
async function getEventRules(scoreConfigId = null) {
  const key = scoreConfigId || 'all';
  if (isExpired(cache.eventRules[key])) {
    const orConditions = [{ score_config_id: null }];
    if (scoreConfigId) orConditions.push({ score_config_id: scoreConfigId });
    const where = { enabled: true, [Op.or]: orConditions };
    const rules = await AbmEventRule.findAll({
      where,
      order: [['priority', 'ASC']],
    });
    cache.eventRules[key] = { data: rules, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return cache.eventRules[key].data;
}

/**
 * Get prompt template by lane, persona, intent_stage.
 * Selection precedence (Appendix B):
 * 1) lane + persona + stage
 * 2) lane + persona + wildcard
 * 3) lane + wildcard + stage
 * 4) wildcard + persona + stage
 * 5) wildcard/wildcard/wildcard fallback
 */
async function getPromptTemplate({ lane, persona, intent_stage }) {
  const candidates = [
    [lane, persona, intent_stage],
    [lane, persona, '*'],
    [lane, '*', intent_stage],
    ['*', persona, intent_stage],
    ['*', '*', '*'],
  ];
  for (const [l, p, s] of candidates) {
    const key = getCacheKey(l, p, s);
    if (isExpired(cache.promptTemplates[key])) {
      const t = await AbmPromptTemplate.findOne({
        where: {
          enabled: true,
          lane: l || '*',
          persona: p || '*',
          intent_stage: s || '*',
        },
      });
      cache.promptTemplates[key] = { data: t, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    const t = cache.promptTemplates[key].data;
    if (t) return t;
  }
  return null;
}

/**
 * Invalidate cache (e.g. when admin updates registry)
 */
function invalidateCache() {
  cache.scoreConfig = { data: null, expiresAt: 0 };
  cache.weights = {};
  cache.eventRules = {};
  cache.promptTemplates = {};
}

module.exports = {
  getActiveScoreConfig,
  getWeightsMap,
  getEventRules,
  getPromptTemplate,
  invalidateCache,
};
