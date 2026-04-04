/**
 * Consumer GTM — publisher:publish queue (BullMQ)
 * Spec: consumer-gtm-properties-publisher-v1.md §5.1
 */
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Queue name cannot contain ':' in BullMQ
const publisherPublishQueue = new Queue('publisher-publish', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 500 },
  },
});

/**
 * Enqueue a publish job.
 * @param {{ post_id: string }} payload
 * @param {{ delay?: number }} options - delay in ms (e.g. scheduled_for - now)
 */
async function addPublishJob(payload, options = {}) {
  return publisherPublishQueue.add('publish', payload, {
    jobId: payload.post_id,
    delay: options.delay && options.delay > 0 ? options.delay : undefined,
  });
}

module.exports = publisherPublishQueue;
module.exports.addPublishJob = addPublishJob;
