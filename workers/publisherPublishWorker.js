/**
 * Consumer GTM — worker for publisher:publish queue
 * Spec: consumer-gtm-properties-publisher-v1.md §5
 */
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { runPublishPublisherPost } = require('../jobs/publishPublisherPost');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const worker = new Worker(
  'publisher-publish',
  async (job) => {
    if (job.name === 'publish') {
      return await runPublishPublisherPost(job.data || {});
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on('completed', (job, result) => {
  console.log(`✅ Publisher publish job ${job.id} completed:`, result?.success ? 'published' : result?.reason || result?.error_message);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Publisher publish job ${job?.id} failed:`, err?.message || err);
});

console.log('🚀 Publisher publish worker started (queue: publisher-publish)...');
