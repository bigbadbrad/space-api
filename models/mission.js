// /models/mission.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class Mission extends Model {}

Mission.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    prospect_company_id: { type: DataTypes.UUID, allowNull: true },
    primary_contact_id: { type: DataTypes.UUID, allowNull: true },
    lead_request_id: { type: DataTypes.UUID, allowNull: true },
    title: { type: DataTypes.STRING(512), allowNull: false },
    service_lane: { type: DataTypes.STRING(64), allowNull: true },
    mission_type: { type: DataTypes.STRING(64), allowNull: true },
    mission_pattern: { type: DataTypes.STRING(128), allowNull: true },
    target_orbit: { type: DataTypes.STRING(64), allowNull: true },
    inclination_deg: { type: DataTypes.FLOAT, allowNull: true },
    payload_mass_kg: { type: DataTypes.FLOAT, allowNull: true },
    payload_volume: { type: DataTypes.STRING(64), allowNull: true },
    earliest_date: { type: DataTypes.DATEONLY, allowNull: true },
    latest_date: { type: DataTypes.DATEONLY, allowNull: true },
    schedule_urgency: { type: DataTypes.STRING(64), allowNull: true },
    integration_status: { type: DataTypes.STRING(128), allowNull: true },
    readiness_confidence: { type: DataTypes.STRING(32), allowNull: true },
    funding_status: { type: DataTypes.STRING(64), allowNull: true },
    budget_band: { type: DataTypes.STRING(64), allowNull: true },
    stage: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'new',
    },
    priority: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'medium',
    },
    owner_user_id: { type: DataTypes.UUID, allowNull: false },
    confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.5 },
    source: { type: DataTypes.STRING(32), allowNull: false },
    next_step: { type: DataTypes.TEXT, allowNull: true },
    next_step_due_at: { type: DataTypes.DATE, allowNull: true },
    last_activity_at: { type: DataTypes.DATE, allowNull: true },
    salesforce_opportunity_id: { type: DataTypes.STRING(64), allowNull: true },
    salesforce_account_id: { type: DataTypes.STRING(64), allowNull: true },
    salesforce_campaign_id: { type: DataTypes.STRING(64), allowNull: true },
    salesforce_sync_status: { type: DataTypes.STRING(32), allowNull: true },
    salesforce_last_synced_at: { type: DataTypes.DATE, allowNull: true },
    salesforce_last_error: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Mission',
    tableName: 'missions',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['prospect_company_id'] },
      { fields: ['owner_user_id'] },
      { fields: ['stage'] },
      { fields: ['service_lane'] },
      { fields: ['next_step_due_at'] },
      { fields: ['last_activity_at'] },
    ],
  }
);

module.exports = Mission;
