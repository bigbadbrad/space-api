// /models/procurement_program.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProcurementProgram extends Model {}

ProcurementProgram.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    source: { type: DataTypes.STRING(64), allowNull: false },
    external_id: { type: DataTypes.STRING(255), allowNull: false },
    title: { type: DataTypes.STRING(1024), allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: true },
    agency: { type: DataTypes.STRING(255), allowNull: true },
    office: { type: DataTypes.STRING(255), allowNull: true },
    naics: { type: DataTypes.STRING(64), allowNull: true },
    psc: { type: DataTypes.STRING(64), allowNull: true },
    set_aside: { type: DataTypes.STRING(128), allowNull: true },
    notice_type: { type: DataTypes.STRING(64), allowNull: true },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'open',
    },
    posted_at: { type: DataTypes.DATE, allowNull: true },
    due_at: { type: DataTypes.DATE, allowNull: true },
    url: { type: DataTypes.STRING(1024), allowNull: true },
    raw_json: { type: DataTypes.JSON, allowNull: true },
    service_lane: { type: DataTypes.STRING(64), allowNull: true },
    topic: { type: DataTypes.STRING(128), allowNull: true },
    weight_override: { type: DataTypes.INTEGER, allowNull: true },
    relevance_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    match_confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    match_reasons_json: { type: DataTypes.JSON, allowNull: true },
    classification_version: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'v1' },
    suppressed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    suppressed_reason: { type: DataTypes.STRING(512), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    agency_path: { type: DataTypes.STRING(512), allowNull: true },
    updated_at_source: { type: DataTypes.DATE, allowNull: true },
    place_of_performance_json: { type: DataTypes.JSON, allowNull: true },
    contacts_json: { type: DataTypes.JSON, allowNull: true },
    attachments_json: { type: DataTypes.JSON, allowNull: true },
    owner_user_id: { type: DataTypes.UUID, allowNull: true },
    triage_status: { type: DataTypes.STRING(32), allowNull: true },
    priority: { type: DataTypes.STRING(16), allowNull: true },
    internal_notes: { type: DataTypes.TEXT, allowNull: true },
    last_triaged_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ProcurementProgram',
    tableName: 'procurement_programs',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['source', 'external_id'] },
      { fields: ['posted_at'] },
      { fields: ['due_at'] },
      { fields: ['service_lane'] },
      { fields: ['topic'] },
      { fields: ['status'] },
      { fields: ['relevance_score'] },
      { fields: ['match_confidence'] },
      { fields: ['suppressed'] },
    ],
  }
);

module.exports = ProcurementProgram;
