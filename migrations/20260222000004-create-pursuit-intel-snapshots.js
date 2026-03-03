'use strict';

/**
 * Pursuits v2 — pursuit_intel_snapshots (latest decision-grade intel output for UI)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pursuit_intel_snapshots', {
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
      score: { type: Sequelize.INTEGER, allowNull: true },
      score_components_json: { type: Sequelize.JSON, allowNull: true },
      bullets_json: { type: Sequelize.JSON, allowNull: true },
      signals_summary_json: { type: Sequelize.JSON, allowNull: true },
      stakeholders_suggested_json: { type: Sequelize.JSON, allowNull: true },
      partners_json: { type: Sequelize.JSON, allowNull: true },
      outreach_json: { type: Sequelize.JSON, allowNull: true },
      provenance_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pursuit_intel_snapshots');
  },
};
