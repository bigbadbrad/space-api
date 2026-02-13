#!/usr/bin/env node
/**
 * Phase 2 MVP: Schedule daily ABM intent recompute at 2am UTC
 * Run once on deploy to add the repeat job to the queue
 */
const abmIntentQueue = require('../queues/abmIntentQueue');

async function schedule() {
  await abmIntentQueue.add(
    'recompute-intent',
    {},
    {
      repeat: { cron: '15 3 * * *' }, // 03:15 UTC daily (Epic 4)
      removeOnComplete: true,
      jobId: 'abm-daily-recompute',
    }
  );
  console.log('✅ ABM intent daily job scheduled (2am UTC)');
  process.exit(0);
}

schedule().catch((err) => {
  console.error('Failed to schedule:', err);
  process.exit(1);
});
