// /models/program_mission_link.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProgramMissionLink extends Model {}

ProgramMissionLink.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    procurement_program_id: { type: DataTypes.UUID, allowNull: false },
    mission_id: { type: DataTypes.UUID, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by_user_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ProgramMissionLink',
    tableName: 'program_mission_links',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { fields: ['procurement_program_id'] },
      { fields: ['mission_id'] },
      { unique: true, fields: ['procurement_program_id', 'mission_id'] },
    ],
  }
);

module.exports = ProgramMissionLink;
