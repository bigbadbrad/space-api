// /models/intent_signal.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class IntentSignal extends Model {}

IntentSignal.init(
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
    signal_type: {
      // NOTE: originally an ENUM; changed to STRING to allow new signal types
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    service_lane: {
      type: DataTypes.STRING,
      allowNull: true,
      // Enum values: Launch, Mobility, Fuel, ISAM, Return
    },
    topic: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    weight: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    occurred_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    mission_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'IntentSignal',
    tableName: 'intent_signals',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      {
        fields: ['prospect_company_id'],
      },
      {
        fields: ['occurred_at'],
      },
      {
        fields: ['signal_type'],
      },
    ],
  }
);

module.exports = IntentSignal;
