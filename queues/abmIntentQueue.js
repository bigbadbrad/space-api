/**
 * Phase 2 MVP: BullMQ queue for ABM intent recompute job
 */
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const abmIntentQueue = new Queue('abm-intent-recompute', {
  connection,
});

module.exports = abmIntentQueue;
