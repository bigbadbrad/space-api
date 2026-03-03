const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PursuitActivity extends Model {}

PursuitActivity.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pursuit_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(64), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: true },
    meta_json: { type: DataTypes.JSON, allowNull: true },
    created_by_user_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'PursuitActivity',
    tableName: 'pursuit_activities',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['pursuit_id'] },
      { fields: ['pursuit_id', 'created_at'] },
    ],
  }
);

module.exports = PursuitActivity;
