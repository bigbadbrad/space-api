/**
 * Phase 2 MVP: Exponential decay for intent scoring
 * decay(age_days) = exp(-lambda_decay * age_days)
 * contrib = weight * decay(age_days)
 */

/**
 * Compute decay factor for an event that occurred age_days ago
 * @param {number} ageDays - Days since event
 * @param {number} lambdaDecay - Decay rate (default 0.10)
 * @returns {number}
 */
function decay(ageDays, lambdaDecay = 0.1) {
  return Math.exp(-lambdaDecay * ageDays);
}

/**
 * Compute contribution of a single event to raw score
 * @param {number} weight - Event weight
 * @param {number} ageDays - Days since event
 * @param {number} lambdaDecay - Decay rate
 * @returns {number}
 */
function contribution(weight, ageDays, lambdaDecay = 0.1) {
  return weight * decay(ageDays, lambdaDecay);
}

module.exports = { decay, contribution };
