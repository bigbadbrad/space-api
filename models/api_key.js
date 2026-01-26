// /models/api_key.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ApiKey extends Model {}

ApiKey.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // etc...
  },
  {
    sequelize,
    modelName: 'ApiKey',
    tableName: 'api_keys',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = ApiKey;
