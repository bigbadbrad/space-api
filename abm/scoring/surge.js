/**
 * Phase 2 MVP: Surge classification
 * surge_ratio = (raw_7d + 5) / (raw_prev_7d + 5)
 * Normal: < surge_surging_min (1.5)
 * Surging: >= 1.5 and <= 2.5
 * Exploding: > surge_exploding_min (2.5)
 */

/**
 * Compute surge ratio and classify surge level
 * @param {number} raw7d - Raw score last 7 days
 * @param {number} rawPrev7d - Raw score 7-14 days ago
 * @param {object} config - { surge_surging_min, surge_exploding_min }
 * @returns {{ ratio: number, level: string }}
 */
function classifySurge(raw7d, rawPrev7d, config = {}) {
  const surgingMin = config.surge_surging_min ?? 1.5;
  const explodingMin = config.surge_exploding_min ?? 2.5;

  const ratio = (raw7d + 5) / (rawPrev7d + 5);

  let level = 'Normal';
  if (ratio >= explodingMin) level = 'Exploding';
  else if (ratio >= surgingMin) level = 'Surging';

  return { ratio, level };
}

module.exports = { classifySurge };
