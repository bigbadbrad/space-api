'use strict';

/**
 * Consumer GTM — publisher_publish_attempts (retries & debugging)
 * Spec: consumer-gtm-properties-publisher-v1.md §1.4
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Handle reruns if table already exists.
    let tableExists = false;
    try {
      await queryInterface.describeTable('publisher_publish_attempts');
      tableExists = true;
    } catch {
      tableExists = false;
    }

    if (!tableExists) {
      await queryInterface.createTable('publisher_publish_attempts', {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
        },
        post_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'publisher_posts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        attempt_number: { type: Sequelize.INTEGER, allowNull: false },
        started_at: { type: Sequelize.DATE, allowNull: true },
        finished_at: { type: Sequelize.DATE, allowNull: true },
        result: { type: Sequelize.STRING(16), allowNull: true },
        error_message: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }

    try {
      await queryInterface.addIndex('publisher_publish_attempts', ['post_id', 'attempt_number'], {
        name: 'publisher_publish_attempts_post_id_attempt_number_idx',
      });
    } catch (err) {
      if (!String(err.message || '').includes('Duplicate key name')) {
        throw err;
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('publisher_publish_attempts');
  },
};
