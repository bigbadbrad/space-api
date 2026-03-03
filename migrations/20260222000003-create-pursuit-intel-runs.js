'use strict';

/**
 * Pursuits v2 — pursuit_intel_runs (Mission Intel run tracking)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pursuit_intel_runs', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      pursuit_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'pursuits', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.STRING(32), allowNull: false },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'queued',
      },
      cost_usd: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      finished_at: { type: Sequelize.DATE, allowNull: true },
      meta_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pursuit_intel_runs');
  },
};
