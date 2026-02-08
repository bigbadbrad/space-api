#!/usr/bin/env node
/**
 * Run all procurement ingests: SAM, USAspending, SpaceWERX
 * Used by server.js cron (2am UTC daily) and for manual runs
 */
function runProcurementIngests() {
  const { runImport } = require('./importSamOpportunities');
  const { runIngest: runUsaspending } = require('./ingestUsaspendingAwards');
  const { runIngest: runSpacewerx } = require('./ingestSpacewerxAwards');

  return Promise.allSettled([
    runImport().then((r) => ({ source: 'sam', result: r })),
    runUsaspending(30).then((r) => ({ source: 'usaspending', result: r })),
    runSpacewerx().then((r) => ({ source: 'spacewerx', result: r })),
  ]).then((results) => {
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') console.log('Procurement ingest OK:', r.value?.source);
      else console.error('Procurement ingest failed:', r.reason);
    });
    return results;
  });
}

if (require.main === module) {
  runProcurementIngests()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Procurement schedule failed:', e);
      process.exit(1);
    });
}

module.exports = { runProcurementIngests };
