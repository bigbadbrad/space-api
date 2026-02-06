'use strict';

/**
 * ABM Rev 2: Add mission_id to intent_signals (optional linkage)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('intent_signals', 'mission_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'missions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('intent_signals', ['mission_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('intent_signals', 'mission_id');
  },
};
