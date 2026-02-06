'use strict';

/**
 * ABM Rev 2: Create mission_artifacts table (spec links, RFPs, etc.)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mission_artifacts', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      mission_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'missions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      title: { type: Sequelize.STRING(512), allowNull: true },
      url: { type: Sequelize.STRING(1024), allowNull: true },
      storage_key: { type: Sequelize.STRING(512), allowNull: true },
      meta_json: { type: Sequelize.JSON, allowNull: true },
      created_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('mission_artifacts', ['mission_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mission_artifacts');
  },
};
