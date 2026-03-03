// /models/pursuit.js — Pursuits v2 (Pre-Mission Workspaces)
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class Pursuit extends Model {}

Pursuit.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    title: { type: DataTypes.STRING(512), allowNull: false },
    prospect_company_id: { type: DataTypes.UUID, allowNull: false },
    owner_user_id: { type: DataTypes.UUID, allowNull: false },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'open',
    },
    stage: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'researching',
    },
    mission_id: { type: DataTypes.UUID, allowNull: true },
    mission_pattern: { type: DataTypes.STRING(128), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    next_action_due_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Pursuit',
    tableName: 'pursuits',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['prospect_company_id'] },
      { fields: ['owner_user_id'] },
      { fields: ['status'] },
      { fields: ['stage'] },
      { fields: ['mission_id'] },
      { fields: ['next_action_due_at'] },
    ],
  }
);

module.exports = Pursuit;
