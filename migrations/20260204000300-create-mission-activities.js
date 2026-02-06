'use strict';

/**
 * ABM Rev 2: Create mission_activities table (timeline / mission log)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mission_activities', {
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
      body: { type: Sequelize.TEXT, allowNull: true },
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
    await queryInterface.addIndex('mission_activities', ['mission_id']);
    await queryInterface.addIndex('mission_activities', ['mission_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mission_activities');
  },
};
