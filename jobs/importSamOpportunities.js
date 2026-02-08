#!/usr/bin/env node
/**
 * ABM Rev 3: SAM.gov Opportunities import job
 * Fetches opportunities posted in date range, upserts ProcurementProgram, classifies,
 * attempts account linking, creates IntentSignals for linked accounts.
 * Schedule: daily at 02:30 UTC
 */
require('dotenv').config();
const dayjs = require('dayjs');
const axios = require('axios');
const {
  ProcurementProgram,
  ProgramAccountLink,
  ProcurementImportRun,
  ProspectCompany,
  CompanyDomain,
  IntentSignal,
  ProgramItem,
} = require('../models');
const { classifyProgram } = require('../services/programClassifier.service');
const { extractDescription, extractContacts, extractAttachments, extractPlaceOfPerformance } = require('../utils/samExtractor');

const SAM_API_BASE = process.env.SAM_API_BASE || 'https://api.sam.gov/prod/opportunities/v2/search';
const SAM_API_KEY = process.env.SAM_API_KEY;

function formatDateForSam(d) {
  return dayjs(d).format('MM/DD/YYYY');
}

/**
 * Fetch opportunities from SAM.gov (paginated)
 */
async function fetchSamOpportunities(postedFrom, postedTo) {
  if (!SAM_API_KEY) {
    throw new Error('SAM_API_KEY is required for SAM import');
  }
  const all = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(SAM_API_BASE);
    url.searchParams.set('api_key', SAM_API_KEY);
    url.searchParams.set('postedFrom', formatDateForSam(postedFrom));
    url.searchParams.set('postedTo', formatDateForSam(postedTo));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));

    const res = await axios.get(url.toString(), { timeout: 30000 });
    const data = res.data;
    const opportunities = data.opportunitiesData || data.data || [];
    all.push(...opportunities);

    if (opportunities.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
      if (data.totalRecords && offset >= data.totalRecords) {
        hasMore = false;
      } else {
        await new Promise((r) => setTimeout(r, 500)); // throttle
      }
    }
  }
  return all;
}

/**
 * Map SAM opportunity to our fields
 */
function mapSamToProgram(item) {
  const noticeId = item.noticeId || item.noticeid;
  const postedDate = item.postedDate || item.posted_date;
  const responseDeadline = item.responseDeadLine || item.responseDeadLine || item.response_dead_line;
  const agency = item.fullParentPathName || item.department || item.subTier || item.agency;
  const office = item.office || item.officeAddress?.city;

  const description = extractDescription(item) || extractSummary(item);
  const contacts = extractContacts(item);
  const attachments = extractAttachments(item);
  const placeOfPerformance = extractPlaceOfPerformance(item);

  return {
    source: 'sam_opportunity',
    external_id: String(noticeId),
    title: (item.title || '').slice(0, 1024),
    summary: extractSummary(item),
    description: description ? String(description).slice(0, 50000) : null,
    agency: (agency || '').slice(0, 255),
    agency_path: (item.fullParentPathName || item.department || item.subTier || agency || '').slice(0, 512),
    office: (office || '').slice(0, 255),
    naics: item.naicsCode || item.naics_code || null,
    psc: item.classificationCode || item.classification_code || null,
    set_aside: item.typeOfSetAsideDescription || item.typeOfSetAside || item.setAside || null,
    notice_type: item.type || item.baseType || null,
    status: inferStatus(item),
    posted_at: postedDate ? new Date(postedDate) : null,
    due_at: responseDeadline ? new Date(responseDeadline) : null,
    updated_at_source: item.modifiedDate || item.modified_date ? new Date(item.modifiedDate || item.modified_date) : null,
    place_of_performance_json: placeOfPerformance,
    contacts_json: contacts,
    attachments_json: attachments,
    url: item.uiLink || item.ui_link || (noticeId ? `https://sam.gov/opp/${noticeId}` : null),
    raw_json: item,
  };
}

function extractSummary(item) {
  const desc = item.description;
  if (typeof desc === 'string' && desc.length > 0) return desc.slice(0, 5000);
  return null;
}

function inferStatus(item) {
  if (item.award) return 'awarded';
  if (item.active === 'No' || item.archiveDate) return 'closed';
  return 'open';
}

/**
 * Attempt account linking: if program text contains known account names/domains
 */
async function attemptAccountLinking(programId, programText) {
  const text = (programText || '').toLowerCase();
  const prospects = await ProspectCompany.findAll({
    attributes: ['id', 'name', 'domain'],
    include: [{ model: CompanyDomain, as: 'domains', attributes: ['domain'] }],
  });

  const links = [];
  for (const p of prospects) {
    const domain = (p.domain || '').toLowerCase();
    const name = (p.name || '').toLowerCase().replace(/\s+/g, ' ');
    const domains = [domain, ...(p.domains || []).map((d) => (d.domain || '').toLowerCase())].filter(Boolean);

    let matched = false;
    if (name && name.length > 2 && text.includes(name)) matched = true;
    if (!matched && domains.some((d) => d && text.includes(d))) matched = true;

    if (matched) {
      links.push({
        procurement_program_id: programId,
        prospect_company_id: p.id,
        link_type: 'unknown',
        confidence: 0.6,
        evidence_json: { matched: name || domain },
      });
    }
  }
  return links;
}

/**
 * Run the import
 */
async function runImport() {
  const from = dayjs().subtract(2, 'day').toDate();
  const to = dayjs().toDate();

  const run = await ProcurementImportRun.create({
    source: 'sam_opportunity',
    started_at: new Date(),
    status: 'running',
  });

  let recordsFetched = 0;
  let recordsUpserted = 0;
  let errorCount = 0;
  const errorSamples = [];

  try {
    const opportunities = await fetchSamOpportunities(from, to);
    recordsFetched = opportunities.length;

    for (const item of opportunities) {
      try {
        const payload = mapSamToProgram(item);
        const classification = await classifyProgram(payload);
        payload.service_lane = classification.service_lane ?? payload.service_lane;
        payload.topic = classification.topic ?? payload.topic;
        // Min score 40 so SAM opportunities show in default "Relevant" view (threshold 35)
        payload.relevance_score = Math.max(classification.relevance_score ?? 0, 40);
        payload.match_confidence = classification.match_confidence ?? 0;
        payload.match_reasons_json = classification.match_reasons_json?.length
          ? classification.match_reasons_json
          : [{ type: 'source', label: 'SAM.gov opportunity' }];
        payload.classification_version = classification.classification_version ?? 'v1';
        payload.suppressed = classification.suppressed ?? false;
        payload.suppressed_reason = classification.suppressed_reason ?? null;
        payload.weight_override = classification.suppressed ? 0 : Math.max(1, Math.round((payload.relevance_score || 0) / 10));

        const [program] = await ProcurementProgram.upsert(
          { ...payload, updated_at: new Date() },
          { conflictFields: ['source', 'external_id'] }
        );
        const programId = program.id;
        recordsUpserted += 1;

        // Sprint 2: also upsert into unified program_items
        const programItemPayload = {
          source_type: 'sam_opportunity',
          source_id: payload.external_id,
          title: payload.title,
          agency: payload.agency,
          agency_path: payload.agency_path,
          status: payload.status,
          notice_type: payload.notice_type,
          posted_at: payload.posted_at,
          updated_at_source: payload.updated_at_source,
          due_at: payload.due_at,
          description: payload.description,
          naics: payload.naics,
          psc: payload.psc,
          set_aside: payload.set_aside,
          place_of_performance_json: payload.place_of_performance_json,
          links_json: payload.url ? [{ url: payload.url, title: 'SAM.gov' }] : null,
          attachments_json: payload.attachments_json,
          contacts_json: payload.contacts_json,
          service_lane: payload.service_lane,
          topic: payload.topic,
          relevance_score: payload.relevance_score,
          match_confidence: payload.match_confidence,
          match_reasons_json: payload.match_reasons_json,
          classification_version: payload.classification_version ?? 'v1_rules',
          suppressed: payload.suppressed,
          suppressed_reason: payload.suppressed_reason,
          raw_json: payload.raw_json,
        };
        await ProgramItem.upsert(
          { ...programItemPayload, updated_at: new Date() },
          { conflictFields: ['source_type', 'source_id'] }
        );

        const programText = [payload.title, payload.summary, payload.agency].filter(Boolean).join(' ');
        const accountLinks = await attemptAccountLinking(programId, programText);

        for (const link of accountLinks) {
          await ProgramAccountLink.findOrCreate({
            where: {
              procurement_program_id: link.procurement_program_id,
              prospect_company_id: link.prospect_company_id,
            },
            defaults: link,
          });
        }

        const linkedAccounts = await ProgramAccountLink.findAll({
          where: { procurement_program_id: programId },
          attributes: ['prospect_company_id'],
        });

        const postedAt = payload.posted_at || new Date();
        for (const la of linkedAccounts) {
          await IntentSignal.findOrCreate({
            where: {
              prospect_company_id: la.prospect_company_id,
              signal_type: 'procurement_notice',
              external_ref_type: 'procurement_program',
              external_ref_id: programId,
            },
            defaults: {
              prospect_company_id: la.prospect_company_id,
              signal_type: 'procurement_notice',
              service_lane: payload.service_lane,
              topic: payload.topic,
              weight: payload.weight_override ?? 1,
              occurred_at: postedAt,
              source: 'sam_opportunity',
              external_ref_type: 'procurement_program',
              external_ref_id: programId,
              meta_json: {
                due_at: payload.due_at,
                notice_type: payload.notice_type,
                title: payload.title?.slice(0, 200),
              },
            },
          });
        }
      } catch (err) {
        errorCount += 1;
        if (errorSamples.length < 5) {
          errorSamples.push({ external_id: item?.noticeId, error: err.message });
        }
      }
    }

    await run.update({
      finished_at: new Date(),
      status: errorCount > 0 && recordsUpserted === 0 ? 'failed' : errorCount > 0 ? 'partial' : 'success',
      records_fetched: recordsFetched,
      records_upserted: recordsUpserted,
      error_count: errorCount,
      error_sample_json: errorSamples.length ? errorSamples : null,
    });
  } catch (err) {
    await run.update({
      finished_at: new Date(),
      status: 'failed',
      records_fetched: recordsFetched,
      records_upserted: recordsUpserted,
      error_count: errorCount + 1,
      error_sample_json: [{ error: err.message }],
    });
    throw err;
  }

  return { run, recordsFetched, recordsUpserted, errorCount };
}

if (require.main === module) {
  runImport()
    .then((r) => {
      console.log('SAM import complete:', r);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { runImport, fetchSamOpportunities };
