'use strict';

/**
 * Option A: mission_requirements = editable working copy of procurement brief.
 * LeadRequest stays immutable; when we "Promote to Mission" we clone into here.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mission_requirements', {
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
        unique: true,
      },
      brief_json: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: 'Working copy of the procurement brief (cloned from lead_request on promote)',
      },
      source_lead_request_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'lead_requests', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      edited_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mission_requirements');
  },
};
