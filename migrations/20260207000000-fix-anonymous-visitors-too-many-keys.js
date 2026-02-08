'use strict';

/**
 * Fix "Too many keys" on anonymous_visitors (MySQL limit 64).
 * Drops all non-PRIMARY indexes, then adds posthog_distinct_id UNIQUE and prospect_company_id index.
 */
module.exports = {
  async up(queryInterface) {
    const [indexes] = await queryInterface.sequelize.query(
      `SELECT DISTINCT INDEX_NAME FROM information_schema.statistics 
       WHERE table_schema = DATABASE() AND table_name = 'anonymous_visitors' AND INDEX_NAME != 'PRIMARY'`
    );

    for (const { INDEX_NAME } of indexes) {
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE anonymous_visitors DROP INDEX \`${INDEX_NAME}\``
        );
      } catch (err) {
        if (err.original?.errno === 1553) continue; // ER_DROP_INDEX_NEEDED_IN_FOREIGN_KEY
        throw err;
      }
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.statistics 
       WHERE table_schema = DATABASE() AND table_name = 'anonymous_visitors' 
       AND COLUMN_NAME = 'posthog_distinct_id' AND NON_UNIQUE = 0 LIMIT 1`
    );
    if (existing.length === 0) {
      await queryInterface.addIndex('anonymous_visitors', ['posthog_distinct_id'], {
        unique: true,
        name: 'anonymous_visitors_posthog_distinct_id_unique',
      });
    }

    const [existingFk] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.statistics 
       WHERE table_schema = DATABASE() AND table_name = 'anonymous_visitors' 
       AND COLUMN_NAME = 'prospect_company_id' LIMIT 1`
    );
    if (existingFk.length === 0) {
      await queryInterface.addIndex('anonymous_visitors', ['prospect_company_id'], {
        name: 'anonymous_visitors_prospect_company_id',
      });
    }
  },

  async down() {
    // No safe rollback - indexes would need to be recreated manually
  },
};
