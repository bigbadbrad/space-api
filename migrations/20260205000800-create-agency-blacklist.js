'use strict';

/**
 * Agency blacklist – departments/agencies to ignore in procurement programs
 * agency_pattern: substring to match (case-insensitive) against program.agency
 * Idempotent: skips if table/index already exists
 */
async function tableExists(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${tableName}' LIMIT 1`
  );
  return rows && rows.length > 0;
}
async function indexExists(queryInterface, tableName, indexName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND index_name = '${indexName}' LIMIT 1`
  );
  return rows && rows.length > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'abm_agency_blacklist'))) {
      await queryInterface.createTable('abm_agency_blacklist', {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
        },
        agency_pattern: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        notes: {
          type: Sequelize.STRING(512),
          allowNull: true,
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }
    if (!(await indexExists(queryInterface, 'abm_agency_blacklist', 'abm_agency_blacklist_enabled'))) {
      await queryInterface.addIndex('abm_agency_blacklist', ['enabled'], { name: 'abm_agency_blacklist_enabled' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('abm_agency_blacklist');
  },
};
