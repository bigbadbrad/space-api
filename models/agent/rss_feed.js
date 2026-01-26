// models/RSSFeed.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class RSSFeed extends Model {}

RSSFeed.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userAgentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    feedUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastChecked: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastItemId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'RSSFeed',
  }
);

module.exports = RSSFeed;
