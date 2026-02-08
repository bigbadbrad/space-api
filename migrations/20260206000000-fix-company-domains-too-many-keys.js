'use strict';

/**
 * Fix "Too many keys" on company_domains (MySQL limit 64).
 * Drops all non-PRIMARY indexes, then adds domain UNIQUE and prospect_company_id index.
 */
module.exports = {
  async up(queryInterface) {
    const [indexes] = await queryInterface.sequelize.query(
      `SELECT DISTINCT INDEX_NAME FROM information_schema.statistics 
       WHERE table_schema = DATABASE() AND table_name = 'company_domains' AND INDEX_NAME != 'PRIMARY'`
    );

    for (const { INDEX_NAME } of indexes) {
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE company_domains DROP INDEX \`${INDEX_NAME}\``
        );
      } catch (err) {
        if (err.original?.errno === 1553) continue; // ER_DROP_INDEX_NEEDED_IN_FOREIGN_KEY
        throw err;
      }
    }

    const [existing] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.statistics 
       WHERE table_schema = DATABASE() AND table_name = 'company_domains' 
       AND COLUMN_NAME = 'domain' AND NON_UNIQUE = 0 LIMIT 1`
    );
    if (existing.length === 0) {
      await queryInterface.addIndex('company_domains', ['domain'], {
        unique: true,
        name: 'company_domains_domain_unique',
      });
    }

    const [existingFk] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.statistics 
       WHERE table_schema = DATABASE() AND table_name = 'company_domains' 
       AND COLUMN_NAME = 'prospect_company_id' LIMIT 1`
    );
    if (existingFk.length === 0) {
      await queryInterface.addIndex('company_domains', ['prospect_company_id'], {
        name: 'company_domains_prospect_company_id',
      });
    }
  },

  async down() {
    // No safe rollback - indexes would need to be recreated manually
  },
};
