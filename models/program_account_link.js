// /models/program_account_link.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProgramAccountLink extends Model {}

ProgramAccountLink.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    procurement_program_id: { type: DataTypes.UUID, allowNull: false },
    prospect_company_id: { type: DataTypes.UUID, allowNull: false },
    link_type: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'unknown',
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.5,
    },
    evidence_json: { type: DataTypes.JSON, allowNull: true },
    created_by_user_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ProgramAccountLink',
    tableName: 'program_account_links',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { fields: ['procurement_program_id'] },
      { fields: ['prospect_company_id'] },
      { unique: true, fields: ['procurement_program_id', 'prospect_company_id'] },
    ],
  }
);

module.exports = ProgramAccountLink;
