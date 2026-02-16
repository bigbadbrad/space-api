'use strict';

/**
 * Unify lead request routing_status: new | promoted | closed (single flow with Mission).
 * Map: routed, contacted -> new; closed_won, closed_lost -> closed.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE lead_requests SET routing_status = 'new' WHERE routing_status IN ('routed', 'contacted');
    `);
    await queryInterface.sequelize.query(`
      UPDATE lead_requests SET routing_status = 'closed' WHERE routing_status IN ('closed_won', 'closed_lost');
    `);
    await queryInterface.changeColumn('lead_requests', 'routing_status', {
      type: Sequelize.ENUM('new', 'promoted', 'closed'),
      allowNull: false,
      defaultValue: 'new',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('lead_requests', 'routing_status', {
      type: Sequelize.ENUM('new', 'routed', 'contacted', 'closed_won', 'closed_lost'),
      allowNull: false,
      defaultValue: 'new',
    });
  },
};
