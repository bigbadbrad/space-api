'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('abm_admin_audit_log', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      action: {
        type: Sequelize.STRING(32),
        allowNull: false,
        comment: 'create, update, delete, activate',
      },
      table_name: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      record_id: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      before_json: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      after_json: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
    await queryInterface.addIndex('abm_admin_audit_log', ['table_name', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('abm_admin_audit_log');
  },
};
