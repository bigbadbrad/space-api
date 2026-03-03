'use strict';

/**
 * Pursuits v2 §5.4 — enrichment_jobs (provider-agnostic; Clay headless)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('enrichment_jobs', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      target_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      target_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      provider: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'clay',
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'queued',
      },
      triggered_by_pursuit_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'pursuits', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      meta_json: { type: Sequelize.JSON, allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('enrichment_jobs');
  },
};
