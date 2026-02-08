// /models/program_item_mission_link.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProgramItemMissionLink extends Model {}

ProgramItemMissionLink.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    program_item_id: { type: DataTypes.UUID, allowNull: false },
    mission_id: { type: DataTypes.UUID, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by_user_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ProgramItemMissionLink',
    tableName: 'program_item_mission_links',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['program_item_id'] },
      { unique: true, fields: ['program_item_id', 'mission_id'] },
    ],
  }
);

module.exports = ProgramItemMissionLink;
