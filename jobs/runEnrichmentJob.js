/**
 * Run a single enrichment job: call provider, store raw in enrichment_sources, normalize into prospect_companies/contacts.
 * Spec §5.4, §6.1, §9.2
 */
const { EnrichmentJob, EnrichmentSource, ProspectCompany, Contact } = require('../models');
const { ClayProvider } = require('../services/enrichment/ClayProvider');

const provider = new ClayProvider();

async function runEnrichmentJob(jobId) {
  const job = await EnrichmentJob.findByPk(jobId);
  if (!job || job.status !== 'queued') return { ok: false, reason: 'job not found or not queued' };

  await job.update({ status: 'running' });

  try {
    if (job.target_type === 'company') {
      const company = await ProspectCompany.findByPk(job.target_id);
      if (!company) {
        await job.update({ status: 'error', error_message: 'Prospect company not found', completed_at: new Date() });
        return { ok: false };
      }
      let result = await provider.enrichCompany({
        name: company.name,
        domain: company.domain,
      });
      if (!result.contacts?.length && company.domain) {
        const found = await provider.findContacts({ domain: company.domain });
        result = { firmographics: result.firmographics, contacts: result.contacts?.length ? result.contacts : (found.contacts || []) };
      }
      const raw = { firmographics: result.firmographics, contacts: result.contacts || [], _at: new Date().toISOString() };
      await EnrichmentSource.create({
        enrichment_job_id: job.id,
        provider: job.provider,
        raw_json: raw,
      });
      await normalizeCompanyResult(job.target_id, result);
      await normalizeContactsResult(job.target_id, result.contacts || []);
    }
    await job.update({ status: 'done', completed_at: new Date() });
    return { ok: true };
  } catch (err) {
    console.error('Enrichment job error:', err);
    await job.update({
      status: 'error',
      error_message: err.message || String(err),
      completed_at: new Date(),
    });
    return { ok: false, error: err.message };
  }
}

function normalizeCompanyResult(prospectCompanyId, result) {
  const updates = {};
  if (result.firmographics) {
    if (result.firmographics.name) updates.name = result.firmographics.name;
    if (result.firmographics.domain) updates.domain = result.firmographics.domain;
    if (result.firmographics.industry) updates.intent_stage = result.firmographics.industry;
  }
  if (Object.keys(updates).length > 0) {
    return ProspectCompany.update(updates, { where: { id: prospectCompanyId } });
  }
  return Promise.resolve();
}

function normalizeContactsResult(prospectCompanyId, contacts) {
  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) return Promise.resolve();
  return Promise.all(
    contacts.map((c) => {
      const email = c.email || c.email_address;
      if (!email) return Promise.resolve();
      const firstName = c.first_name || c.firstName || (c.name && c.name.split(/\s+/)[0]) || null;
      const lastName = c.last_name || c.lastName || (c.name && c.name.split(/\s+/).slice(1).join(' ')) || null;
      const title = c.title || c.job_title || null;
      return Contact.findOne({ where: { prospect_company_id: prospectCompanyId, email } }).then((existing) => {
        if (existing) {
          return existing.update({ first_name: firstName ?? existing.first_name, last_name: lastName ?? existing.last_name, title: title ?? existing.title });
        }
        return Contact.create({
          prospect_company_id: prospectCompanyId,
          email,
          first_name: firstName,
          last_name: lastName,
          title,
        });
      });
    })
  );
}

module.exports = { runEnrichmentJob };
