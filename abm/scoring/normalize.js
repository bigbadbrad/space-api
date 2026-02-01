/**
 * Phase 2 MVP: Normalize raw score to 0-100 intent score
 * intent_score = round(100 * (1 - exp(-raw_30d / normalize_k)))
 * Default: normalize_k = 80
 */

/**
 * Convert raw 30d score to 0-100 intent score
 * @param {number} raw30d - Raw decayed score over 30 days
 * @param {number} normalizeK - Normalization constant (default 80)
 * @returns {number} 0-100
 */
function normalize(raw30d, normalizeK = 80) {
  return Math.round(100 * (1 - Math.exp(-raw30d / normalizeK)));
}

module.exports = { normalize };
