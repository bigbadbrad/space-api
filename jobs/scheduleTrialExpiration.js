// /jobs/scheduleTrialExpiration.js
const reminderQueue = require('../utils/queues/reminderQueue');

async function scheduleTrialExpiration() {
  await reminderQueue.add('expire-trials', {}, {
    repeat: { cron: '0 4 * * *' }, // every day at 4:00 AM UTC
    removeOnComplete: true,
    removeOnFail: true,
    jobId: 'daily-trial-expiry',
  });

  console.log('✅ Daily trial-expired job scheduled');
}

scheduleTrialExpiration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Failed to schedule trial-expired job:', err);
    process.exit(1);
  });
