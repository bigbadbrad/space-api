#!/usr/bin/env node
/**
 * ABM Rev 3: Seed procurement registry defaults (topic rules + source weights)
 * Idempotent - safe to run multiple times
 */
require('dotenv').config();
const { AbmTopicRule, AbmSourceWeight } = require('../models');

const DEFAULT_TOPIC_RULES = [
  { priority: 100, match_field: 'title', match_type: 'contains', match_value: 'hosted payload', service_lane: 'Hosted Payload', topic: 'hosted payload', weight: 3 },
  { priority: 100, match_field: 'title', match_type: 'contains', match_value: 'on-orbit servicing', service_lane: 'On-Orbit Servicing', topic: 'on-orbit servicing', weight: 3 },
  { priority: 100, match_field: 'title', match_type: 'contains', match_value: 'refueling', service_lane: 'Fuel', topic: 'refueling', weight: 3 },
  { priority: 100, match_field: 'title', match_type: 'contains', match_value: 'space', service_lane: 'Launch', topic: 'space', weight: 2 },
  { priority: 100, match_field: 'title', match_type: 'contains', match_value: 'satellite', service_lane: 'Launch', topic: 'satellite', weight: 2 },
  { priority: 100, match_field: 'title', match_type: 'contains', match_value: 'launch', service_lane: 'Launch', topic: 'launch', weight: 2 },
  { priority: 100, match_field: 'title', match_type: 'contains', match_value: 'ground', service_lane: 'Ground', topic: 'ground systems', weight: 2 },
  { priority: 50, match_field: 'title', match_type: 'contains', match_value: 'LEO', service_lane: 'Launch', topic: 'LEO', weight: 2 },
  { priority: 50, match_field: 'title', match_type: 'contains', match_value: 'GEO', service_lane: 'Launch', topic: 'GEO', weight: 2 },
];

const DEFAULT_SOURCE_WEIGHTS = [
  { source: 'sam_opportunity', multiplier: 1.2 },
  { source: 'usaspending_award', multiplier: 1.0 },
];

async function seed() {
  for (const rule of DEFAULT_TOPIC_RULES) {
    const [row] = await AbmTopicRule.findOrCreate({
      where: {
        match_field: rule.match_field,
        match_type: rule.match_type,
        match_value: rule.match_value,
      },
      defaults: {
        enabled: true,
        priority: rule.priority,
        source: null,
        service_lane: rule.service_lane,
        topic: rule.topic,
        weight: rule.weight,
      },
    });
    if (row.isNewRecord) console.log('Created topic rule:', rule.match_value);
  }

  for (const sw of DEFAULT_SOURCE_WEIGHTS) {
    await AbmSourceWeight.findOrCreate({
      where: { source: sw.source },
      defaults: { multiplier: sw.multiplier, enabled: true },
    });
  }
  console.log('Procurement registry seeded.');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
