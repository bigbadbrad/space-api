'use strict';

/**
 * Epic 4: Add intent_evidence_7d to prospect_companies (short list of evidence strings for UI)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('prospect_companies');
    if (table.intent_evidence_7d) return;
    await queryInterface.addColumn('prospect_companies', 'intent_evidence_7d', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('prospect_companies');
    if (!table.intent_evidence_7d) return;
    await queryInterface.removeColumn('prospect_companies', 'intent_evidence_7d');
  },
};
