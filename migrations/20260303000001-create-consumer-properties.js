'use strict';

/**
 * Consumer GTM — properties table (consumer product websites)
 * Spec: consumer-gtm-properties-publisher-v1.md §1.1
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Handle reruns gracefully: if table already exists (from partial migration), skip createTable.
    let tableExists = false;
    try {
      await queryInterface.describeTable('properties');
      tableExists = true;
    } catch {
      tableExists = false;
    }

    if (!tableExists) {
      await queryInterface.createTable('properties', {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
        },
        name: { type: Sequelize.STRING(128), allowNull: false },
        domain: { type: Sequelize.STRING(255), allowNull: false },
        product_type: { type: Sequelize.STRING(64), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }

    // Add indexes; ignore duplicate index errors if they already exist.
    try {
      await queryInterface.addIndex('properties', ['domain'], {
        unique: true,
        name: 'properties_domain_unique_idx',
      });
    } catch (err) {
      if (!String(err.message || '').includes('Duplicate key name')) {
        throw err;
      }
    }

    try {
      await queryInterface.addIndex('properties', ['is_active'], {
        name: 'properties_is_active_idx',
      });
    } catch (err) {
      if (!String(err.message || '').includes('Duplicate key name')) {
        throw err;
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('properties');
  },
};
