// /models/abm_score_weight.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmScoreWeight extends Model {}

AbmScoreWeight.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    score_config_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'abm_score_configs', key: 'id' },
    },
    event_name: { type: DataTypes.STRING(64), allowNull: false },
    content_type: { type: DataTypes.STRING(64), allowNull: true },
    cta_id: { type: DataTypes.STRING(64), allowNull: true },
    weight: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    modelName: 'AbmScoreWeight',
    tableName: 'abm_score_weights',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = AbmScoreWeight;
