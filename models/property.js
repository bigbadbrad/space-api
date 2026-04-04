// /models/property.js — Consumer GTM properties (consumer product websites)
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class Property extends Model {}

Property.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING(128), allowNull: false },
    domain: { type: DataTypes.STRING(255), allowNull: false },
    product_type: { type: DataTypes.STRING(64), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'Property',
    tableName: 'properties',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['domain'], unique: true }, { fields: ['is_active'] }],
  }
);

module.exports = Property;
