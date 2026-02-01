/**
 * Phase 2 MVP: Intent stage classification (Cold/Warm/Hot)
 * Cold: 0..cold_max (default 34)
 * Warm: cold_max+1..warm_max (default 69)
 * Hot: >= warm_max+1 (default 70)
 */

/**
 * Classify intent_score into Cold, Warm, or Hot
 * @param {number} intentScore - 0-100 normalized score
 * @param {object} config - { cold_max, warm_max }
 * @returns {string} 'Cold' | 'Warm' | 'Hot'
 */
function classifyStage(intentScore, config = {}) {
  const coldMax = config.cold_max ?? 34;
  const warmMax = config.warm_max ?? 69;

  if (intentScore <= coldMax) return 'Cold';
  if (intentScore <= warmMax) return 'Warm';
  return 'Hot';
}

module.exports = { classifyStage };
