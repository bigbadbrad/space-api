#!/usr/bin/env node
/**
 * ABM Procurement Addendum: Seed program intelligence (program rules, suppression rules, lane definitions)
 * Idempotent - safe to run multiple times
 */
require('dotenv').config();
const { AbmProgramRule, AbmProgramSuppressionRule, AbmLaneDefinition, AbmAgencyBlacklist } = require('../models');

const AGENCY_BLACKLIST = [
  { agency_pattern: 'VETERANS AFFAIRS', notes: 'VA contracts typically non-space (healthcare, benefits, facilities)' },
];

const SUPPRESSION_RULES = [
  { priority: 100, match_field: '*', match_type: 'contains', match_value: 'HVAC|air conditioner|plumbing|janitorial|roof|generator maintenance|actuator|valve|starter motor|UPS|fuel card|office supplies|medical coding|claims review', suppress_reason: 'Non-space facilities/maintenance' },
  { priority: 90, match_field: 'title', match_type: 'contains', match_value: 'HVAC', suppress_reason: 'HVAC' },
  { priority: 90, match_field: 'title', match_type: 'contains', match_value: 'plumbing', suppress_reason: 'Plumbing' },
  { priority: 90, match_field: 'title', match_type: 'contains', match_value: 'actuator', suppress_reason: 'Generic actuator' },
  { priority: 90, match_field: 'title', match_type: 'contains', match_value: 'janitorial', suppress_reason: 'Janitorial' },
  { priority: 90, match_field: 'title', match_type: 'contains', match_value: 'office supplies', suppress_reason: 'Office supplies' },
  { priority: 90, match_field: 'title', match_type: 'contains', match_value: 'medical coding', suppress_reason: 'Medical coding' },
  { priority: 90, match_field: 'title', match_type: 'contains', match_value: 'claims review', suppress_reason: 'Claims review' },
];

const POSITIVE_RULES = [
  { priority: 100, match_field: '*', match_type: 'contains', match_value: 'hosted payload|payload integration|payload accommodation|rideshare payload|secondary payload', service_lane: 'hosted_payload', topic: 'Hosted Payload', add_score: 40 },
  { priority: 100, match_field: '*', match_type: 'contains', match_value: 'launch services|launch vehicle|rideshare|payload to orbit|launch integration', service_lane: 'launch', topic: 'Launch', add_score: 40 },
  { priority: 100, match_field: '*', match_type: 'contains', match_value: 'ground station|TT&C|telemetry tracking|antenna|downlink|uplink|X-band|S-band|Ka-band', service_lane: 'ground_station', topic: 'Ground Station', add_score: 35 },
  { priority: 100, match_field: '*', match_type: 'contains', match_value: 'orbital transfer|space tug|OTV|rendezvous|proximity ops|station-keeping', service_lane: 'relocation', topic: 'Mobility/Relocation', add_score: 40 },
  { priority: 100, match_field: '*', match_type: 'contains', match_value: 'on-orbit servicing|inspection|rpo|life extension|debris removal|refueling', service_lane: 'isam', topic: 'ISAM', add_score: 40 },
  { priority: 100, match_field: '*', match_type: 'contains', match_value: 'reentry|return capsule|downmass|in-space manufacturing return', service_lane: 'reentry_return', topic: 'Return', add_score: 35 },
  { priority: 80, match_field: '*', match_type: 'contains', match_value: 'spacecraft', service_lane: 'launch', topic: 'Spacecraft', add_score: 25 },
  { priority: 80, match_field: '*', match_type: 'contains', match_value: 'satellite', service_lane: 'launch', topic: 'Satellite', add_score: 25 },
  { priority: 80, match_field: '*', match_type: 'contains', match_value: 'space', service_lane: 'launch', topic: 'Space', add_score: 20 },
  { priority: 80, match_field: '*', match_type: 'contains', match_value: 'orbital', service_lane: 'launch', topic: 'Orbital', add_score: 25 },
  { priority: 80, match_field: '*', match_type: 'contains', match_value: 'LEO|GEO|MEO', service_lane: 'launch', topic: 'Orbit', add_score: 20 },
];

const LANE_DEFINITIONS = [
  { lane_key: 'launch', display_name: 'Launch', description: 'Launch services, launch vehicles, rideshare, payload to orbit', keywords_json: ['launch', 'rideshare', 'payload to orbit', 'launch vehicle'] },
  { lane_key: 'hosted_payload', display_name: 'Hosted Payload', description: 'Hosted payload, payload integration, payload accommodation, secondary payload', keywords_json: ['hosted payload', 'payload integration', 'rideshare payload'] },
  { lane_key: 'ground_station', display_name: 'Ground Station', description: 'Ground station, TT&C, telemetry tracking, antenna, downlink, uplink', keywords_json: ['ground station', 'TT&C', 'telemetry', 'antenna', 'downlink'] },
  { lane_key: 'relocation', display_name: 'Mobility/Relocation', description: 'Orbital transfer, space tug, OTV, rendezvous, proximity ops', keywords_json: ['orbital transfer', 'space tug', 'OTV', 'rendezvous'] },
  { lane_key: 'isam', display_name: 'ISAM', description: 'On-orbit servicing, inspection, RPO, life extension, debris removal, refueling', keywords_json: ['on-orbit servicing', 'inspection', 'RPO', 'debris removal'] },
  { lane_key: 'reentry_return', display_name: 'Return', description: 'Reentry, return capsule, downmass, in-space manufacturing return', keywords_json: ['reentry', 'return capsule', 'downmass'] },
  { lane_key: 'fueling', display_name: 'Fueling', description: 'Spacecraft fueling, propellant transfer', keywords_json: ['refueling', 'propellant', 'fueling'] },
];

async function seed() {
  for (const b of AGENCY_BLACKLIST) {
    const [row] = await AbmAgencyBlacklist.findOrCreate({
      where: { agency_pattern: b.agency_pattern },
      defaults: { enabled: true, notes: b.notes },
    });
    if (row.isNewRecord) console.log('Created agency blacklist:', b.agency_pattern);
  }

  for (const r of SUPPRESSION_RULES) {
    const [row] = await AbmProgramSuppressionRule.findOrCreate({
      where: {
        match_field: r.match_field,
        match_type: r.match_type,
        match_value: r.match_value,
      },
      defaults: {
        enabled: true,
        priority: r.priority,
        suppress_reason: r.suppress_reason,
        suppress_score_threshold: null,
      },
    });
    if (row.isNewRecord) console.log('Created suppression rule:', r.suppress_reason?.slice(0, 40));
  }

  for (const r of POSITIVE_RULES) {
    const [row] = await AbmProgramRule.findOrCreate({
      where: {
        match_field: r.match_field,
        match_type: r.match_type,
        match_value: r.match_value,
      },
      defaults: {
        enabled: true,
        priority: r.priority,
        service_lane: r.service_lane,
        topic: r.topic,
        add_score: r.add_score,
      },
    });
    if (row.isNewRecord) console.log('Created program rule:', r.service_lane);
  }

  for (const l of LANE_DEFINITIONS) {
    await AbmLaneDefinition.upsert({
      lane_key: l.lane_key,
      display_name: l.display_name,
      description: l.description,
      keywords_json: l.keywords_json,
      updated_at: new Date(),
    }, { conflictFields: ['lane_key'] });
  }
  console.log('Program intelligence seeded.');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
