// /models/mission_contact.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class MissionContact extends Model {}

MissionContact.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    mission_id: { type: DataTypes.UUID, allowNull: false },
    contact_id: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING(128), allowNull: true },
  },
  {
    sequelize,
    modelName: 'MissionContact',
    tableName: 'mission_contacts',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['mission_id', 'contact_id'] },
    ],
  }
);

module.exports = MissionContact;
