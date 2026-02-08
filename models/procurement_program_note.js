// /models/procurement_program_note.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProcurementProgramNote extends Model {}

ProcurementProgramNote.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    procurement_program_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'ProcurementProgramNote',
    tableName: 'procurement_program_notes',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['procurement_program_id'] }],
  }
);

module.exports = ProcurementProgramNote;
