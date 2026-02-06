// /models/mission_activity.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class MissionActivity extends Model {}

MissionActivity.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    mission_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(64), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: true },
    meta_json: { type: DataTypes.JSON, allowNull: true },
    created_by_user_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'MissionActivity',
    tableName: 'mission_activities',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = MissionActivity;
