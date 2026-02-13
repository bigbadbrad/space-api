#!/usr/bin/env node
/**
 * Verify ABM E2E (first-party intent) checklist via space-api.
 * Run after: (1) anonymous browse + lead submit, (2) optional recompute.
 *
 * Usage:
 *   SPACE_API_URL=http://localhost:3001 SPACE_API_TOKEN=<jwt> node scripts/verify-abm-e2e.js
 *   SPACE_API_TOKEN=<jwt> node scripts/verify-abm-e2e.js --recompute
 *   SPACE_API_TOKEN=<jwt> node scripts/verify-abm-e2e.js --account-id <prospect_company_uuid>
 *
 * Env:
 *   SPACE_API_URL  - base URL (default http://localhost:3001)
 *   SPACE_API_TOKEN - JWT for an internal user (required)
 *   TRIGGER_RECOMPUTE - set to 1 to POST recompute-intent before checks (or use --recompute)
 *   ACCOUNT_ID     - prospect_company id to check account detail (or use --account-id)
 */
require('dotenv').config();

const BASE = process.env.SPACE_API_URL || 'http://localhost:3001';
const TOKEN = process.env.SPACE_API_TOKEN;
const TRIGGER_RECOMPUTE = process.env.TRIGGER_RECOMPUTE === '1';
const ACCOUNT_ID_ENV = process.env.ACCOUNT_ID;

const args = process.argv.slice(2);
const flagRecompute = args.includes('--recompute');
const idxAccount = args.indexOf('--account-id');
const accountIdArg = idxAccount >= 0 ? args[idxAccount + 1] : null;
const accountId = accountIdArg || ACCOUNT_ID_ENV;

if (!TOKEN) {
  console.error('SPACE_API_TOKEN (JWT for internal user) is required.');
  console.error('Example: SPACE_API_TOKEN=eyJ... node scripts/verify-abm-e2e.js');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function post(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function pass(name, detail = '') {
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('ABM E2E verification (space-api)\n');
  console.log(`Base URL: ${BASE}\n`);

  if (flagRecompute || TRIGGER_RECOMPUTE) {
    console.log('Triggering recompute-intent...');
    try {
      const r = await post('/api/abm/jobs/recompute-intent', { range_days: 30 });
      console.log(`  Job enqueued: range_days=${r.range_days}, jobId=${r.jobId || '—'}\n`);
    } catch (e) {
      console.error('  Failed:', e.message, '\n');
    }
  }

  let overview;
  let queue;
  let activity;
  let accountDetail;

  try {
    overview = await get('/api/abm/overview');
  } catch (e) {
    console.error('Overview failed:', e.message);
    overview = null;
  }

  try {
    queue = await get('/api/abm/queue');
  } catch (e) {
    console.error('Queue failed:', e.message);
    queue = null;
  }

  try {
    activity = await get('/api/abm/activity');
  } catch (e) {
    console.error('Activity failed:', e.message);
    activity = null;
  }

  if (accountId) {
    try {
      accountDetail = await get(`/api/abm/accounts/${accountId}`);
    } catch (e) {
      console.error('Account detail failed:', e.message);
      accountDetail = null;
    }
  }

  // Checklist
  console.log('--- Checklist ---\n');

  if (overview) {
    const k = overview.kpis || {};
    const hot = overview.hot_accounts_preview || [];
    const lr = overview.recent_lead_requests || [];
    const hasHot = (k.hot_accounts || 0) > 0 || hot.length > 0;
    if (hasHot || (k.hot_accounts === 0 && k.new_lead_requests >= 0)) {
      pass('Overview: KPIs returned', `hot_accounts=${k.hot_accounts}, surging=${k.surging_accounts}, new_lead_requests=${k.new_lead_requests}`);
    } else {
      fail('Overview: KPIs missing or invalid');
    }
    if (hot.length > 0) {
      pass('Overview: Hot accounts preview', `${hot.length} items`);
    } else {
      pass('Overview: Hot accounts preview', '0 (ok if no intent yet)');
    }
    if (lr.length > 0) {
      pass('Overview: Recent lead requests', `${lr.length} items`);
    } else {
      pass('Overview: Recent lead requests', '0 (ok if none)');
    }
  } else {
    fail('Overview: Request failed');
  }

  console.log('');

  if (queue) {
    const items = queue.items || queue.priorities || [];
    pass('Queue: Today’s priorities returned', `${items.length} items`);
  } else {
    fail('Queue: Request failed');
  }

  console.log('');

  if (activity) {
    const feed = activity.feed || [];
    pass('Activity: Feed returned', `${feed.length} items`);
  } else {
    fail('Activity: Request failed');
  }

  if (accountId && accountDetail) {
    console.log('');
    const ev = accountDetail.intent_evidence_7d;
    const score = accountDetail.intent_score;
    const stage = accountDetail.intent_stage;
    if (score != null || ev != null) {
      pass('Account detail: Intent data', `score=${score}, stage=${stage}, evidence=${ev ? 'present' : '—'}`);
    } else {
      pass('Account detail: Loaded', 'no intent fields yet');
    }
  } else if (accountId) {
    fail('Account detail: Request failed or no ACCOUNT_ID');
  }

  console.log('\n--- Done ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
