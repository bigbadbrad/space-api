'use strict';

/**
 * ABM Rev 3: Procurement Radar - procurement_programs table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('procurement_programs', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      source: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      external_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(1024),
        allowNull: false,
      },
      summary: { type: Sequelize.TEXT, allowNull: true },
      agency: { type: Sequelize.STRING(255), allowNull: true },
      office: { type: Sequelize.STRING(255), allowNull: true },
      naics: { type: Sequelize.STRING(64), allowNull: true },
      psc: { type: Sequelize.STRING(64), allowNull: true },
      set_aside: { type: Sequelize.STRING(128), allowNull: true },
      notice_type: { type: Sequelize.STRING(64), allowNull: true },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'open',
      },
      posted_at: { type: Sequelize.DATE, allowNull: true },
      due_at: { type: Sequelize.DATE, allowNull: true },
      url: { type: Sequelize.STRING(1024), allowNull: true },
      raw_json: { type: Sequelize.JSON, allowNull: true },
      service_lane: { type: Sequelize.STRING(64), allowNull: true },
      topic: { type: Sequelize.STRING(128), allowNull: true },
      weight_override: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('procurement_programs', ['source', 'external_id'], { unique: true });
    await queryInterface.addIndex('procurement_programs', ['posted_at']);
    await queryInterface.addIndex('procurement_programs', ['due_at']);
    await queryInterface.addIndex('procurement_programs', ['service_lane']);
    await queryInterface.addIndex('procurement_programs', ['topic']);
    await queryInterface.addIndex('procurement_programs', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('procurement_programs');
  },
};
