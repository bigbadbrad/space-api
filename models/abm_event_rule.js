// /models/abm_event_rule.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmEventRule extends Model {}

AbmEventRule.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    event_name: { type: DataTypes.STRING(64), allowNull: false },
    match_type: { type: DataTypes.STRING(32), allowNull: false },
    match_value: { type: DataTypes.STRING(512), allowNull: false },
    content_type: { type: DataTypes.STRING(64), allowNull: true },
    lane: { type: DataTypes.STRING(64), allowNull: true },
    weight_override: { type: DataTypes.INTEGER, allowNull: true },
    score_config_id: { type: DataTypes.UUID, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AbmEventRule',
    tableName: 'abm_event_rules',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = AbmEventRule;
