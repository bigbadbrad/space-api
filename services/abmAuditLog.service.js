/**
 * ABM Admin Audit Log - write registry changes for Super User accountability
 */
const { AbmAdminAuditLog } = require('../models');

/**
 * Log an admin action (create/update/delete/activate)
 * @param {object} params
 * @param {string} params.userId - User who made the change
 * @param {string} params.action - create, update, delete, activate
 * @param {string} params.tableName - abm_event_rules, abm_prompt_templates, abm_score_configs, abm_score_weights
 * @param {string} [params.recordId]
 * @param {object} [params.before]
 * @param {object} [params.after]
 */
async function logAudit({ userId, action, tableName, recordId, before, after }) {
  try {
    await AbmAdminAuditLog.create({
      user_id: userId || null,
      action: action || 'update',
      table_name: tableName || 'unknown',
      record_id: recordId ? String(recordId) : null,
      before_json: before || null,
      after_json: after || null,
    });
  } catch (err) {
    console.error('abmAuditLog: failed to write', err.message);
  }
}

module.exports = { logAudit };
