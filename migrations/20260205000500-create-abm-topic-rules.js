'use strict';

/**
 * ABM Rev 3: Registry - abm_topic_rules for program classification
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('abm_topic_rules', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      source: { type: Sequelize.STRING(64), allowNull: true },
      match_field: { type: Sequelize.STRING(64), allowNull: true },
      match_type: { type: Sequelize.STRING(32), allowNull: true },
      match_value: { type: Sequelize.TEXT, allowNull: true },
      service_lane: { type: Sequelize.STRING(64), allowNull: true },
      topic: { type: Sequelize.STRING(128), allowNull: true },
      weight: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('abm_topic_rules', ['enabled', 'priority']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('abm_topic_rules');
  },
};
