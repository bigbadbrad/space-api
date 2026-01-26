// /models/prospect_company.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProspectCompany extends Model {}

ProspectCompany.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    intent_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    stage: {
      type: DataTypes.ENUM('new', 'engaged', 'opportunity', 'customer'),
      allowNull: false,
      defaultValue: 'new',
    },
    owner_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    customer_company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'customer_companies',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    modelName: 'ProspectCompany',
    tableName: 'prospect_companies',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      {
        fields: ['domain'],
      },
      {
        fields: ['intent_score'],
      },
    ],
  }
);

module.exports = ProspectCompany;
