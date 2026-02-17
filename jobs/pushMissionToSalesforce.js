/**
 * ABM Rev 3: Worker job – push Mission to Salesforce (create/update Opportunity).
 */
const { Mission, ProspectCompany, Contact, LeadRequest } = require('../models');
const { pushMission } = require('../services/crmAdapter');
const { logMissionActivity } = require('../utils/missionActivity');

/**
 * @param {{ missionId: string }} data
 * @returns {Promise<{ success: boolean, opportunityId?: string, accountId?: string, error?: string }>}
 */
async function runPushMissionToSalesforce(data) {
  const { missionId } = data || {};
  if (!missionId) {
    throw new Error('missionId required');
  }

  const mission = await Mission.findByPk(missionId, {
    include: [
      { model: ProspectCompany, as: 'prospectCompany', attributes: ['id', 'name', 'domain'] },
      { model: Contact, as: 'primaryContact', attributes: ['id', 'email', 'first_name', 'last_name', 'title'] },
      { model: LeadRequest, as: 'leadRequest', attributes: ['id', 'organization_name', 'organization_website', 'work_email'] },
    ],
  });

  if (!mission) {
    throw new Error('Mission not found');
  }

  const payload = {
    id: mission.id,
    title: mission.title,
    stage: mission.stage,
    service_lane: mission.service_lane,
    prospect_company_id: mission.prospect_company_id,
    primary_contact_id: mission.primary_contact_id,
    lead_request_id: mission.lead_request_id,
    salesforce_opportunity_id: mission.salesforce_opportunity_id || null,
    salesforce_account_id: mission.salesforce_account_id || null,
    prospectCompany: mission.prospectCompany ? mission.prospectCompany.toJSON() : null,
    primaryContact: mission.primaryContact ? mission.primaryContact.toJSON() : null,
    leadRequest: mission.leadRequest ? mission.leadRequest.toJSON() : null,
  };

  try {
    const result = await pushMission(payload);

    if (result.opportunityId || result.accountId) {
      await mission.update({
        salesforce_opportunity_id: result.opportunityId || mission.salesforce_opportunity_id,
        salesforce_account_id: result.accountId || mission.salesforce_account_id,
        salesforce_sync_status: 'synced',
        salesforce_last_synced_at: new Date(),
        salesforce_last_error: null,
      });
      await logMissionActivity(missionId, 'salesforce_push_succeeded', {
        opportunity_id: result.opportunityId,
        account_id: result.accountId,
      }, null);
      return { success: true, opportunityId: result.opportunityId, accountId: result.accountId };
    }

    // Stub or no-op: still mark as synced if adapter didn't throw (e.g. not configured)
    await mission.update({
      salesforce_sync_status: 'synced',
      salesforce_last_synced_at: new Date(),
      salesforce_last_error: null,
    });
    await logMissionActivity(missionId, 'salesforce_push_succeeded', { stub: true }, null);
    return { success: true };
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[pushMissionToSalesforce]', message);
    await mission.update({
      salesforce_sync_status: 'error',
      salesforce_last_error: message,
    });
    await logMissionActivity(missionId, 'salesforce_push_failed', { error: message }, null);
    return { success: false, error: message };
  }
}

module.exports = { runPushMissionToSalesforce };
