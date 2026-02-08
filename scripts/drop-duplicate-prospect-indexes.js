#!/usr/bin/env node
/**
 * One-time fix for "Too many keys specified; max 64 keys allowed" on prospect_companies.
 * Drops duplicate indexes (domain_1, domain_2, etc.) created by Sequelize sync with unique: true.
 *
 * Run: node scripts/drop-duplicate-prospect-indexes.js
 */
require('dotenv').config();
const sequelize = require('../config/connection');

async function run() {
  const [rows] = await sequelize.query(`
    SELECT DISTINCT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'prospect_companies'
    ORDER BY INDEX_NAME
  `);

  const indexNames = rows.map((r) => r.INDEX_NAME);
  console.log('Indexes on prospect_companies:', indexNames.length);
  indexNames.forEach((n) => console.log('  -', n));

  if (indexNames.length <= 10) {
    console.log('\nIndex count looks normal. No cleanup needed.');
    process.exit(0);
    return;
  }

  // Drop duplicate domain indexes: domain_1, domain_2, ... (keep domain or domain_unique if present)
  const toDrop = indexNames.filter(
    (n) => n !== 'PRIMARY' && /^domain_\d+$/.test(n)
  );

  if (toDrop.length === 0) {
    console.log('\nNo duplicate domain_N indexes found.');
    console.log('If you still hit the 64-key limit, manually inspect and drop redundant indexes.');
    process.exit(0);
    return;
  }

  console.log('\nDropping duplicate indexes:', toDrop.join(', '));

  for (const name of toDrop) {
    try {
      await sequelize.query(`ALTER TABLE prospect_companies DROP INDEX \`${name}\``);
      console.log('  Dropped:', name);
    } catch (err) {
      console.error('  Failed to drop', name, err.message);
    }
  }

  console.log('\nDone. Restart the server.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
