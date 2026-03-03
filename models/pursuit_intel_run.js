const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PursuitIntelRun extends Model {}

PursuitIntelRun.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pursuit_id: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.STRING(32), allowNull: false },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'queued',
    },
    cost_usd: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    meta_json: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'PursuitIntelRun',
    tableName: 'pursuit_intel_runs',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['pursuit_id'] },
      { fields: ['status'] },
    ],
  }
);

module.exports = PursuitIntelRun;
