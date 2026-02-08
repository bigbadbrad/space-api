// /models/anonymous_visitor.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AnonymousVisitor extends Model {}

AnonymousVisitor.init(
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
    posthog_distinct_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    ip_hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ip_country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ip_org: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_seen_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'AnonymousVisitor',
    tableName: 'anonymous_visitors',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    // unique: true on posthog_distinct_id creates the index; prospect_company_id index via FK
  }
);

module.exports = AnonymousVisitor;
