// /models/abm_operator_action.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmOperatorAction extends Model {}

AbmOperatorAction.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    prospect_company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'prospect_companies', key: 'id' },
    },
    lead_request_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'lead_requests', key: 'id' },
    },
    action_type: { type: DataTypes.STRING(32), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
    snooze_until: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AbmOperatorAction',
    tableName: 'abm_operator_actions',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = AbmOperatorAction;
