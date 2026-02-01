'use strict';

/**
 * Widen lead_requests text columns that receive widget values
 * Widget sends human-readable strings like "Medium (working toward readiness)"
 * that exceed VARCHAR(32)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('lead_requests', 'readiness_confidence', {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.changeColumn('lead_requests', 'schedule_urgency', {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.changeColumn('lead_requests', 'integration_status', {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('lead_requests', 'readiness_confidence', {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.changeColumn('lead_requests', 'schedule_urgency', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.changeColumn('lead_requests', 'integration_status', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },
};
