// /models/publisher_publish_attempt.js — Consumer GTM publish attempt log
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PublisherPublishAttempt extends Model {}

PublisherPublishAttempt.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    post_id: { type: DataTypes.UUID, allowNull: false },
    attempt_number: { type: DataTypes.INTEGER, allowNull: false },
    started_at: { type: DataTypes.DATE, allowNull: true },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    result: { type: DataTypes.STRING(16), allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'PublisherPublishAttempt',
    tableName: 'publisher_publish_attempts',
    freezeTableName: true,
    underscored: true,
    timestamps: false,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [{ fields: ['post_id', 'attempt_number'] }],
  }
);

module.exports = PublisherPublishAttempt;
