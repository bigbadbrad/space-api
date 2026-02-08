// /models/abm_agency_blacklist.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmAgencyBlacklist extends Model {}

AbmAgencyBlacklist.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    agency_pattern: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notes: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'AbmAgencyBlacklist',
    tableName: 'abm_agency_blacklist',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['enabled'] }],
  }
);

module.exports = AbmAgencyBlacklist;
