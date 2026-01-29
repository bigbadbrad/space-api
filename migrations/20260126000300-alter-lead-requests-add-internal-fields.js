'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('lead_requests', 'internal_notes', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'notes',
    });

    await queryInterface.addColumn('lead_requests', 'tags_json', {
      type: Sequelize.JSON,
      allowNull: false,
      defaultValue: [],
      after: 'routed_to_user_id',
    });

    await queryInterface.addColumn('lead_requests', 'disposition_reason', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'routing_status',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('lead_requests', 'internal_notes');
    await queryInterface.removeColumn('lead_requests', 'tags_json');
    await queryInterface.removeColumn('lead_requests', 'disposition_reason');
  },
};

