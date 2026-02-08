// /models/program_item_note.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProgramItemNote extends Model {}

ProgramItemNote.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    program_item_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    modelName: 'ProgramItemNote',
    tableName: 'program_item_notes',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['program_item_id'] }],
  }
);

module.exports = ProgramItemNote;
