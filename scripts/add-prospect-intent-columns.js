#!/usr/bin/env node
/**
 * One-off: Add Phase 2 prospect_companies columns if missing.
 * Run when migrations are skipped (e.g. SequelizeMeta out of sync).
 *
 * Usage: heroku run "node scripts/add-prospect-intent-columns.js" --app space-api
 */
require('dotenv').config();
const sequelize = require('../config/connection');

const COLUMNS = [
  { name: 'intent_stage', sql: 'VARCHAR(32) NULL' },
  { name: 'surge_level', sql: 'VARCHAR(32) NULL' },
  { name: 'top_lane', sql: 'VARCHAR(64) NULL' },
  { name: 'last_seen_at', sql: 'DATETIME NULL' },
  { name: 'score_updated_at', sql: 'DATETIME NULL' },
  { name: 'score_7d_raw', sql: 'FLOAT NULL' },
  { name: 'score_30d_raw', sql: 'FLOAT NULL' },
  { name: 'salesforce_account_id', sql: 'VARCHAR(64) NULL' },
  { name: 'salesforce_account_url', sql: 'VARCHAR(512) NULL' },
  { name: 'salesforce_owner_id', sql: 'VARCHAR(64) NULL' },
];

async function main() {
  for (const { name, sql } of COLUMNS) {
    try {
      await sequelize.query(
        `ALTER TABLE prospect_companies ADD COLUMN \`${name}\` ${sql}`
      );
      console.log(`Added column: ${name}`);
    } catch (err) {
      if (err.original?.code === 'ER_DUP_FIELDNAME') {
        console.log(`Column already exists: ${name}`);
      } else {
        throw err;
      }
    }
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
