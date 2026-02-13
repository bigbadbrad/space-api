/**
 * Phase 2 MVP / Epic 4: PostHog API client for HogQL queries
 * Requires: POSTHOG_HOST, (POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_API_KEY or POSTHOG_API_KEY), POSTHOG_PROJECT_ID
 * Epic 5: POSTHOG_ENABLED=false disables server-side fetch (callers should check before using).
 */

const BASE_URL =
  process.env.POSTHOG_HOST || 'https://us.posthog.com';

function isPostHogEnabled() {
  if (process.env.POSTHOG_ENABLED === 'false') return false;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY || process.env.POSTHOG_API_KEY;
  return !!(projectId && apiKey);
}

/**
 * Run a HogQL query against PostHog
 * @param {string} hogql - HogQL query string
 * @param {string} [name] - Query name for logging
 * @returns {Promise<{ results: any[], columns?: string[] }>}
 */
async function runQuery(hogql, name = 'abm-query') {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY || process.env.POSTHOG_API_KEY;

  if (!projectId || !apiKey) {
    throw new Error('POSTHOG_PROJECT_ID and a PostHog API key are required');
  }

  const url = `${BASE_URL.replace(/\/$/, '')}/api/projects/${projectId}/query/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: {
        kind: 'HogQLQuery',
        query: hogql,
      },
      name,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog query failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    results: data.results || [],
    columns: data.columns,
  };
}

/**
 * Event taxonomy (Epic 4 spec): content_viewed, cta_clicked, widget_*, lead_request_submitted
 */
const ABM_EVENT_NAMES = [
  '$pageview',
  'page_view',
  'content_viewed',
  'cta_click',
  'cta_clicked',
  'form_started',
  'form_submitted',
  'widget_opened',
  'widget_step_viewed',
  'widget_field_completed',
  'lead_request_submitted',
];

/**
 * Fetch events for ABM aggregation (last N days)
 * Returns rows with: date, account_key, event, content_type, lane, distinct_id, pathname, timestamp
 * Uses group analytics: properties.$group_0 (company group key) or POSTHOG_ACCOUNT_PROPERTY
 */
async function fetchEventsForAbm(days = 30, limit = 50000) {
  const accountProp = process.env.POSTHOG_ACCOUNT_PROPERTY || 'properties.$group_0';
  const eventList = ABM_EVENT_NAMES.map((e) => `'${e.replace(/'/g, "''")}'`).join(', ');

  const hogql = `
    SELECT 
      toDate(timestamp) as date,
      ${accountProp} as account_key,
      event,
      coalesce(properties.content_type, 'other') as content_type,
      coalesce(properties.service_lane, properties.lane, 'other') as lane,
      distinct_id,
      properties.$current_url as pathname,
      timestamp
    FROM events
    WHERE timestamp >= now() - INTERVAL ${Math.min(Math.max(parseInt(days, 10) || 30, 1), 365)} DAY
      AND event IN (${eventList})
    ORDER BY timestamp
    LIMIT ${Math.min(parseInt(limit, 10) || 50000, 100000)}
  `;

  const { results } = await runQuery(hogql, 'abm-events-30d');
  return results;
}

module.exports = {
  runQuery,
  fetchEventsForAbm,
  isPostHogEnabled,
};
