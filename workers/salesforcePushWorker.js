/**
 * ABM Rev 3: Worker for Mission → Salesforce push jobs
 */
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { runPushMissionToSalesforce } = require('../jobs/pushMissionToSalesforce');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const worker = new Worker('abm-salesforce-push', async (job) => {
  if (job.name === 'push-mission') {
    return await runPushMissionToSalesforce(job.data || {});
  }
}, { connection });

worker.on('completed', (job, result) => {
  console.log('✅ Salesforce push job completed:', result);
});

worker.on('failed', (job, err) => {
  console.error('❌ Salesforce push job failed:', err?.message || err);
});

console.log('🚀 Salesforce push worker started...');
