'use strict';

/**
 * ABM Rev 2: Create missions table (procurement opportunities)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('missions', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      prospect_company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'prospect_companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      primary_contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'contacts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      lead_request_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'lead_requests', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      title: { type: Sequelize.STRING(512), allowNull: false },
      service_lane: { type: Sequelize.STRING(64), allowNull: true },
      mission_type: { type: Sequelize.STRING(64), allowNull: true },
      mission_pattern: { type: Sequelize.STRING(128), allowNull: true },
      target_orbit: { type: Sequelize.STRING(64), allowNull: true },
      inclination_deg: { type: Sequelize.FLOAT, allowNull: true },
      payload_mass_kg: { type: Sequelize.FLOAT, allowNull: true },
      payload_volume: { type: Sequelize.STRING(64), allowNull: true },
      earliest_date: { type: Sequelize.DATEONLY, allowNull: true },
      latest_date: { type: Sequelize.DATEONLY, allowNull: true },
      schedule_urgency: { type: Sequelize.STRING(64), allowNull: true },
      integration_status: { type: Sequelize.STRING(128), allowNull: true },
      readiness_confidence: { type: Sequelize.STRING(32), allowNull: true },
      funding_status: { type: Sequelize.STRING(64), allowNull: true },
      budget_band: { type: Sequelize.STRING(64), allowNull: true },
      stage: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'new',
      },
      priority: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'medium',
      },
      owner_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      confidence: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0.5 },
      source: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      next_step: { type: Sequelize.TEXT, allowNull: true },
      next_step_due_at: { type: Sequelize.DATE, allowNull: true },
      last_activity_at: { type: Sequelize.DATE, allowNull: true },
      salesforce_opportunity_id: { type: Sequelize.STRING(64), allowNull: true },
      salesforce_campaign_id: { type: Sequelize.STRING(64), allowNull: true },
      salesforce_last_synced_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('missions', ['prospect_company_id']);
    await queryInterface.addIndex('missions', ['owner_user_id']);
    await queryInterface.addIndex('missions', ['stage']);
    await queryInterface.addIndex('missions', ['service_lane']);
    await queryInterface.addIndex('missions', ['next_step_due_at']);
    await queryInterface.addIndex('missions', ['last_activity_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('missions');
  },
};
