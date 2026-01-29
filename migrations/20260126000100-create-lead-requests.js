'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lead_requests', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      // ABM linkage
      prospect_company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'prospect_companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'contacts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      // Request core
      service_needed: { type: Sequelize.STRING(64), allowNull: false },
      mission_type: { type: Sequelize.STRING(64), allowNull: true },

      target_orbit: { type: Sequelize.STRING(32), allowNull: true },
      inclination_deg: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      payload_mass_kg: { type: Sequelize.INTEGER, allowNull: true },
      payload_volume: { type: Sequelize.STRING(32), allowNull: true },

      earliest_date: { type: Sequelize.DATEONLY, allowNull: true },
      latest_date: { type: Sequelize.DATEONLY, allowNull: true },
      schedule_urgency: { type: Sequelize.STRING(64), allowNull: true },

      integration_status: { type: Sequelize.STRING(64), allowNull: true },
      readiness_confidence: { type: Sequelize.STRING(32), allowNull: true },

      // Organization + person fields
      organization_name: { type: Sequelize.STRING(255), allowNull: true },
      organization_website: { type: Sequelize.STRING(512), allowNull: true },
      role: { type: Sequelize.STRING(64), allowNull: true },
      work_email: { type: Sequelize.STRING(255), allowNull: true },
      country: { type: Sequelize.STRING(64), allowNull: true },

      funding_status: { type: Sequelize.STRING(64), allowNull: true },
      budget_band: { type: Sequelize.STRING(32), allowNull: true },

      phone: { type: Sequelize.STRING(64), allowNull: true },
      linkedin_url: { type: Sequelize.STRING(512), allowNull: true },

      notes: { type: Sequelize.TEXT, allowNull: true },
      spec_link: { type: Sequelize.STRING(1024), allowNull: true },

      attachments_json: { type: Sequelize.JSON, allowNull: false, defaultValue: [] },

      consent_contact: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      consent_share: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },

      // Attribution
      utm_source: { type: Sequelize.STRING(128), allowNull: true },
      utm_medium: { type: Sequelize.STRING(128), allowNull: true },
      utm_campaign: { type: Sequelize.STRING(128), allowNull: true },
      utm_content: { type: Sequelize.STRING(128), allowNull: true },
      utm_term: { type: Sequelize.STRING(128), allowNull: true },

      // Tracking identifiers
      tracking_session_id: { type: Sequelize.UUID, allowNull: true },
      tracking_client_id: { type: Sequelize.STRING(128), allowNull: true },
      posthog_distinct_id: { type: Sequelize.STRING(200), allowNull: true },

      // Scoring + routing
      lead_score: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      routing_status: {
        type: Sequelize.ENUM('new', 'routed', 'contacted', 'closed_won', 'closed_lost'),
        allowNull: false,
        defaultValue: 'new',
      },
      routed_to_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      // Full raw payload snapshot
      payload_json: { type: Sequelize.JSON, allowNull: false },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    // Indices
    await queryInterface.addIndex('lead_requests', ['created_at']);
    await queryInterface.addIndex('lead_requests', ['prospect_company_id', 'created_at']);
    await queryInterface.addIndex('lead_requests', ['contact_id', 'created_at']);
    await queryInterface.addIndex('lead_requests', ['lead_score', 'created_at']);
    await queryInterface.addIndex('lead_requests', ['service_needed', 'created_at']);
    await queryInterface.addIndex('lead_requests', ['routing_status', 'created_at']);
    await queryInterface.addIndex('lead_requests', ['tracking_session_id']);
    await queryInterface.addIndex('lead_requests', ['posthog_distinct_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('lead_requests');
  },
};

