// /models/notification_preference.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class NotificationPreference extends Model {}

NotificationPreference.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },

    allow_texts: { type: DataTypes.BOOLEAN, defaultValue: true },
    allow_emails: { type: DataTypes.BOOLEAN, defaultValue: true },
    allow_marketing_texts: { type: DataTypes.BOOLEAN, defaultValue: false },
    allow_marketing_emails: { type: DataTypes.BOOLEAN, defaultValue: false },
    allow_postcards: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'NotificationPreference',
    tableName: 'notification_preferences',
    underscored: true,
    timestamps: true,
  }
);

module.exports = NotificationPreference;
