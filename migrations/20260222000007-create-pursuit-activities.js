'use strict';

/**
 * Pursuits v2 — pursuit_activities (append-only event log)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pursuit_activities', {
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
      type: { type: Sequelize.STRING(64), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: true },
      meta_json: { type: Sequelize.JSON, allowNull: true },
      created_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pursuit_activities');
  },
};
