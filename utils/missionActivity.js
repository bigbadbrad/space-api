/**
 * ABM Rev 3: Log mission timeline/audit events.
 * Uses MissionActivity with type = event_type, meta_json = payload, created_by_user_id = actor.
 */
const { MissionActivity } = require('../models');

const EVENT_TYPES = [
  'mission_created',
  'lead_request_promoted',
  'program_linked',
  'account_linked',
  'contact_linked',
  'task_created',
  'task_completed',
  'note_added',
  'brief_generated',
  'salesforce_push_requested',
  'salesforce_push_succeeded',
  'salesforce_push_failed',
  'stage_changed',
];

/**
 * @param {string} missionId
 * @param {string} eventType - one of EVENT_TYPES
 * @param {object} [payload] - optional event_payload_json
 * @param {string} [actorUserId] - user id who performed the action
 * @returns {Promise<MissionActivity>}
 */
async function logMissionActivity(missionId, eventType, payload = {}, actorUserId = null) {
  return MissionActivity.create({
    mission_id: missionId,
    type: eventType,
    body: payload.body ?? null,
    meta_json: payload.body !== undefined ? { ...payload, body: undefined } : payload,
    created_by_user_id: actorUserId,
  });
}

module.exports = { logMissionActivity, EVENT_TYPES };
