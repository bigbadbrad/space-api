'use strict';

/**
 * ABM Rev 3: Salesforce sync status and account id on missions
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('missions');
    if (!table.salesforce_account_id) {
      await queryInterface.addColumn('missions', 'salesforce_account_id', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }
    if (!table.salesforce_sync_status) {
      await queryInterface.addColumn('missions', 'salesforce_sync_status', {
        type: Sequelize.STRING(32),
        allowNull: true,
      });
    }
    if (!table.salesforce_last_error) {
      await queryInterface.addColumn('missions', 'salesforce_last_error', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    try {
      await queryInterface.addIndex('missions', ['salesforce_opportunity_id'], { name: 'missions_salesforce_opportunity_id' });
    } catch (e) {
      if (e.name !== 'SequelizeDatabaseError' || !/Duplicate key name/.test(e.message)) throw e;
    }
    try {
      await queryInterface.addIndex('missions', ['salesforce_account_id'], { name: 'missions_salesforce_account_id' });
    } catch (e) {
      if (e.name !== 'SequelizeDatabaseError' || !/Duplicate key name/.test(e.message)) throw e;
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('missions');
    try { await queryInterface.removeIndex('missions', 'missions_salesforce_opportunity_id'); } catch (_) {}
    try { await queryInterface.removeIndex('missions', 'missions_salesforce_account_id'); } catch (_) {}
    if (table.salesforce_account_id) await queryInterface.removeColumn('missions', 'salesforce_account_id');
    if (table.salesforce_sync_status) await queryInterface.removeColumn('missions', 'salesforce_sync_status');
    if (table.salesforce_last_error) await queryInterface.removeColumn('missions', 'salesforce_last_error');
  },
};
