const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class EnrichmentJob extends Model {}

EnrichmentJob.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    target_type: { type: DataTypes.STRING(32), allowNull: false },
    target_id: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'clay' },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'queued',
    },
    triggered_by_pursuit_id: { type: DataTypes.UUID, allowNull: true },
    meta_json: { type: DataTypes.JSON, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'EnrichmentJob',
    tableName: 'enrichment_jobs',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = EnrichmentJob;
