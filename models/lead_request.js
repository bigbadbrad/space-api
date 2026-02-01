// /models/lead_request.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class LeadRequest extends Model {}

LeadRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    prospect_company_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    contact_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    // Request core
    service_needed: { type: DataTypes.STRING(64), allowNull: false },
    mission_type: { type: DataTypes.STRING(64), allowNull: true },

    target_orbit: { type: DataTypes.STRING(32), allowNull: true },
    inclination_deg: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    payload_mass_kg: { type: DataTypes.INTEGER, allowNull: true },
    payload_volume: { type: DataTypes.STRING(32), allowNull: true },

    earliest_date: { type: DataTypes.DATEONLY, allowNull: true },
    latest_date: { type: DataTypes.DATEONLY, allowNull: true },
    schedule_urgency: { type: DataTypes.STRING(128), allowNull: true },

    integration_status: { type: DataTypes.STRING(128), allowNull: true },
    readiness_confidence: { type: DataTypes.STRING(128), allowNull: true },

    // Organization + person fields
    organization_name: { type: DataTypes.STRING(255), allowNull: true },
    organization_website: { type: DataTypes.STRING(512), allowNull: true },
    role: { type: DataTypes.STRING(64), allowNull: true },
    work_email: { type: DataTypes.STRING(255), allowNull: true },
    country: { type: DataTypes.STRING(64), allowNull: true },

    funding_status: { type: DataTypes.STRING(64), allowNull: true },
    budget_band: { type: DataTypes.STRING(32), allowNull: true },

    phone: { type: DataTypes.STRING(64), allowNull: true },
    linkedin_url: { type: DataTypes.STRING(512), allowNull: true },

    // Original external-facing notes; keep, but we'll use internal_notes for sales comments
    notes: { type: DataTypes.TEXT, allowNull: true },
    // Internal sales notes (ABM workflow)
    internal_notes: { type: DataTypes.TEXT, allowNull: true },
    spec_link: { type: DataTypes.STRING(1024), allowNull: true },

    attachments_json: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },

    consent_contact: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    consent_share: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Attribution
    utm_source: { type: DataTypes.STRING(128), allowNull: true },
    utm_medium: { type: DataTypes.STRING(128), allowNull: true },
    utm_campaign: { type: DataTypes.STRING(128), allowNull: true },
    utm_content: { type: DataTypes.STRING(128), allowNull: true },
    utm_term: { type: DataTypes.STRING(128), allowNull: true },

    // Tracking identifiers
    tracking_session_id: { type: DataTypes.UUID, allowNull: true },
    tracking_client_id: { type: DataTypes.STRING(128), allowNull: true },
    posthog_distinct_id: { type: DataTypes.STRING(200), allowNull: true },

    // Scoring + routing
    lead_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    routing_status: {
      type: DataTypes.ENUM('new', 'routed', 'contacted', 'closed_won', 'closed_lost'),
      allowNull: false,
      defaultValue: 'new',
    },
    routed_to_user_id: { type: DataTypes.UUID, allowNull: true },
    // Optional structured tags for triage/routing
    tags_json: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    disposition_reason: { type: DataTypes.STRING(255), allowNull: true },

    // Phase 2: account resolution + AI summary
    account_key: { type: DataTypes.STRING(255), allowNull: true },
    why_hot_json: { type: DataTypes.JSON, allowNull: true },
    // Salesforce future
    salesforce_lead_id: { type: DataTypes.STRING(64), allowNull: true },
    salesforce_task_id: { type: DataTypes.STRING(64), allowNull: true },

    // Full raw payload snapshot
    payload_json: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    modelName: 'LeadRequest',
    tableName: 'lead_requests',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = LeadRequest;

