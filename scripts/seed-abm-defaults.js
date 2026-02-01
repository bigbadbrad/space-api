#!/usr/bin/env node
/**
 * Phase 2 MVP Step 4: Seed ABM registry defaults
 * Idempotent - safe to run multiple times
 */
require('dotenv').config();
const {
  AbmScoreConfig,
  AbmScoreWeight,
  AbmEventRule,
  AbmPromptTemplate,
} = require('../models');

const DEFAULT_CONFIG_NAME = 'default_v1';

const PAGE_VIEW_WEIGHTS = {
  pricing: 25,
  request_reservation: 30,
  integrations: 18,
  security: 18,
  case_study: 12,
  service_page: 10,
  directory_page: 8,
  docs: 6,
  blog: 3,
  comparison: 15,
  other: 1,
};

const CTA_WEIGHTS = {
  request_reservation: 25,
  contact_sales: 20,
};

const FORM_WEIGHTS = {
  form_started: 20,
  form_submitted: 60,
};

const SYSTEM_PROMPT = `You are an elite B2B ABM strategist. Generate concise, actionable account summaries for sales and marketing. Be specific about why the account is hot, what they likely care about, and what to do next. Do not invent facts. If something is uncertain, label it as a hypothesis.`;

const USER_PROMPT_TEMPLATE = `Create an "Account Brief" for the account in the JSON below.
Output exactly in this structure:

Why they're hot (3 bullets) — cite observed behaviors only  
Likely buying stage — one sentence  
Primary service interest — one sentence referencing lane scores  
Recommended next action (Sales) — 3 bullets  
Recommended next action (Marketing) — 3 bullets  
Personalization angle — 2 bullets with suggested messaging themes  
Risks / unknowns — 2 bullets  

Keep it under {{MAX_WORDS}} words.  
JSON: {{JSON_HERE}}`;

async function seed() {
  let config = await AbmScoreConfig.findOne({
    where: { name: DEFAULT_CONFIG_NAME },
  });
  if (!config) {
    config = await AbmScoreConfig.create({
      name: DEFAULT_CONFIG_NAME,
      status: 'active',
      lambda_decay: 0.1,
      normalize_k: 80,
      cold_max: 34,
      warm_max: 69,
      surge_surging_min: 1.5,
      surge_exploding_min: 2.5,
    });
    console.log('Created score config:', config.name);
  } else {
    console.log('Score config exists:', config.name);
  }

  const configId = config.id;

  for (const [contentType, weight] of Object.entries(PAGE_VIEW_WEIGHTS)) {
    await AbmScoreWeight.findOrCreate({
      where: {
        score_config_id: configId,
        event_name: 'page_view',
        content_type: contentType,
        cta_id: null,
      },
      defaults: { weight },
    });
  }
  for (const [ctaId, weight] of Object.entries(CTA_WEIGHTS)) {
    await AbmScoreWeight.findOrCreate({
      where: {
        score_config_id: configId,
        event_name: 'cta_click',
        content_type: null,
        cta_id: ctaId,
      },
      defaults: { weight },
    });
  }
  for (const [eventName, weight] of Object.entries(FORM_WEIGHTS)) {
    await AbmScoreWeight.findOrCreate({
      where: {
        score_config_id: configId,
        event_name: eventName,
        content_type: null,
        cta_id: null,
      },
      defaults: { weight },
    });
  }
  console.log('Score weights seeded');

  const eventRules = [
    // --- Service Lanes: map URLs to widget service lanes (Launch, Last-Mile Insertion, Orbit Transfer, Refuel, Docking, Upgrade, Disposal) ---
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/services/launch', content_type: 'service_page', lane: 'Launch', priority: 1 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/services/relocation', content_type: 'service_page', lane: 'Orbit Transfer (On-Orbit)', priority: 1 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/relocation', content_type: 'service_page', lane: 'Orbit Transfer (On-Orbit)', priority: 1 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'fuel', content_type: 'service_page', lane: 'Refuel', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'refuel', content_type: 'service_page', lane: 'Refuel', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'docking', content_type: 'service_page', lane: 'Docking', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'rendezvous', content_type: 'service_page', lane: 'Docking', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'isam', content_type: 'service_page', lane: 'Upgrade', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'upgrade', content_type: 'service_page', lane: 'Upgrade', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'servicing', content_type: 'service_page', lane: 'Upgrade', priority: 2 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/news/deorbit-as-a-service', content_type: 'service_page', lane: 'Disposal', priority: 1 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'deorbit', content_type: 'service_page', lane: 'Disposal', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'reentry', content_type: 'service_page', lane: 'Disposal', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'disposal', content_type: 'service_page', lane: 'Disposal', priority: 2 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'graveyard', content_type: 'service_page', lane: 'Disposal', priority: 2 },
    // Ground station, pricing, generic pages → Other
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/ground-station-pricing', content_type: 'pricing', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/optical-ground-stations-lasercom', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/leop-ground-station-support', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/ground-station-api-pass-orchestration', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/s-band-ttc-services', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/x-band-downlink-services', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/satellite-contact-scheduling', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/direct-to-cloud-downlink', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/mission-operations-support', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/on-demand-vs-reserved-satellite-contacts', content_type: 'service_page', lane: 'Other', priority: 5 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/ground-station', content_type: 'service_page', lane: 'Other', priority: 6 },
    // --- Generic content types (priority 10+) ---
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/pricing', content_type: 'pricing', lane: 'Other', priority: 10 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/services', content_type: 'service_page', lane: 'Other', priority: 20 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/security', content_type: 'security', lane: 'Other', priority: 20 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/integrations', content_type: 'integrations', lane: 'Other', priority: 20 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/request-reservation', content_type: 'request_reservation', lane: 'Other', priority: 15 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/request', content_type: 'request_reservation', lane: 'Other', priority: 25 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'case-study', content_type: 'case_study', lane: 'Other', priority: 30 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/docs', content_type: 'docs', lane: 'Other', priority: 40 },
    { event_name: 'page_view', match_type: 'path_prefix', match_value: '/blog', content_type: 'blog', lane: 'Other', priority: 50 },
    { event_name: 'page_view', match_type: 'contains', match_value: 'comparison', content_type: 'comparison', lane: 'Other', priority: 35 },
  ];
  for (const rule of eventRules) {
    const [r] = await AbmEventRule.findOrCreate({
      where: {
        event_name: rule.event_name,
        match_type: rule.match_type,
        match_value: rule.match_value,
      },
      defaults: {
        enabled: true,
        priority: rule.priority,
        content_type: rule.content_type,
        lane: rule.lane,
      },
    });
    await r.update({ priority: rule.priority, content_type: rule.content_type, lane: rule.lane });
  }
  console.log('Event rules seeded. Run `npm run abm:recompute` to refresh lane data.');

  const [prompt] = await AbmPromptTemplate.findOrCreate({
    where: { lane: '*', persona: '*', intent_stage: '*' },
    defaults: {
      enabled: true,
      lane: '*',
      persona: '*',
      intent_stage: '*',
      version: '1.0',
      system_prompt: SYSTEM_PROMPT,
      user_prompt_template: USER_PROMPT_TEMPLATE,
      max_words: 180,
    },
  });
  console.log('Prompt template seeded:', prompt.lane + '/' + prompt.persona + '/' + prompt.intent_stage);

  console.log('ABM defaults seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
