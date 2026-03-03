const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PursuitIntelSnapshot extends Model {}

PursuitIntelSnapshot.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pursuit_id: { type: DataTypes.UUID, allowNull: false },
    score: { type: DataTypes.INTEGER, allowNull: true },
    score_components_json: { type: DataTypes.JSON, allowNull: true },
    bullets_json: { type: DataTypes.JSON, allowNull: true },
    signals_summary_json: { type: DataTypes.JSON, allowNull: true },
    stakeholders_suggested_json: { type: DataTypes.JSON, allowNull: true },
    partners_json: { type: DataTypes.JSON, allowNull: true },
    outreach_json: { type: DataTypes.JSON, allowNull: true },
    provenance_json: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'PursuitIntelSnapshot',
    tableName: 'pursuit_intel_snapshots',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['pursuit_id'] }],
  }
);

module.exports = PursuitIntelSnapshot;
