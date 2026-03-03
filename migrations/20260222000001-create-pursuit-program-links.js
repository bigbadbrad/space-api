'use strict';

/**
 * Pursuits v2 — pursuit_program_links (many-to-many Pursuit ↔ ProgramItem)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pursuit_program_links', {
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
      program_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'program_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pursuit_program_links');
  },
};
