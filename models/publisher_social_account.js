// /models/publisher_social_account.js — Consumer GTM social accounts per property+platform
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PublisherSocialAccount extends Model {}

PublisherSocialAccount.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    property_id: { type: DataTypes.UUID, allowNull: false },
    platform: { type: DataTypes.STRING(32), allowNull: false },
    display_name: { type: DataTypes.STRING(255), allowNull: true },
    credentials_json: { type: DataTypes.JSON, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'PublisherSocialAccount',
    tableName: 'publisher_social_accounts',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['property_id', 'platform'], unique: true }],
  }
);

module.exports = PublisherSocialAccount;
