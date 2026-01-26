// models/EventReminder.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class EventReminder extends Model {}

EventReminder.init(
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
    eventName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    eventDateTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    recipients: {
      type: DataTypes.ARRAY(DataTypes.STRING), // Assuming Postgres; adjust for your DB
      allowNull: false,
    },
    isSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'EventReminder',
  }
);

module.exports = EventReminder;
