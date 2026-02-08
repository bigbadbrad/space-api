#!/usr/bin/env node
/**
 * Sprint 2: SpaceWERX STRATFI/TACFI & Portfolio ingest
 * Fetches HTML from SpaceWERX pages, parses awardee list, upserts into program_items.
 * Schedule: daily 2am UTC
 */
require('dotenv').config();
const axios = require('axios');
const { ProgramItem } = require('../models');
const { classifyProgram } = require('../services/programClassifier.service');

const SPACEWERX_STRATFI_URL = 'https://spacewerx.us/accelerate/stratfi-tacfi/';
const SPACEWERX_PORTFOLIO_URL = 'https://spacewerx.us/space-ventures/portfolio/';

/**
 * Parse company names and program type from STRATFI/TACFI page
 * Structure: "### Program Year 25.1 Space STRATFI" then "#### Beast Code", "#### CesiumAstro", etc.
 */
function parseStratfiTacfiHtml(html) {
  const items = [];
  const sectionRe = /Program Year (\d{2})\.(\d) Space (STRATFI|TACFI)/gi;
  const companyRe = /(?:####|<h4[^>]*>)\s*([^<\n*]+?)(?:\s*\*\*|<\/h4>|\s*$)/g;

  let sectionMatch;
  const sections = [];
  while ((sectionMatch = sectionRe.exec(html)) !== null) {
    sections.push({
      index: sectionMatch.index,
      year: `${sectionMatch[1]}.${sectionMatch[2]}`,
      programType: (sectionMatch[3] || '').toUpperCase(),
    });
  }

  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].index;
    const end = sections[i + 1] ? sections[i + 1].index : html.length;
    const block = html.slice(start, end);
    let companyMatch;
    while ((companyMatch = companyRe.exec(block)) !== null) {
      const name = companyMatch[1]
        .replace(/^\s+|\s+$/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#8217;/g, "'")
        .trim();
      if (name.length > 2 && name.length < 150 && !/^Program Year|^Awarded companies/i.test(name)) {
        items.push({
          companyName: name,
          programType: sections[i].programType,
          year: sections[i].year,
          source: 'stratfi_tacfi',
        });
      }
    }
  }

  return items;
}

/**
 * Slug for source_id
 */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/**
 * Fetch and parse SpaceWERX STRATFI/TACFI page
 */
async function fetchSpacewerxStratfiTacfi() {
  try {
    const res = await axios.get(SPACEWERX_STRATFI_URL, {
      timeout: 15000,
      headers: { 'User-Agent': 'SpaceABM/1.0 (procurement-ingest)' },
    });
    const html = res.data;
    return parseStratfiTacfiHtml(html);
  } catch (err) {
    console.error('SpaceWERX STRATFI/TACFI fetch error:', err.message);
    return [];
  }
}

/**
 * Map parsed item to ProgramItem
 */
function mapToProgramItem(item) {
  const sourceId = `spacewerx:${item.year}:${item.programType}:${slugify(item.companyName)}`;
  const title = `${item.companyName} — ${item.programType}`;
  return {
    source_type: 'spacewerx_award',
    source_id: sourceId,
    title: title.slice(0, 1024),
    agency: 'SpaceWERX',
    status: 'awarded',
    posted_at: new Date(),
    description: `SpaceWERX ${item.programType} Program Year ${item.year} awardee: ${item.companyName}`,
    links_json: [{ url: SPACEWERX_STRATFI_URL, title: 'STRATFI/TACFI' }, { url: SPACEWERX_PORTFOLIO_URL, title: 'Portfolio' }],
    raw_json: item,
  };
}

/**
 * Run the ingest
 */
async function runIngest() {
  const stratfiItems = await fetchSpacewerxStratfiTacfi();
  let upserted = 0;
  let errors = 0;

  const seen = new Set();
  for (const item of stratfiItems) {
    const sourceId = `spacewerx:${item.year}:${item.programType}:${slugify(item.companyName)}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    try {
      const payload = mapToProgramItem(item);

      const classification = await classifyProgram({
        title: payload.title,
        summary: payload.description,
        agency: payload.agency,
        naics: null,
        psc: null,
        url: SPACEWERX_STRATFI_URL,
      });

      payload.service_lane = classification.service_lane ?? 'other';
      payload.topic = classification.topic ?? 'spacewerx';
      payload.relevance_score = Math.max(classification.relevance_score ?? 0, 50);
      payload.match_confidence = Math.max(classification.match_confidence ?? 0.6, 0.6);
      payload.match_reasons_json = classification.match_reasons_json ?? [{ type: 'source', label: 'SpaceWERX space award' }];
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
      if (errors <= 3) console.error('SpaceWERX ingest error:', err.message);
    }
  }

  return { total: stratfiItems.length, upserted, errors };
}

if (require.main === module) {
  runIngest()
    .then((r) => {
      console.log('SpaceWERX ingest complete:', r);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { runIngest, fetchSpacewerxStratfiTacfi };
