// /models/contact_identity.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class ContactIdentity extends Model {}

ContactIdentity.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    contact_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'contacts',
        key: 'id',
      },
    },
    identity_type: {
      type: DataTypes.STRING(64),
      allowNull: false,
      // posthog_distinct_id | email | hashed_email | crm_id | cookie_id
    },
    identity_value: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'ContactIdentity',
    tableName: 'contact_identities',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['identity_type', 'identity_value'],
      },
      {
        fields: ['contact_id'],
      },
    ],
  }
);

module.exports = ContactIdentity;
