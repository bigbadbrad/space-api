// /models/contact.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class Contact extends Model {}

Contact.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    prospect_company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'prospect_companies',
        key: 'id',
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('new', 'engaged', 'qualified'),
      allowNull: false,
      defaultValue: 'new',
    },
    // Salesforce future
    salesforce_lead_id: { type: DataTypes.STRING(64), allowNull: true },
    salesforce_contact_id: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Contact',
    tableName: 'contacts',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['prospect_company_id', 'email'],
      },
    ],
  }
);

module.exports = Contact;
