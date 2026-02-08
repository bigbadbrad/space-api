#!/usr/bin/env node
/**
 * One-time backfill: copy procurement_programs (SAM) into program_items
 * Run after migration 20260205001000
 */
require('dotenv').config();
const {
  ProcurementProgram,
  ProgramAccountLink,
  ProgramMissionLink,
  ProgramItem,
  ProgramItemAccountLink,
  ProgramItemMissionLink,
} = require('../models');

async function run() {
  const programs = await ProcurementProgram.findAll({
    where: { source: 'sam_opportunity' },
    include: [
      { model: ProgramAccountLink, as: 'accountLinks' },
      { model: ProgramMissionLink, as: 'missionLinks' },
    ],
  });

  let created = 0;
  let updated = 0;
  let linkAccount = 0;
  let linkMission = 0;

  for (const p of programs) {
    const payload = {
      source_type: 'sam_opportunity',
      source_id: p.external_id,
      title: p.title,
      agency: p.agency,
      agency_path: p.agency_path,
      status: p.status,
      notice_type: p.notice_type,
      posted_at: p.posted_at,
      updated_at_source: p.updated_at_source,
      due_at: p.due_at,
      description: p.description,
      naics: p.naics,
      psc: p.psc,
      set_aside: p.set_aside,
      place_of_performance_json: p.place_of_performance_json,
      links_json: p.url ? [{ url: p.url, title: 'SAM.gov' }] : null,
      attachments_json: p.attachments_json,
      contacts_json: p.contacts_json,
      service_lane: p.service_lane,
      topic: p.topic,
      relevance_score: p.relevance_score ?? 0,
      match_confidence: p.match_confidence ?? 0,
      match_reasons_json: p.match_reasons_json,
      classification_version: p.classification_version ?? 'v1_rules',
      suppressed: p.suppressed ?? false,
      suppressed_reason: p.suppressed_reason,
      triage_status: p.triage_status || 'new',
      priority: p.priority || 'med',
      owner_user_id: p.owner_user_id,
      last_triaged_at: p.last_triaged_at,
      raw_json: p.raw_json,
    };

    const [item, createdFlag] = await ProgramItem.upsert(
      { id: p.id, ...payload, updated_at: new Date() },
      { conflictFields: ['source_type', 'source_id'] }
    );
    if (createdFlag) created++;
    else updated++;

    for (const link of p.accountLinks || []) {
      await ProgramItemAccountLink.findOrCreate({
        where: { program_item_id: item.id, prospect_company_id: link.prospect_company_id },
        defaults: {
          program_item_id: item.id,
          prospect_company_id: link.prospect_company_id,
          link_type: link.link_type || 'unknown',
          confidence: link.confidence ?? 0.5,
          evidence_json: link.evidence_json,
          created_by_user_id: link.created_by_user_id,
        },
      });
      linkAccount++;
    }

    for (const link of p.missionLinks || []) {
      await ProgramItemMissionLink.findOrCreate({
        where: { program_item_id: item.id, mission_id: link.mission_id },
        defaults: {
          program_item_id: item.id,
          mission_id: link.mission_id,
          notes: link.notes,
          created_by_user_id: link.created_by_user_id,
        },
      });
      linkMission++;
    }
  }

  console.log('Backfill complete:', { programs: programs.length, created, updated, linkAccount, linkMission });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
