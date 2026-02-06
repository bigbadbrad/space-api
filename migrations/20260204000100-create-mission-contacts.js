'use strict';

/**
 * ABM Rev 2: Create mission_contacts join table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mission_contacts', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      mission_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'missions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'contacts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      role: { type: Sequelize.STRING(128), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('mission_contacts', ['mission_id']);
    await queryInterface.addIndex('mission_contacts', ['contact_id']);
    await queryInterface.addIndex('mission_contacts', ['mission_id', 'contact_id'], {
      unique: true,
      name: 'mission_contacts_mission_contact_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mission_contacts');
  },
};
