/**
 * Phase 2 MVP: Scoring engine - aggregates all scoring modules
 * Given synthetic events, produces: raw_30d, intent_score, stage, surge, top_lane, why_hot
 */

const { decay, contribution } = require('./decay');
const { normalize } = require('./normalize');
const { classifyStage } = require('./stage');
const { classifySurge } = require('./surge');
const { buildWhyHot, buildKeyEventsJson } = require('./whyHot');
const { getWeight } = require('./weights');

/**
 * Compute raw scores with decay for events in windows
 * @param {Array<{weight: number, ageDays: number}>} events7d - Events 0-7 days
 * @param {Array<{weight: number, ageDays: number}>} eventsPrev7d - Events 7-14 days
 * @param {Array<{weight: number, ageDays: number}>} events30d - Events 0-30 days
 * @param {number} lambdaDecay
 * @returns {{ raw_7d, raw_prev_7d, raw_30d }}
 */
function computeRawScores(events7d, eventsPrev7d, events30d, lambdaDecay = 0.1) {
  const sum = (arr) => arr.reduce((s, e) => s + contribution(e.weight, e.ageDays, lambdaDecay), 0);
  return {
    raw_7d: sum(events7d || []),
    raw_prev_7d: sum(eventsPrev7d || []),
    raw_30d: sum(events30d || []),
  };
}

/**
 * Compute lane scores from events with lane property
 * @param {Array<{weight: number, ageDays: number, lane?: string}>} events7d
 * @param {Array<{weight: number, ageDays: number, lane?: string}>} events30d
 * @param {number} lambdaDecay
 * @returns {{ lane_scores_7d: object, lane_scores_30d: object }}
 */
function computeLaneScores(events7d, events30d, lambdaDecay = 0.1) {
  const byLane = (arr) => {
    const lanes = {};
    for (const e of arr || []) {
      const lane = e.lane || 'other';
      lanes[lane] = (lanes[lane] || 0) + contribution(e.weight, e.ageDays, lambdaDecay);
    }
    return lanes;
  };
  return {
    lane_scores_7d: byLane(events7d),
    lane_scores_30d: byLane(events30d),
  };
}

/**
 * Get top lane from lane_scores_7d (argmax)
 */
function getTopLane(laneScores7d) {
  if (!laneScores7d || Object.keys(laneScores7d).length === 0) return 'other';
  return Object.entries(laneScores7d).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Full score computation from events
 * @param {object} params
 * @param {object} params.weightsMap
 * @param {object} params.config - score config (lambda_decay, normalize_k, cold_max, warm_max, etc.)
 * @param {Array} params.events7d - [{ event_name, content_type, cta_id, lane, ageDays }]
 * @param {Array} params.eventsPrev7d
 * @param {Array} params.events30d
 * @param {object} params.keyEventsCounts - for why_hot
 */
function computeFullScore({ weightsMap, config, events7d, eventsPrev7d, events30d, keyEventsCounts }) {
  const lambdaDecay = Number(config?.lambda_decay ?? 0.1);
  const normalizeK = Number(config?.normalize_k ?? 80);

  const addWeight = (ev) => ({
    ...ev,
    weight: getWeight(weightsMap, ev.event_name, ev.content_type, ev.cta_id),
  });

  const e7 = (events7d || []).map(addWeight);
  const ePrev7 = (eventsPrev7d || []).map(addWeight);
  const e30 = (events30d || []).map(addWeight);

  const raw = computeRawScores(e7, ePrev7, e30, lambdaDecay);
  const lanes = computeLaneScores(e7, e30, lambdaDecay);
  const intentScore = normalize(raw.raw_30d, normalizeK);
  const stage = classifyStage(intentScore, config);
  const surge = classifySurge(raw.raw_7d, raw.raw_prev_7d, config);
  const topLane = getTopLane(lanes.lane_scores_7d);
  const whyHot = buildWhyHot(keyEventsCounts, 3);

  return {
    raw_7d: raw.raw_7d,
    raw_prev_7d: raw.raw_prev_7d,
    raw_30d: raw.raw_30d,
    intent_score: intentScore,
    intent_stage: stage,
    surge_ratio: surge.ratio,
    surge_level: surge.level,
    top_lane: topLane,
    lane_scores_7d_json: lanes.lane_scores_7d,
    lane_scores_30d_json: lanes.lane_scores_30d,
    why_hot: whyHot,
  };
}

module.exports = {
  decay,
  contribution,
  normalize,
  classifyStage,
  classifySurge,
  buildWhyHot,
  buildKeyEventsJson,
  getWeight,
  computeRawScores,
  computeLaneScores,
  getTopLane,
  computeFullScore,
};
