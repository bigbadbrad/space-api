const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class EnrichmentSource extends Model {}

EnrichmentSource.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    enrichment_job_id: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.STRING(32), allowNull: false },
    raw_json: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'EnrichmentSource',
    tableName: 'enrichment_sources',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = EnrichmentSource;
