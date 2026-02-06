'use strict';

/**
 * ABM Rev 2: Add mission_id to lead_requests (when promoted to mission)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('lead_requests', 'mission_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'missions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('lead_requests', ['mission_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('lead_requests', 'mission_id');
  },
};
