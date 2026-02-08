// /models/procurement_import_run.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ProcurementImportRun extends Model {}

ProcurementImportRun.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    source: { type: DataTypes.STRING(64), allowNull: false },
    started_at: { type: DataTypes.DATE, allowNull: false },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'running',
    },
    records_fetched: { type: DataTypes.INTEGER, allowNull: true },
    records_upserted: { type: DataTypes.INTEGER, allowNull: true },
    error_count: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    error_sample_json: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ProcurementImportRun',
    tableName: 'procurement_import_runs',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['source'] },
      { fields: ['started_at'] },
    ],
  }
);

module.exports = ProcurementImportRun;
