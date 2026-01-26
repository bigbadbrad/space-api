// /models/customer_company.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class CustomerCompany extends Model {}

CustomerCompany.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    plan_tier: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stripe_customer_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('trial', 'active', 'past_due', 'cancelled'),
      allowNull: false,
      defaultValue: 'trial',
    },
  },
  {
    sequelize,
    modelName: 'CustomerCompany',
    tableName: 'customer_companies',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = CustomerCompany;
