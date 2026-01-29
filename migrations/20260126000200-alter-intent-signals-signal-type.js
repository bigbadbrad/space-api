'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Change signal_type from ENUM to STRING(64) to support new signal types
    await queryInterface.changeColumn('intent_signals', 'signal_type', {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Best-effort rollback to original ENUM definition
    await queryInterface.changeColumn('intent_signals', 'signal_type', {
      type: Sequelize.ENUM('page_view', 'content_download', 'g2_review', 'pricing_view'),
      allowNull: false,
    });
  },
};

