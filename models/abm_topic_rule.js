// /models/abm_topic_rule.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmTopicRule extends Model {}

AbmTopicRule.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    source: { type: DataTypes.STRING(64), allowNull: true },
    match_field: { type: DataTypes.STRING(64), allowNull: true },
    match_type: { type: DataTypes.STRING(32), allowNull: true },
    match_value: { type: DataTypes.TEXT, allowNull: true },
    service_lane: { type: DataTypes.STRING(64), allowNull: true },
    topic: { type: DataTypes.STRING(128), allowNull: true },
    weight: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AbmTopicRule',
    tableName: 'abm_topic_rules',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['enabled', 'priority'] },
    ],
  }
);

module.exports = AbmTopicRule;
