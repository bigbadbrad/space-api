'use strict';

const { resolveCompanyDomain, computeLeadScore } = require('../utils/leadRequests');
const {
  ProspectCompany,
  Contact,
  User,
  IntentSignal,
  LeadRequest,
} = require('../models');
const { Op } = require('sequelize');

function pickUtm(utm) {
  const u = utm || {};
  return {
    utm_source: u.source || null,
    utm_medium: u.medium || null,
    utm_campaign: u.campaign || null,
    utm_content: u.content || null,
    utm_term: u.term || null,
  };
}

function pickTracking(tracking) {
  const t = tracking || {};
  return {
    tracking_session_id: t.session_id || null,
    tracking_client_id: t.client_id || null,
    posthog_distinct_id: t.posthog_distinct_id || null,
  };
}

async function upsertProspectCompany(payload, domain) {
  if (!domain) return null;

  const name = payload.organization_name || null;

  const [company] = await ProspectCompany.findOrCreate({
    where: { domain },
    defaults: {
      name: name || domain,
      domain,
      stage: 'new',
      intent_score: 0,
    },
  });

  // Update name if missing
  if (name && (!company.name || company.name === company.domain)) {
    company.name = name;
  }

  // Basic stage bump
  if (company.stage === 'new') company.stage = 'engaged';

  await company.save();
  return company;
}

async function upsertContact(payload, prospectCompanyId) {
  const email = payload.work_email || null;
  if (!email || !prospectCompanyId) return null;

  const [contact] = await Contact.findOrCreate({
    where: { prospect_company_id: prospectCompanyId, email },
    defaults: {
      prospect_company_id: prospectCompanyId,
      email,
      first_name: null,
      last_name: null,
      title: null,
      status: 'new',
    },
  });

  contact.last_seen_at = new Date();
  if (payload.role && !contact.title) contact.title = payload.role;

  if (contact.status === 'new') contact.status = 'engaged';

  await contact.save();
  return contact;
}

async function createIntentSignals(prospectCompanyId, payload, leadScore) {
  if (!prospectCompanyId) return;

  const now = new Date();
  const signals = [];

  signals.push({
    prospect_company_id: prospectCompanyId,
    signal_type: 'lead_submitted',
    topic: payload.service_needed || null,
    weight: Math.min(80, Math.max(30, Math.floor(leadScore / 2))),
    occurred_at: now,
  });

  if (payload.budget_band) {
    signals.push({
      prospect_company_id: prospectCompanyId,
      signal_type: 'budget_band',
      topic: payload.service_needed || null,
      weight: leadScore >= 80 ? 20 : 10,
      occurred_at: now,
    });
  }

  if (payload.schedule_urgency) {
    signals.push({
      prospect_company_id: prospectCompanyId,
      signal_type: 'schedule_urgency',
      topic: payload.service_needed || null,
      weight: leadScore >= 80 ? 20 : 10,
      occurred_at: now,
    });
  }

  if (payload.readiness_confidence) {
    signals.push({
      prospect_company_id: prospectCompanyId,
      signal_type: 'readiness_confidence',
      topic: payload.service_needed || null,
      weight: leadScore >= 80 ? 15 : 8,
      occurred_at: now,
    });
  }

  await IntentSignal.bulkCreate(signals);
}

async function recomputeCompanyIntentScore(prospectCompanyId) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const sum = await IntentSignal.sum('weight', {
    where: {
      prospect_company_id: prospectCompanyId,
      occurred_at: { [Op.gte]: cutoff },
    },
  });

  const company = await ProspectCompany.findByPk(prospectCompanyId);
  if (!company) return;

  company.intent_score = Math.floor(sum || 0);
  company.intent_last_at = new Date();
  if (company.stage === 'new') company.stage = 'engaged';

  await company.save();
}

function validateLeadPayload(payload) {
  if (!payload) return 'Missing body';
  if (!payload.service_needed) return 'service_needed is required';
  if (!payload.organization_name) return 'organization_name is required';
  if (!payload.work_email) return 'work_email is required';
  if (payload.consent_contact !== true) return 'consent_contact must be true';
  return null;
}

module.exports = {
  /**
   * Public endpoint: POST /api/hooks/lead-requests
   * Receives the modal payload.
   */
  async createLeadRequest(req, res) {
    const payload = req.body;

    const err = validateLeadPayload(payload);
    if (err) return res.status(400).json({ ok: false, error: err });

    const domain = resolveCompanyDomain(payload);
    const leadScore = computeLeadScore(payload);

    const company = await upsertProspectCompany(payload, domain);
    const contact = await upsertContact(payload, company ? company.id : null);

    const leadRequest = await LeadRequest.create({
      prospect_company_id: company ? company.id : null,
      contact_id: contact ? contact.id : null,

      service_needed: payload.service_needed,
      mission_type: payload.mission_type || null,

      target_orbit: payload.target_orbit || null,
      inclination_deg: payload.inclination_deg ?? null,
      payload_mass_kg: payload.payload_mass_kg ?? null,
      payload_volume: payload.payload_volume || null,

      earliest_date: payload.earliest_date || null,
      latest_date: payload.latest_date || null,
      schedule_urgency: payload.schedule_urgency || null,

      integration_status: payload.integration_status || null,
      readiness_confidence: payload.readiness_confidence || null,

      organization_name: payload.organization_name || null,
      organization_website: payload.organization_website || null,
      role: payload.role || null,
      work_email: payload.work_email || null,
      country: payload.country || null,

      funding_status: payload.funding_status || null,
      budget_band: payload.budget_band || null,

      phone: payload.phone || null,
      linkedin_url: payload.linkedin_url || null,

      notes: payload.notes || null,
      spec_link: payload.spec_link || null,

      attachments_json: payload.attachments || [],

      consent_contact: !!payload.consent_contact,
      consent_share: !!payload.consent_share,

      ...pickUtm(payload.utm),
      ...pickTracking(payload.tracking),

      lead_score: leadScore,
      routing_status: 'new',

      payload_json: payload,
    });

    if (company) {
      await createIntentSignals(company.id, payload, leadScore);
      await recomputeCompanyIntentScore(company.id);
    }

    return res.status(201).json({
      ok: true,
      lead_request_id: leadRequest.id,
      lead_score: leadScore,
      prospect_company_id: company ? company.id : null,
      contact_id: contact ? contact.id : null,
    });
  },
};

