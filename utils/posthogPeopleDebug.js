'use strict';

/**
 * Fetch anonymous and unmatched visitors from PostHog for the People Debug feed.
 * Requires POSTHOG_HOST and POSTHOG_PROJECT_API_KEY (or POSTHOG_PERSONAL_API_KEY for Query API).
 * Returns { anonymous: [], unmatched: [] } with row shape: type, person_label, person_id, account_id?, account_name?, account_domain?, role_title, events_count, last_seen_at.
 * person_label for anonymous/unmatched must be masked: "Visitor XXXXXX" (last 6 of distinct_id or hash).
 */

const { ProspectCompany, ContactIdentity } = require('../models');

// Map the UI range string to a number of minutes
const RANGE_TO_MINUTES = {
  '15m': 15,
  '1h': 60,
  '24h': 24 * 60,
  '7d': 7 * 24 * 60,
  '30d': 30 * 24 * 60,
};

function visitorLabel(distinctId) {
  if (!distinctId || typeof distinctId !== 'string') return 'Visitor ——';
  const s = distinctId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `Visitor ${(s.slice(-6) || '——').padStart(6, '0')}`;
}

async function fetchPeopleDebugFromPostHog(opts) {
  const { range, minEvents, includeUnmatched, search, limit } = opts;
  const host = process.env.POSTHOG_HOST;
  const projectId = process.env.POSTHOG_PROJECT_ID || '1';
  // Prefer a personal API key (query:read) for the Query API, fall back to project key if needed.
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY;
  if (!host || !apiKey) return { anonymous: [], unmatched: [] };

  const minutes = RANGE_TO_MINUTES[range] || 24 * 60;

  const anonymous = [];
  const unmatched = [];

  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: `
            SELECT
              distinct_id,
              max(timestamp) AS last_seen_at,
              count() AS events_count,
              any(properties.$group_0) AS company_key
            FROM events
            WHERE timestamp >= now() - INTERVAL ${minutes} MINUTE
            GROUP BY distinct_id
            HAVING events_count >= ${minEvents}
            LIMIT ${limit}
          `,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn('PostHog query failed:', res.status, text);
      return { anonymous, unmatched };
    }

    const data = await res.json();
    const results = data.results || data.result?.results || [];
    const columns = data.columns || data.result?.columns || ['distinct_id', 'last_seen_at', 'events_count', 'company_key'];

    const distinctIdIdx = columns.indexOf('distinct_id');
    const lastSeenIdx = columns.indexOf('last_seen_at');
    const eventsCountIdx = columns.indexOf('events_count');
    const companyKeyIdx = columns.indexOf('company_key');
    if (distinctIdIdx < 0) return { anonymous, unmatched };

    const identityRows = await ContactIdentity.findAll({
      where: { identity_type: 'posthog_distinct_id' },
      attributes: ['identity_value', 'contact_id'],
    });
    const knownDistinctIds = new Set(identityRows.map((r) => r.identity_value));

    const accountByKey = new Map();
    const prospectCompanies = await ProspectCompany.findAll({ attributes: ['id', 'name', 'domain'] });
    for (const pc of prospectCompanies) {
      const key = (pc.domain || pc.id || '').toString();
      if (key) accountByKey.set(key, pc);
    }

    for (const row of Array.isArray(results) ? results : []) {
      const arr = Array.isArray(row) ? row : (row && row.row) ? row.row : [];
      const distinctId = arr[distinctIdIdx] ?? row?.distinct_id;
      const lastSeenAt = arr[lastSeenIdx] ?? row?.last_seen_at;
      const eventsCount = arr[eventsCountIdx] ?? row?.events_count ?? 0;
      const companyKey = arr[companyKeyIdx] ?? row?.company_key;

      if (knownDistinctIds.has(String(distinctId))) continue;

      const label = visitorLabel(distinctId);
      if (search && !label.toLowerCase().includes(search) && !String(companyKey || '').toLowerCase().includes(search)) continue;

      const base = {
        person_label: label,
        person_id: distinctId,
        role_title: null,
        events_count: eventsCount,
        last_seen_at: lastSeenAt || null,
      };

      if (companyKey) {
        const account = accountByKey.get(String(companyKey));
        anonymous.push({
          type: 'anonymous',
          account_id: account ? account.id : null,
          account_name: account ? (account.name || account.domain) : '(unknown)',
          account_domain: account ? account.domain : String(companyKey),
          ...base,
        });
      } else if (includeUnmatched) {
        unmatched.push({
          type: 'unmatched',
          account_id: null,
          account_name: null,
          account_domain: null,
          ...base,
        });
      }
    }
  } catch (err) {
    console.warn('PostHog people debug:', err?.message || err);
  }

  return { anonymous, unmatched };
}

module.exports = { fetchPeopleDebugFromPostHog, visitorLabel };
