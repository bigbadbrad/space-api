'use strict';

/**
 * ABM Rev 3: Procurement Radar - program_mission_links table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('program_mission_links', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      procurement_program_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'procurement_programs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      mission_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'missions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('program_mission_links', ['procurement_program_id']);
    await queryInterface.addIndex('program_mission_links', ['mission_id']);
    await queryInterface.addIndex('program_mission_links', ['procurement_program_id', 'mission_id'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('program_mission_links');
  },
};
