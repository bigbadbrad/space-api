#!/usr/bin/env node
/**
 * Sprint 2: USAspending.gov Awards ingest
 * Fetches contract awards from last 30 days, upserts into program_items.
 * Schedule: daily 2am UTC
 */
require('dotenv').config();
const dayjs = require('dayjs');
const axios = require('axios');
const { ProgramItem } = require('../models');
const { classifyProgram } = require('../services/programClassifier.service');

const USASPENDING_API = 'https://api.usaspending.gov';
const DEFAULT_DAYS = 30;

function formatDate(d) {
  return dayjs(d).format('YYYY-MM-DD');
}

/**
 * Fetch contract awards from USAspending (A=procurement, B=idv, C=contract, D=idv)
 */
async function fetchUsaspendingAwards(daysBack = DEFAULT_DAYS) {
  const endDate = dayjs();
  const startDate = dayjs().subtract(daysBack, 'day');

  const body = {
    subawards: false,
    limit: 100,
    page: 1,
    filters: {
      award_type_codes: ['A', 'B', 'C', 'D'],
      time_period: [
        { start_date: formatDate(startDate), end_date: formatDate(endDate) },
      ],
    },
    fields: [
      'Award ID',
      'generated_internal_id',
      'Recipient Name',
      'Start Date',
      'End Date',
      'Award Amount',
      'Awarding Agency',
      'Awarding Sub Agency',
      'Description',
      'Last Modified Date',
      'Base Obligation Date',
      'NAICS',
      'PSC',
      'Place of Performance State Code',
      'Place of Performance Country Code',
    ],
  };

  const all = [];
  let hasNext = true;
  let page = 1;

  while (hasNext) {
    body.page = page;
    const res = await axios.post(
      `${USASPENDING_API}/api/v2/search/spending_by_award/`,
      body,
      { timeout: 60000, headers: { 'Content-Type': 'application/json' } }
    );
    const data = res.data;
    const results = data.results || [];
    all.push(...results);

    const pageMeta = data.page_metadata || {};
    hasNext = pageMeta.hasNext === true && results.length === body.limit;
    page += 1;
    if (hasNext) await new Promise((r) => setTimeout(r, 300));
  }

  return all;
}

/**
 * Map USAspending award to ProgramItem fields
 */
function mapAwardToProgramItem(item) {
  const internalId = item.generated_internal_id || item['generated_internal_id'];
  const awardId = item['Award ID'] || item.award_id || internalId;
  const sourceId = internalId || awardId;
  if (!sourceId) return null;

  const title = item['Recipient Name']
    ? `Award: ${item['Recipient Name']}`
    : `Award ${String(awardId).slice(0, 50)}`;
  const agency = item['Awarding Agency'] || item['Awarding Sub Agency'] || null;
  const postedAt = item['Base Obligation Date'] || item['Start Date'] || item['Last Modified Date'];
  const amount = item['Award Amount'] != null ? parseFloat(item['Award Amount']) : null;

  const links = [];
  const linkId = internalId || (typeof sourceId === 'string' ? sourceId : null);
  if (linkId) {
    links.push({
      url: `https://www.usaspending.gov/award/${linkId}`,
      title: 'View on USAspending',
    });
  }

  const pop = {};
  if (item['Place of Performance State Code']) pop.state = String(item['Place of Performance State Code']);
  if (item['Place of Performance Country Code']) pop.country = item['Place of Performance Country Code'];

  function toNaicsPscString(val) {
    if (val == null) return null;
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
    return String(val);
  }

  return {
    source_type: 'usaspending_award',
    source_id: String(sourceId),
    title: (title || 'USAspending Award').slice(0, 1024),
    agency: (agency || '').slice(0, 255),
    status: 'awarded',
    posted_at: postedAt ? new Date(postedAt) : null,
    updated_at_source: item['Last Modified Date'] ? new Date(item['Last Modified Date']) : null,
    due_at: item['End Date'] ? new Date(item['End Date']) : null,
    description: (item['Description'] || '').slice(0, 50000) || null,
    naics: toNaicsPscString(item['NAICS']) || null,
    psc: toNaicsPscString(item['PSC']) || null,
    amount_obligated: amount,
    amount_total_value: amount,
    links_json: links.length ? links : null,
    raw_json: item,
  };
}

/**
 * Run the ingest
 */
async function runIngest(daysBack = DEFAULT_DAYS) {
  const awards = await fetchUsaspendingAwards(daysBack);
  let upserted = 0;
  let errors = 0;

  for (const item of awards) {
    try {
      const payload = mapAwardToProgramItem(item);
      if (!payload) continue;

      const classification = await classifyProgram({
        title: payload.title,
        summary: payload.description,
        agency: payload.agency,
        naics: payload.naics,
        psc: payload.psc,
        url: payload.links_json?.[0]?.url,
      });

      payload.service_lane = classification.service_lane ?? payload.service_lane;
      payload.topic = classification.topic ?? payload.topic;
      // Min score 40 so USAspending awards show in default "Relevant" view (threshold 35)
      payload.relevance_score = Math.max(classification.relevance_score ?? 0, 40);
      payload.match_confidence = classification.match_confidence ?? 0;
      payload.match_reasons_json = classification.match_reasons_json?.length
        ? classification.match_reasons_json
        : [{ type: 'source', label: 'USAspending contract award' }];
      payload.classification_version = classification.classification_version ?? 'v1_rules';
      payload.suppressed = classification.suppressed ?? false;
      payload.suppressed_reason = classification.suppressed_reason ?? null;

      await ProgramItem.upsert(
        { ...payload, updated_at: new Date() },
        { conflictFields: ['source_type', 'source_id'] }
      );
      upserted += 1;
    } catch (err) {
      errors += 1;
      if (errors <= 3) console.error('USAspending ingest error:', err.message);
    }
  }

  return { total: awards.length, upserted, errors };
}

if (require.main === module) {
  const days = parseInt(process.argv[2]) || DEFAULT_DAYS;
  runIngest(days)
    .then((r) => {
      console.log('USAspending ingest complete:', r);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { runIngest, fetchUsaspendingAwards };
