'use strict';

/**
 * Consumer GTM — publisher_posts table
 * Spec: consumer-gtm-properties-publisher-v1.md §1.2
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Handle reruns gracefully if table already exists.
    let tableExists = false;
    try {
      await queryInterface.describeTable('publisher_posts');
      tableExists = true;
    } catch {
      tableExists = false;
    }

    if (!tableExists) {
      await queryInterface.createTable('publisher_posts', {
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
        text: { type: Sequelize.TEXT, allowNull: false },
        media_urls: { type: Sequelize.JSON, allowNull: true },
        status: {
          type: Sequelize.STRING(32),
          allowNull: false,
          defaultValue: 'draft',
        },
        scheduled_for: { type: Sequelize.DATE, allowNull: true },
        published_at: { type: Sequelize.DATE, allowNull: true },
        platform_post_id: { type: Sequelize.STRING(255), allowNull: true },
        error_message: { type: Sequelize.TEXT, allowNull: true },
        source: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'ui' },
        source_key: { type: Sequelize.STRING(255), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }

    // Add indexes; ignore duplicate key errors.
    try {
      await queryInterface.addIndex('publisher_posts', ['property_id', 'status'], {
        name: 'publisher_posts_property_id_status_idx',
      });
    } catch (err) {
      if (!String(err.message || '').includes('Duplicate key name')) {
        throw err;
      }
    }

    try {
      await queryInterface.addIndex('publisher_posts', ['status', 'scheduled_for'], {
        name: 'publisher_posts_status_scheduled_for_idx',
      });
    } catch (err) {
      if (!String(err.message || '').includes('Duplicate key name')) {
        throw err;
      }
    }

    try {
      await queryInterface.addIndex('publisher_posts', ['property_id', 'platform', 'created_at'], {
        name: 'publisher_posts_property_platform_created_at_idx',
      });
    } catch (err) {
      if (!String(err.message || '').includes('Duplicate key name')) {
        throw err;
      }
    }

    try {
      await queryInterface.addIndex('publisher_posts', ['property_id', 'source', 'source_key'], {
        unique: true,
        name: 'publisher_posts_property_source_key_unique',
      });
    } catch (err) {
      if (!String(err.message || '').includes('Duplicate key name')) {
        throw err;
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('publisher_posts');
  },
};
