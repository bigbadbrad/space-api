'use strict';

/**
 * Consumer GTM — publisher_social_accounts (credentials per property + platform)
 * Spec: consumer-gtm-properties-publisher-v1.md §1.3
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Handle reruns if table already exists.
    let tableExists = false;
    try {
      await queryInterface.describeTable('publisher_social_accounts');
      tableExists = true;
    } catch {
      tableExists = false;
    }

    if (!tableExists) {
      await queryInterface.createTable('publisher_social_accounts', {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
        },
        property_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'properties', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        platform: { type: Sequelize.STRING(32), allowNull: false },
        display_name: { type: Sequelize.STRING(255), allowNull: true },
        credentials_json: { type: Sequelize.JSON, allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }

    try {
      await queryInterface.addIndex('publisher_social_accounts', ['property_id', 'platform'], {
        unique: true,
        name: 'publisher_social_accounts_property_platform_unique_idx',
      });
    } catch (err) {
      if (!String(err.message || '').includes('Duplicate key name')) {
        throw err;
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('publisher_social_accounts');
  },
};
