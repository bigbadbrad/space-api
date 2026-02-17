// /models/mission_task.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class MissionTask extends Model {}

MissionTask.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    mission_id: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(512), allowNull: false },
    task_type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'open',
    },
    priority: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'med',
    },
    owner_user_id: { type: DataTypes.UUID, allowNull: true },
    due_at: { type: DataTypes.DATE, allowNull: true },
    source_type: { type: DataTypes.STRING(32), allowNull: true },
    source_id: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    modelName: 'MissionTask',
    tableName: 'mission_tasks',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mission_id'] },
      { fields: ['owner_user_id'] },
      { fields: ['due_at'] },
      { fields: ['status'] },
    ],
  }
);

module.exports = MissionTask;
