// /models/publisher_post.js — Consumer GTM publisher posts
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PublisherPost extends Model {}

PublisherPost.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    property_id: { type: DataTypes.UUID, allowNull: false },
    platform: { type: DataTypes.STRING(32), allowNull: false },
    text: { type: DataTypes.TEXT, allowNull: false },
    media_urls: { type: DataTypes.JSON, allowNull: true },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'draft',
    },
    scheduled_for: { type: DataTypes.DATE, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    platform_post_id: { type: DataTypes.STRING(255), allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    source: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'ui' },
    source_key: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    sequelize,
    modelName: 'PublisherPost',
    tableName: 'publisher_posts',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['property_id', 'status'] },
      { fields: ['status', 'scheduled_for'] },
      { fields: ['property_id', 'platform', 'created_at'] },
      { fields: ['property_id', 'source', 'source_key'], unique: true, name: 'publisher_posts_property_source_key_unique' },
    ],
  }
);

module.exports = PublisherPost;
