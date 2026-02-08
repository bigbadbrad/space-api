'use strict';

/**
 * ABM Rev 3: Registry - abm_source_weights for tuneable source multipliers
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('abm_source_weights', {
      source: {
        type: Sequelize.STRING(64),
        allowNull: false,
        primaryKey: true,
      },
      multiplier: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 1.0,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('abm_source_weights');
  },
};
