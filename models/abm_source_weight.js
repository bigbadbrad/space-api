// /models/abm_source_weight.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmSourceWeight extends Model {}

AbmSourceWeight.init(
  {
    source: {
      type: DataTypes.STRING(64),
      allowNull: false,
      primaryKey: true,
    },
    multiplier: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1.0,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'AbmSourceWeight',
    tableName: 'abm_source_weights',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = AbmSourceWeight;
