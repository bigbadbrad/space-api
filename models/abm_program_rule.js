// /models/abm_program_rule.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmProgramRule extends Model {}

AbmProgramRule.init(
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
    service_lane: { type: DataTypes.STRING(64), allowNull: true },
    topic: { type: DataTypes.STRING(128), allowNull: true },
    add_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20 },
    set_confidence: { type: DataTypes.FLOAT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AbmProgramRule',
    tableName: 'abm_program_rules',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['enabled', 'priority'] }],
  }
);

module.exports = AbmProgramRule;
