// /models/account_ai_summary.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AccountAiSummary extends Model {}

AccountAiSummary.init(
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
      references: { model: 'prospect_companies', key: 'id' },
    },
    cache_date: { type: DataTypes.DATEONLY, allowNull: false },
    top_lane: { type: DataTypes.STRING(64), allowNull: true },
    intent_score: { type: DataTypes.INTEGER, allowNull: true },
    surge_level: { type: DataTypes.STRING(32), allowNull: true },
    prompt_template_id: { type: DataTypes.UUID, allowNull: true },
    input_json: { type: DataTypes.JSON, allowNull: true },
    summary_md: { type: DataTypes.TEXT, allowNull: true },
    model: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    modelName: 'AccountAiSummary',
    tableName: 'account_ai_summaries',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['prospect_company_id', 'cache_date', 'top_lane'] }],
  }
);

module.exports = AccountAiSummary;
