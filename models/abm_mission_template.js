// /models/abm_mission_template.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmMissionTemplate extends Model {}

AbmMissionTemplate.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    lane: { type: DataTypes.STRING(64), allowNull: false },
    template_name: { type: DataTypes.STRING(128), allowNull: false },
    default_title_pattern: { type: DataTypes.STRING(256), allowNull: true },
    default_fields_json: { type: DataTypes.JSON, allowNull: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'AbmMissionTemplate',
    tableName: 'abm_mission_templates',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = AbmMissionTemplate;
