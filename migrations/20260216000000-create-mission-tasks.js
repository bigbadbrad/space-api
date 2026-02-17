'use strict';

/**
 * ABM Rev 3: Mission tasks (work queue, due dates, types)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mission_tasks', {
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
      title: { type: Sequelize.STRING(512), allowNull: false },
      task_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'open',
      },
      priority: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'med',
      },
      owner_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      due_at: { type: Sequelize.DATE, allowNull: true },
      source_type: { type: Sequelize.STRING(32), allowNull: true },
      source_id: { type: Sequelize.STRING(64), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    // mission_id and owner_user_id get indexes from the FK constraints; only add indexes for query use
    await queryInterface.addIndex('mission_tasks', ['due_at']);
    await queryInterface.addIndex('mission_tasks', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mission_tasks');
  },
};
