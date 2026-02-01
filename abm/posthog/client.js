/**
 * Phase 2 MVP: PostHog API client for HogQL queries
 * Requires: POSTHOG_HOST, POSTHOG_API_KEY, POSTHOG_PROJECT_ID
 */

const BASE_URL =
  process.env.POSTHOG_HOST || 'https://us.posthog.com';

/**
 * Run a HogQL query against PostHog
 * @param {string} hogql - HogQL query string
 * @param {string} [name] - Query name for logging
 * @returns {Promise<{ results: any[], columns?: string[] }>}
 */
async function runQuery(hogql, name = 'abm-query') {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_API_KEY;

  if (!projectId || !apiKey) {
    throw new Error('POSTHOG_PROJECT_ID and POSTHOG_API_KEY are required');
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
 * Fetch events for ABM aggregation (last N days)
 * Returns rows with: date, account_key, event, content_type, lane, distinct_id, timestamp
 * Uses configurable account property (default: $group_0 or organization_domain)
 */
async function fetchEventsForAbm(days = 30, limit = 50000) {
  const accountProp = process.env.POSTHOG_ACCOUNT_PROPERTY || 'properties.$group_0';

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
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND event IN ('$pageview', 'page_view', 'cta_click', 'form_started', 'form_submitted')
    ORDER BY timestamp
    LIMIT ${limit}
  `;

  const { results } = await runQuery(hogql, 'abm-events-30d');
  return results;
}

module.exports = {
  runQuery,
  fetchEventsForAbm,
};
