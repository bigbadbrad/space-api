/**
 * Phase 2 MVP: "Why hot" reasons from 7d key events
 * Generate up to top 3 strings from:
 * - pricing page views, security, integrations, request_reservation
 * - form_started count, form_submitted count
 * - cta_click request_reservation count
 * Example: ["2× Pricing", "1× Security", "1× Form Started"]
 */

const KEY_EVENT_LABELS = {
  pricing_page_view: 'Pricing',
  security_page_view: 'Security',
  integrations_page_view: 'Integrations',
  request_reservation_page_view: 'Request Reservation',
  form_started: 'Form Started',
  form_submitted: 'Form Submitted',
  cta_click_request_reservation: 'CTA: Request Reservation',
};

/**
 * Build why_hot array from key events counts
 * @param {object} counts - { eventKey: count } e.g. { pricing_page_view: 2, form_started: 1 }
 * @param {number} maxReasons - Max items to return (default 3)
 * @returns {string[]}
 */
function buildWhyHot(counts, maxReasons = 3) {
  const entries = Object.entries(counts || {})
    .filter(([, c]) => c > 0)
    .map(([key, c]) => ({ key, count: c, label: KEY_EVENT_LABELS[key] || key }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxReasons);

  return entries.map((e) => `${e.count}× ${e.label}`);
}

/**
 * Build key_events object from raw event list for storage
 * Converts array of { event_name, content_type, cta_id } with counts into a structure
 * suitable for key_events_7d_json
 * @param {Array<{event_name: string, content_type?: string, cta_id?: string, count: number}>} events
 * @returns {object}
 */
function buildKeyEventsJson(events) {
  const out = {};
  for (const e of events || []) {
    let key;
    if (e.event_name === 'page_view' && e.content_type) {
      key = `${e.content_type}_page_view`;
    } else if (e.event_name === 'cta_click' && e.cta_id) {
      key = `cta_click_${e.cta_id}`;
    } else if (e.event_name === 'form_started' || e.event_name === 'form_submitted') {
      key = e.event_name;
    } else {
      key = e.event_name;
    }
    out[key] = (out[key] || 0) + (e.count || 0);
  }
  return out;
}

/**
 * Epic 4: Build top evidence strings from key_events counts and rules' evidence_template
 * @param {object} keyEventsCounts - { eventKey: count }
 * @param {Array<{ evidence_template?: string, event_name?: string, content_type?: string, match_value?: string }>} rules
 * @param {number} maxStrings - Max evidence strings (default 6)
 * @returns {string[]}
 */
function buildEvidenceStrings(keyEventsCounts, rules = [], maxStrings = 6) {
  const keyToRule = new Map();
  for (const r of rules) {
    if (!r.evidence_template) continue;
    const k = r.event_name === 'page_view' ? `${(r.content_type || 'other')}_page_view` : (r.event_name || 'other');
    if (!keyToRule.has(k)) keyToRule.set(k, r);
  }

  const entries = Object.entries(keyEventsCounts || {})
    .filter(([, c]) => c > 0)
    .map(([key, count]) => {
      const t = keyToRule.get(key)?.evidence_template;
      const str = t ? t.replace(/\{count\}/gi, String(count)) : `${key.replace(/_/g, ' ')} (${count}×)`;
      return { key, count, str };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, maxStrings);
  return entries.map((e) => e.str);
}

module.exports = { buildWhyHot, buildKeyEventsJson, buildEvidenceStrings, KEY_EVENT_LABELS };
