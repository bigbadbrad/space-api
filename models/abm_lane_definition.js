// /models/abm_lane_definition.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmLaneDefinition extends Model {}

AbmLaneDefinition.init(
  {
    lane_key: {
      type: DataTypes.STRING(64),
      allowNull: false,
      primaryKey: true,
    },
    display_name: { type: DataTypes.STRING(128), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    keywords_json: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AbmLaneDefinition',
    tableName: 'abm_lane_definitions',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = AbmLaneDefinition;
