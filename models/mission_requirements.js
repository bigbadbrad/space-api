// /models/mission_requirements.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class MissionRequirements extends Model {}

MissionRequirements.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    mission_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'missions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      unique: true,
    },
    brief_json: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Working copy of the procurement brief (cloned from lead_request on promote)',
    },
    source_lead_request_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'lead_requests', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    edited_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
  },
  {
    sequelize,
    modelName: 'MissionRequirements',
    tableName: 'mission_requirements',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['mission_id'] }],
  }
);

module.exports = MissionRequirements;
