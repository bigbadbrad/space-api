/**
 * Build program detail view model for the Program Inspector UI
 */
const { buildProgramViewFromRaw } = require('../utils/samExtractor');

function buildProgramDetailView(program, notes = [], owner = null) {
  const p = program.toJSON ? program.toJSON() : program;
  const view = buildProgramViewFromRaw(p);

  const overview = {
    agency: p.agency,
    office: p.office,
    agency_path: p.agency_path,
    notice_type: p.notice_type,
    posted_at: p.posted_at,
    updated_at_source: p.updated_at_source,
    due_at: p.due_at,
    set_aside: p.set_aside,
    naics: p.naics,
    psc: p.psc,
    place_of_performance: p.place_of_performance_json || view.place_of_performance,
    contract_type: p.raw_json?.contractType || p.raw_json?.contract_type || null,
    estimated_value: p.raw_json?.award?.amount || p.raw_json?.estimatedValue || null,
    solicitation_number: p.external_id || p.raw_json?.solicitationNumber || null,
    primary_urls: p.url ? [p.url] : [],
  };

  const requirements = {
    description: p.description || p.summary || view.description,
    extracted: view.requirements || {
      objective: null,
      scope: [],
      deliverables: [],
      submission: [],
      evaluation: [],
    },
  };

  const attachments = view.attachments || [];
  const contacts = view.contacts || [];

  const triage = {
    owner_user_id: p.owner_user_id,
    owner: owner ? { id: owner.id, name: owner.preferred_name || owner.name, email: owner.email } : null,
    triage_status: p.triage_status || 'new',
    priority: p.priority || 'medium',
    internal_notes: p.internal_notes,
    last_triaged_at: p.last_triaged_at,
  };

  const matching = {
    relevance_score: p.relevance_score ?? 0,
    match_confidence: p.match_confidence ?? 0,
    match_reasons_json: p.match_reasons_json || [],
    classification_version: p.classification_version || 'v1',
    suppressed: p.suppressed ?? false,
    suppressed_reason: p.suppressed_reason || null,
  };

  const whyMatched = Array.isArray(matching.match_reasons_json)
    ? matching.match_reasons_json
        .map((r) => r.label || r.pattern)
        .filter(Boolean)
        .join(', ')
    : '';

  return {
    program: {
      id: p.id,
      title: p.title,
      source: p.source,
      status: p.status,
      agency: p.agency,
      office: p.office,
      naics: p.naics,
      psc: p.psc,
      set_aside: p.set_aside,
      notice_type: p.notice_type,
      posted_at: p.posted_at,
      due_at: p.due_at,
      url: p.url,
      external_id: p.external_id,
      service_lane: p.service_lane,
      topic: p.topic,
      relevance_score: p.relevance_score,
      match_confidence: p.match_confidence,
      suppressed: p.suppressed,
      suppressed_reason: p.suppressed_reason,
      owner_user_id: p.owner_user_id,
      triage_status: p.triage_status,
      priority: p.priority,
      accountLinks: p.accountLinks,
      missionLinks: p.missionLinks,
      intent_signals: p.intent_signals,
    },
    overview,
    requirements,
    attachments,
    contacts,
    triage,
    matching,
    why_matched: whyMatched,
    notes,
  };
}

module.exports = { buildProgramDetailView };
