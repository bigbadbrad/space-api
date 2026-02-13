'use strict';

/**
 * Epic 4: Add evidence_template to abm_event_rules for evidence strings
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('abm_event_rules');
    if (table.evidence_template) return;
    await queryInterface.addColumn('abm_event_rules', 'evidence_template', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('abm_event_rules');
    if (!table.evidence_template) return;
    await queryInterface.removeColumn('abm_event_rules', 'evidence_template');
  },
};
