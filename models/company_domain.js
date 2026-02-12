// /models/company_domain.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class CompanyDomain extends Model {}

CompanyDomain.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    prospect_company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'prospect_companies',
        key: 'id',
      },
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'CompanyDomain',
    tableName: 'company_domains',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    // unique: true on domain creates the index; no extra indexes needed
  }
);

module.exports = CompanyDomain;
