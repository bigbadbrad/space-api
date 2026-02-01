/**
 * Phase 2 MVP: Look up event weight from weights map
 * Key format: `${event_name}:${content_type||''}:${cta_id||''}`
 */

/**
 * Get weight for an event from the weights map
 * @param {object} weightsMap - From registry.getWeightsMap()
 * @param {string} eventName - page_view, cta_click, form_started, form_submitted
 * @param {string|null} contentType - For page_view
 * @param {string|null} ctaId - For cta_click
 * @returns {number} Weight (default 1 for other)
 */
function getWeight(weightsMap, eventName, contentType = null, ctaId = null) {
  const key = `${eventName}:${contentType || ''}:${ctaId || ''}`;
  const exact = weightsMap[key];
  if (exact !== undefined) return exact;

  if (eventName === 'page_view' && contentType) {
    const fallback = weightsMap[`page_view:::`] || weightsMap['page_view:other:'] || weightsMap['page_view:other:'];
    if (fallback !== undefined) return fallback;
  }

  return weightsMap['page_view:other:'] ?? 1;
}

module.exports = { getWeight };
