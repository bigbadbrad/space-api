// /models/abm_program_suppression_rule.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmProgramSuppressionRule extends Model {}

AbmProgramSuppressionRule.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    match_field: { type: DataTypes.STRING(64), allowNull: true },
    match_type: { type: DataTypes.STRING(32), allowNull: true },
    match_value: { type: DataTypes.TEXT, allowNull: true },
    suppress_reason: { type: DataTypes.STRING(255), allowNull: true },
    suppress_score_threshold: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AbmProgramSuppressionRule',
    tableName: 'abm_program_suppression_rules',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['enabled', 'priority'] }],
  }
);

module.exports = AbmProgramSuppressionRule;
