/**
 * Phase 2 MVP: Worker for ABM intent recompute job
 */
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { runRecomputeIntentJob } = require('../abm/jobs/recomputeAccountIntent');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const worker = new Worker('abm-intent-recompute', async (job) => {
  if (job.name === 'recompute-intent') {
    const result = await runRecomputeIntentJob();
    return result;
  }
}, { connection });

worker.on('completed', (job, result) => {
  console.log(`✅ ABM intent job completed:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`❌ ABM intent job failed:`, err?.message || err);
});

console.log('🚀 ABM intent worker started...');
