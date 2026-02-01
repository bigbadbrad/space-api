'use strict';

/**
 * Create abm_operator_actions table
 * Lightweight operator interaction log for queue "stale follow-up" and snooze.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('abm_operator_actions', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      prospect_company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'prospect_companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      lead_request_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'lead_requests', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      action_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      note: { type: Sequelize.TEXT, allowNull: true },
      snooze_until: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('abm_operator_actions', ['prospect_company_id', 'action_type', 'created_at'], {
      name: 'abm_operator_actions_pc_action_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('abm_operator_actions');
  },
};
