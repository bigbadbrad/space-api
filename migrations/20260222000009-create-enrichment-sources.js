'use strict';

/**
 * Pursuits v2 §5.4 — enrichment_sources (raw vendor payload; normalize into prospect_companies/contacts)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('enrichment_sources', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      enrichment_job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'enrichment_jobs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      provider: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      raw_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('enrichment_sources');
  },
};
