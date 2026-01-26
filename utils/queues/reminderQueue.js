// utils/queues/reminderQueue.js
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // 🔥 REQUIRED for BullMQ compatibility
    retryStrategy: times => Math.min(times * 50, 2000), // optional but helpful for Heroku restarts
  });

const reminderQueue = new Queue('appointment-reminders', {
  connection
});

module.exports = reminderQueue;
