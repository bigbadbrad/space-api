'use strict';

/**
 * ABM Rev 3: Procurement Radar - program_account_links table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('program_account_links', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      procurement_program_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'procurement_programs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      prospect_company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'prospect_companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      link_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'unknown',
      },
      confidence: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0.5,
      },
      evidence_json: { type: Sequelize.JSON, allowNull: true },
      created_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('program_account_links', ['procurement_program_id']);
    await queryInterface.addIndex('program_account_links', ['prospect_company_id']);
    await queryInterface.addIndex('program_account_links', ['procurement_program_id', 'prospect_company_id'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('program_account_links');
  },
};
