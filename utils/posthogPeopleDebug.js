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

function pathFromUrl(url) {
  if (url == null || typeof url !== 'string') return null;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) return new URL(url).pathname;
    if (url.startsWith('/')) return url;
    return null;
  } catch (_) {
    return null;
  }
}

function visitorLabel(distinctId) {
  if (!distinctId || typeof distinctId !== 'string') return 'Visitor ——';
  const s = distinctId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `Visitor ${(s.slice(-6) || '——').padStart(6, '0')}`;
}

function normalizeCompanyKey(key) {
  if (key == null || typeof key !== 'string') return '';
  return key
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

async function fetchPeopleDebugFromPostHog(opts) {
  const { range, minEvents, includeUnmatched, search, limit, includeIdentified } = opts;
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
      const raw = (pc.domain || pc.id || '').toString();
      if (raw) {
        accountByKey.set(raw, pc);
        const norm = normalizeCompanyKey(raw);
        if (norm && norm !== raw) accountByKey.set(norm, pc);
      }
    }

    for (const row of Array.isArray(results) ? results : []) {
      const arr = Array.isArray(row) ? row : (row && row.row) ? row.row : [];
      const distinctId = arr[distinctIdIdx] ?? row?.distinct_id;
      const lastSeenAt = arr[lastSeenIdx] ?? row?.last_seen_at;
      const eventsCount = arr[eventsCountIdx] ?? row?.events_count ?? 0;
      const companyKey = arr[companyKeyIdx] ?? row?.company_key;

      if (!includeIdentified && knownDistinctIds.has(String(distinctId))) continue;

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
        const keyStr = String(companyKey).trim();
        const account = accountByKey.get(keyStr) || accountByKey.get(normalizeCompanyKey(keyStr));
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

/**
 * Fetch event counts for specific distinct_ids (e.g. account's known contacts' posthog ids).
 * Use when the main feed returns no anonymous for an account but we know distinct_ids that belong to it.
 */
async function fetchEventCountsByDistinctIds(distinctIds, opts = {}) {
  const { range = '7d', limit = 50 } = opts;
  const host = process.env.POSTHOG_HOST;
  const projectId = process.env.POSTHOG_PROJECT_ID || '1';
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY;
  if (!host || !apiKey || !distinctIds || distinctIds.length === 0) return [];

  const minutes = RANGE_TO_MINUTES[range] || 24 * 60;
  const idsList = distinctIds.slice(0, 20).map((id) => `'${String(id).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
  const inClause = idsList.length === 1
    ? `distinct_id = ${idsList[0]}`
    : `in(distinct_id, [${idsList.join(', ')}])`;

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
              count() AS events_count
            FROM events
            WHERE ${inClause}
              AND timestamp >= now() - INTERVAL ${minutes} MINUTE
            GROUP BY distinct_id
            LIMIT ${limit}
          `,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('PostHog fetchEventCountsByDistinctIds HTTP', res.status, text?.slice(0, 200));
      return [];
    }
    const data = await res.json();
    const results = data.results || data.result?.results || [];
    const columns = data.columns || data.result?.columns || ['distinct_id', 'last_seen_at', 'events_count'];
    const distinctIdIdx = columns.indexOf('distinct_id');
    const lastSeenIdx = columns.indexOf('last_seen_at');
    const eventsCountIdx = columns.indexOf('events_count');
    if (distinctIdIdx < 0) return [];
    return results.map((row) => {
      const arr = Array.isArray(row) ? row : (row && row.row) ? row.row : [];
      return {
        person_id: arr[distinctIdIdx] ?? row?.distinct_id,
        person_label: visitorLabel(arr[distinctIdIdx] ?? row?.distinct_id),
        last_seen_at: arr[lastSeenIdx] ?? row?.last_seen_at,
        events_count: Number(arr[eventsCountIdx] ?? row?.events_count ?? 0),
      };
    });
  } catch (err) {
    console.warn('PostHog fetchEventCountsByDistinctIds failed:', err?.message || err);
    return [];
  }
}

/**
 * Get all distinct_ids for a person (anonymous + known) so we can fetch all their events.
 * Uses HogQL on events table: same person_id = same person. Returns every distinct_id that
 * appears on events for that person in the last 30d (matches what PostHog Activity shows).
 */
async function getPersonDistinctIds(identifiedDistinctId) {
  const host = process.env.POSTHOG_HOST;
  const projectId = process.env.POSTHOG_PROJECT_ID || '1';
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY;
  if (!host || !apiKey || !identifiedDistinctId) return [];

  const idEsc = String(identifiedDistinctId).replace(/\\/g, '\\\\').replace(/'/g, "''");
  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: `
            SELECT DISTINCT distinct_id
            FROM events
            WHERE person_id = (
              SELECT person_id FROM events
              WHERE distinct_id = '${idEsc}'
              AND timestamp >= now() - INTERVAL 30 DAY
              LIMIT 1
            )
            AND timestamp >= now() - INTERVAL 30 DAY
            LIMIT 50
          `,
        },
      }),
    });
    if (!res.ok) return [String(identifiedDistinctId)];
    const data = await res.json();
    const results = data.results || data.result?.results || [];
    const columns = data.columns || data.result?.columns || ['distinct_id'];
    const iId = columns.indexOf('distinct_id');
    if (iId < 0) return [String(identifiedDistinctId)];
    const ids = results.map((row) => {
      const arr = Array.isArray(row) ? row : (row && row.row) ? row.row : [];
      return String(arr[iId] ?? row?.distinct_id ?? '');
    }).filter(Boolean);
    return ids.length > 0 ? ids : [String(identifiedDistinctId)];
  } catch (err) {
    console.warn('PostHog getPersonDistinctIds failed:', err?.message || err);
    return [String(identifiedDistinctId)];
  }
}

/**
 * Get the timestamp of the first identify event for the given distinct_ids (person).
 * Tries event names: $identify, identify. Used to split anonymous vs known.
 * Returns ISO timestamp string or null.
 */
async function getIdentifyTimestamp(distinctIds, opts = {}) {
  const { range = '7d' } = opts;
  const host = process.env.POSTHOG_HOST;
  const projectId = process.env.POSTHOG_PROJECT_ID || '1';
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY;
  if (!host || !apiKey || !distinctIds || distinctIds.length === 0) return null;

  const minutes = RANGE_TO_MINUTES[range] || 24 * 60;
  const idsList = distinctIds.slice(0, 25).map((id) => `'${String(id).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
  const inClause = idsList.length === 1 ? `distinct_id = ${idsList[0]}` : `in(distinct_id, [${idsList.join(', ')}])`;

  const eventNames = ["'$identify'", "'identify'", "'lead_request_submitted'"];
  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: `
            SELECT timestamp
            FROM events
            WHERE ${inClause}
              AND event IN (${eventNames.join(', ')})
              AND timestamp >= now() - INTERVAL ${minutes} MINUTE
            ORDER BY timestamp ASC
            LIMIT 1
          `,
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || data.result?.results || [];
    const row = results[0];
    if (!row) return null;
    const arr = Array.isArray(row) ? row : (row && row.row) ? row.row : [];
    const ts = arr[0] ?? row?.timestamp;
    return ts ? String(ts) : null;
  } catch (err) {
    console.warn('PostHog getIdentifyTimestamp failed:', err?.message || err);
    return null;
  }
}

/**
 * Fetch raw events from PostHog for given distinct_ids (simple query by person).
 * Returns [ { distinct_id, event, timestamp, path, url, event_display } ] ordered by timestamp desc.
 * path = properties.path (e.g. /services/relocation). url = $current_url fallback for display.
 * event_display = descriptive label when we can build one (e.g. "content_viewed (/path)" or autocapture description).
 */
async function fetchEventsByDistinctIds(distinctIds, opts = {}) {
  const { range = '7d', limit = 500 } = opts;
  const host = process.env.POSTHOG_HOST;
  const projectId = process.env.POSTHOG_PROJECT_ID || '1';
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_PROJECT_API_KEY;
  if (!host || !apiKey || !distinctIds || distinctIds.length === 0) return [];

  const minutes = RANGE_TO_MINUTES[range] || 24 * 60;
  const idsList = distinctIds.slice(0, 25).map((id) => `'${String(id).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
  const inClause = idsList.length === 1 ? `distinct_id = ${idsList[0]}` : `in(distinct_id, [${idsList.join(', ')}])`;

  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: `
            SELECT
              distinct_id,
              event,
              timestamp,
              properties.path AS path,
              properties.$current_url AS url,
              properties.$el_tag_name AS el_tag,
              properties.$el_text AS el_text,
              properties.$event_type AS event_type
            FROM events
            WHERE ${inClause}
              AND timestamp >= now() - INTERVAL ${minutes} MINUTE
            ORDER BY timestamp DESC
            LIMIT ${limit}
          `,
        },
      }),
    });
    if (!res.ok) {
      console.warn('PostHog fetchEventsByDistinctIds HTTP', res.status, (await res.text())?.slice(0, 200));
      return [];
    }
    const data = await res.json();
    const results = data.results || data.result?.results || [];
    const columns = data.columns || data.result?.columns || [];
    const iId = columns.indexOf('distinct_id');
    const iEvent = columns.indexOf('event');
    const iTs = columns.indexOf('timestamp');
    const iPath = columns.indexOf('path');
    const iUrl = columns.indexOf('url');
    const iElTag = columns.indexOf('el_tag');
    const iElText = columns.indexOf('el_text');
    const iEventType = columns.indexOf('event_type');
    if (iId < 0 || iEvent < 0) return [];
    return results.map((row) => {
      const arr = Array.isArray(row) ? row : (row && row.row) ? row.row : [];
      const eventName = arr[iEvent] ?? row?.event ?? '';
      const pathVal = iPath >= 0 ? (arr[iPath] ?? row?.path) : null;
      const urlVal = iUrl >= 0 ? (arr[iUrl] ?? row?.url) : null;
      const elTag = iElTag >= 0 ? (arr[iElTag] ?? row?.el_tag) : null;
      const elText = iElText >= 0 ? (arr[iElText] ?? row?.el_text) : null;
      const eventType = (iEventType >= 0 ? (arr[iEventType] ?? row?.event_type) : null) ?? '';
      let event_display = eventName;
      if (eventName === '$autocapture') {
        const tag = (elTag || 'element').replace(/^</, '').replace(/>$/, '') || 'element';
        const et = String(eventType).toLowerCase();
        if (et === 'change' || et === 'input') {
          event_display = tag === 'select' ? 'typed something into select' : 'typed something into input';
        } else if (et === 'submit') {
          event_display = 'submitted form';
        } else {
          // click or unknown: "clicked X" / "clicked X with text Y"
          event_display = elText
            ? `clicked ${tag} with text "${String(elText).slice(0, 80)}${String(elText).length > 80 ? '…' : ''}"`
            : `clicked ${tag}`;
        }
      } else if (eventName === 'content_viewed' && (pathVal || urlVal)) {
        const p = pathVal || pathFromUrl(urlVal) || urlVal;
        event_display = p ? `content_viewed (${p})` : eventName;
      }
      const pathDisplay = pathVal || pathFromUrl(urlVal) || urlVal;
      return {
        distinct_id: arr[iId] ?? row?.distinct_id,
        event: eventName,
        timestamp: arr[iTs] ?? row?.timestamp,
        path: pathDisplay,
        url: urlVal,
        event_display: event_display || eventName,
      };
    });
  } catch (err) {
    console.warn('PostHog fetchEventsByDistinctIds failed:', err?.message || err);
    return [];
  }
}

module.exports = { fetchPeopleDebugFromPostHog, fetchEventCountsByDistinctIds, fetchEventsByDistinctIds, getPersonDistinctIds, getIdentifyTimestamp, visitorLabel, normalizeCompanyKey };
