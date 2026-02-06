'use strict';

/**
 * ABM Rev 2: Create abm_mission_templates registry (optional)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('abm_mission_templates', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      lane: { type: Sequelize.STRING(64), allowNull: false },
      template_name: { type: Sequelize.STRING(128), allowNull: false },
      default_title_pattern: { type: Sequelize.STRING(256), allowNull: true },
      default_fields_json: { type: Sequelize.JSON, allowNull: true },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('abm_mission_templates', ['lane', 'enabled']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('abm_mission_templates');
  },
};
