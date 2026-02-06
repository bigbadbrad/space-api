// /models/mission_artifact.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class MissionArtifact extends Model {}

MissionArtifact.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    mission_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(64), allowNull: false },
    title: { type: DataTypes.STRING(512), allowNull: true },
    url: { type: DataTypes.STRING(1024), allowNull: true },
    storage_key: { type: DataTypes.STRING(512), allowNull: true },
    meta_json: { type: DataTypes.JSON, allowNull: true },
    created_by_user_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'MissionArtifact',
    tableName: 'mission_artifacts',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = MissionArtifact;
