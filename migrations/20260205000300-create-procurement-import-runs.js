'use strict';

/**
 * ABM Rev 3: Procurement Radar - procurement_import_runs table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('procurement_import_runs', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      source: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      started_at: { type: Sequelize.DATE, allowNull: false },
      finished_at: { type: Sequelize.DATE, allowNull: true },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'running',
      },
      records_fetched: { type: Sequelize.INTEGER, allowNull: true },
      records_upserted: { type: Sequelize.INTEGER, allowNull: true },
      error_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
      error_sample_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('procurement_import_runs', ['source']);
    await queryInterface.addIndex('procurement_import_runs', ['started_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('procurement_import_runs');
  },
};
