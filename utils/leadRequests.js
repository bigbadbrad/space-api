'use strict';

function safeLower(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

function extractDomainFromUrl(url) {
  try {
    if (!url) return null;
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return safeLower(u.hostname).replace(/^www\./, '');
  } catch {
    return null;
  }
}

function extractDomainFromEmail(email) {
  const e = safeLower(email);
  if (!e.includes('@')) return null;
  const domain = e.split('@')[1];
  if (
    !domain ||
    domain.includes('gmail.') ||
    domain.includes('yahoo.') ||
    domain.includes('outlook.') ||
    domain.includes('hotmail.')
  ) {
    // Keep it, but it won’t be a strong company key.
    return domain || null;
  }
  return domain;
}

function resolveCompanyDomain(payload) {
  return (
    extractDomainFromUrl(payload.organization_website) ||
    extractDomainFromEmail(payload.work_email) ||
    null
  );
}

/**
 * Compute a lead_score (0..200-ish) based on qualifiers.
 * Keep it simple and transparent. You can tweak weights later.
 */
function computeLeadScore(payload) {
  let score = 0;

  // Consent is table stakes
  if (payload.consent_contact) score += 10;

  // Budget
  const budget = payload.budget_band || '';
  if (budget.includes('$5M')) score += 60;
  else if (budget.includes('$1M')) score += 45;
  else if (budget.includes('$250K')) score += 25;
  else if (budget.includes('$0') || budget.includes('<')) score += 5;

  // Funding status
  const funding = payload.funding_status || '';
  if (funding.toLowerCase().includes('approved')) score += 35;
  else if (funding.toLowerCase().includes('funded')) score += 25;

  // Timeline / urgency
  const urgency = (payload.schedule_urgency || '').toLowerCase();
  if (urgency.includes('next 30')) score += 35;
  else if (urgency.includes('next 3')) score += 25;
  else if (urgency.includes('next 6')) score += 15;

  // Readiness
  const rc = (payload.readiness_confidence || '').toLowerCase();
  if (rc === 'high') score += 25;
  else if (rc === 'medium') score += 15;
  else if (rc === 'low') score += 5;

  // Integration status
  const is = (payload.integration_status || '').toLowerCase();
  if (is.includes('complete')) score += 20;
  else if (is.includes('in progress')) score += 10;

  // Mission type
  const mt = (payload.mission_type || '').toLowerCase();
  if (mt.includes('dedicated')) score += 20;

  // Completeness bonus (qual form quality)
  const completenessFields = [
    payload.service_needed,
    payload.target_orbit,
    payload.payload_mass_kg,
    payload.earliest_date,
    payload.latest_date,
    payload.organization_name,
    payload.work_email,
  ];
  const filled = completenessFields.filter(
    (v) => v !== null && v !== undefined && `${v}`.trim() !== ''
  ).length;
  score += filled * 3;

  return Math.max(0, score);
}

module.exports = {
  resolveCompanyDomain,
  computeLeadScore,
  extractDomainFromUrl,
  extractDomainFromEmail,
};

