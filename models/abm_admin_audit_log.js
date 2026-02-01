// /models/abm_admin_audit_log.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmAdminAuditLog extends Model {}

AbmAdminAuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    action: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    table_name: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    record_id: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    before_json: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    after_json: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'AbmAdminAuditLog',
    tableName: 'abm_admin_audit_log',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = AbmAdminAuditLog;
