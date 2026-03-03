'use strict';

/**
 * Pursuits v2 (Pre-Mission Workspaces) — create pursuits table
 * Spec: docs/pursuits-workspace-spec-v2.md §5.1, 5.2
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pursuits', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      title: { type: Sequelize.STRING(512), allowNull: false },
      prospect_company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'prospect_companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      owner_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'open',
      },
      stage: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'researching',
      },
      mission_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'missions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      mission_pattern: { type: Sequelize.STRING(128), allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      next_action_due_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pursuits');
  },
};
