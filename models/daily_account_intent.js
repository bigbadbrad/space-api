// /models/daily_account_intent.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class DailyAccountIntent extends Model {}

DailyAccountIntent.init(
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
    date: { type: DataTypes.DATEONLY, allowNull: false },
    score_config_id: { type: DataTypes.UUID, allowNull: true },
    raw_score_7d: { type: DataTypes.FLOAT, allowNull: true },
    raw_score_prev_7d: { type: DataTypes.FLOAT, allowNull: true },
    raw_score_30d: { type: DataTypes.FLOAT, allowNull: true },
    intent_score: { type: DataTypes.INTEGER, allowNull: true },
    intent_stage: { type: DataTypes.STRING(32), allowNull: true },
    surge_ratio: { type: DataTypes.FLOAT, allowNull: true },
    surge_level: { type: DataTypes.STRING(32), allowNull: true },
    unique_people_7d: { type: DataTypes.INTEGER, allowNull: true },
    top_lane: { type: DataTypes.STRING(64), allowNull: true },
    lane_scores_7d_json: { type: DataTypes.JSON, allowNull: true },
    lane_scores_30d_json: { type: DataTypes.JSON, allowNull: true },
    top_categories_7d_json: { type: DataTypes.JSON, allowNull: true },
    top_pages_7d_json: { type: DataTypes.JSON, allowNull: true },
    key_events_7d_json: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'DailyAccountIntent',
    tableName: 'daily_account_intent',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['prospect_company_id', 'date'] },
      { fields: ['date', 'intent_stage', 'top_lane', 'surge_level'] },
    ],
  }
);

module.exports = DailyAccountIntent;
