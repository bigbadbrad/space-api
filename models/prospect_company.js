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
    // Phase 2: decayed scoring + surge
    intent_stage: { type: DataTypes.STRING(32), allowNull: true },
    surge_level: { type: DataTypes.STRING(32), allowNull: true },
    top_lane: { type: DataTypes.STRING(64), allowNull: true },
    last_seen_at: { type: DataTypes.DATE, allowNull: true },
    score_updated_at: { type: DataTypes.DATE, allowNull: true },
    score_7d_raw: { type: DataTypes.FLOAT, allowNull: true },
    score_30d_raw: { type: DataTypes.FLOAT, allowNull: true },
    // Salesforce future
    salesforce_account_id: { type: DataTypes.STRING(64), allowNull: true },
    salesforce_account_url: { type: DataTypes.STRING(512), allowNull: true },
    salesforce_owner_id: { type: DataTypes.STRING(64), allowNull: true },
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
