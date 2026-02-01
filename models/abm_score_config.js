// /models/abm_score_config.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmScoreConfig extends Model {}

AbmScoreConfig.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'active' },
    lambda_decay: { type: DataTypes.DECIMAL(10, 4), allowNull: false, defaultValue: 0.1 },
    normalize_k: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 80 },
    cold_max: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 34 },
    warm_max: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 69 },
    surge_surging_min: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1.5 },
    surge_exploding_min: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 2.5 },
  },
  {
    sequelize,
    modelName: 'AbmScoreConfig',
    tableName: 'abm_score_configs',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = AbmScoreConfig;
