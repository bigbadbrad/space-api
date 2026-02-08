'use strict';

/**
 * ABM Rev 3: Add procurement-related fields to intent_signals
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('intent_signals', 'source', {
      type: Sequelize.STRING(64),
      allowNull: true,
      defaultValue: 'first_party',
    });
    await queryInterface.addColumn('intent_signals', 'external_ref_type', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('intent_signals', 'external_ref_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addColumn('intent_signals', 'meta_json', {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addIndex('intent_signals', ['source'], { name: 'intent_signals_source_idx' });
    await queryInterface.addIndex('intent_signals', ['external_ref_id'], { name: 'intent_signals_external_ref_id_idx' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('intent_signals', 'intent_signals_source_idx');
    await queryInterface.removeIndex('intent_signals', 'intent_signals_external_ref_id_idx');
    await queryInterface.removeColumn('intent_signals', 'source');
    await queryInterface.removeColumn('intent_signals', 'external_ref_type');
    await queryInterface.removeColumn('intent_signals', 'external_ref_id');
    await queryInterface.removeColumn('intent_signals', 'meta_json');
  },
};
