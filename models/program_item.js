// /models/program_item.js - Sprint 2 unified ProgramItem (SAM + USAspending + SpaceWERX)
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProgramItem extends Model {}

ProgramItem.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    source_type: {
      type: DataTypes.ENUM('sam_opportunity', 'usaspending_award', 'spacewerx_award'),
      allowNull: false,
    },
    source_id: { type: DataTypes.STRING(255), allowNull: false },
    title: { type: DataTypes.STRING(1024), allowNull: false },
    agency: { type: DataTypes.STRING(255), allowNull: true },
    agency_path: { type: DataTypes.STRING(512), allowNull: true },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
    notice_type: { type: DataTypes.STRING(64), allowNull: true },
    posted_at: { type: DataTypes.DATE, allowNull: true },
    updated_at_source: { type: DataTypes.DATE, allowNull: true },
    due_at: { type: DataTypes.DATE, allowNull: true },
    due_in_days: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    naics: { type: DataTypes.STRING(64), allowNull: true },
    psc: { type: DataTypes.STRING(64), allowNull: true },
    set_aside: { type: DataTypes.STRING(128), allowNull: true },
    place_of_performance_json: { type: DataTypes.JSON, allowNull: true },
    amount_obligated: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    amount_total_value: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    links_json: { type: DataTypes.JSON, allowNull: true },
    attachments_json: { type: DataTypes.JSON, allowNull: true },
    contacts_json: { type: DataTypes.JSON, allowNull: true },
    service_lane: { type: DataTypes.STRING(64), allowNull: true },
    topic: { type: DataTypes.STRING(128), allowNull: true },
    relevance_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    match_confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    match_reasons_json: { type: DataTypes.JSON, allowNull: true },
    classification_version: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'v1_rules' },
    suppressed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    suppressed_reason: { type: DataTypes.STRING(512), allowNull: true },
    owner_user_id: { type: DataTypes.UUID, allowNull: true },
    triage_status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'new' },
    priority: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'med' },
    last_triaged_at: { type: DataTypes.DATE, allowNull: true },
    internal_notes: { type: DataTypes.TEXT, allowNull: true },
    linked_prospect_company_id: { type: DataTypes.UUID, allowNull: true },
    linked_mission_id: { type: DataTypes.UUID, allowNull: true },
    raw_json: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ProgramItem',
    tableName: 'program_items',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['source_type', 'source_id'] },
      { fields: ['relevance_score'] },
      { fields: ['match_confidence'] },
      { fields: ['service_lane'] },
      { fields: ['suppressed'] },
      { fields: ['triage_status'] },
      { fields: ['priority'] },
      { fields: ['owner_user_id'] },
      { fields: ['due_at'] },
      { fields: ['posted_at'] },
    ],
  }
);

module.exports = ProgramItem;
