const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PursuitLeadRequestLink extends Model {}

PursuitLeadRequestLink.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pursuit_id: { type: DataTypes.UUID, allowNull: false },
    lead_request_id: { type: DataTypes.UUID, allowNull: false },
  },
  {
    sequelize,
    modelName: 'PursuitLeadRequestLink',
    tableName: 'pursuit_lead_request_links',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['pursuit_id'] },
      { fields: ['lead_request_id'] },
    ],
  }
);

module.exports = PursuitLeadRequestLink;
