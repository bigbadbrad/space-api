/**
 * ABM Rev 3: Queue for Mission → Salesforce push jobs
 */
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const salesforcePushQueue = new Queue('abm-salesforce-push', {
  connection,
});

module.exports = salesforcePushQueue;
