// /models/program_item_account_link.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProgramItemAccountLink extends Model {}

ProgramItemAccountLink.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    program_item_id: { type: DataTypes.UUID, allowNull: false },
    prospect_company_id: { type: DataTypes.UUID, allowNull: false },
    link_type: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unknown' },
    confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.5 },
    evidence_json: { type: DataTypes.JSON, allowNull: true },
    created_by_user_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ProgramItemAccountLink',
    tableName: 'program_item_account_links',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['program_item_id'] },
      { unique: true, fields: ['program_item_id', 'prospect_company_id'] },
    ],
  }
);

module.exports = ProgramItemAccountLink;
