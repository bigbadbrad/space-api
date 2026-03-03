'use strict';

/**
 * Pursuits v2 — pursuit_stakeholders (manual + intel-suggested)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pursuit_stakeholders', {
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
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'contacts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      name: { type: Sequelize.STRING(255), allowNull: false },
      org: { type: Sequelize.STRING(255), allowNull: true },
      role: { type: Sequelize.STRING(128), allowNull: false },
      grade: { type: Sequelize.STRING(8), allowNull: true },
      relationship: { type: Sequelize.STRING(64), allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      source: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'manual' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pursuit_stakeholders');
  },
};
