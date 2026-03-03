const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PursuitStakeholder extends Model {}

PursuitStakeholder.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pursuit_id: { type: DataTypes.UUID, allowNull: false },
    contact_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    org: { type: DataTypes.STRING(255), allowNull: true },
    role: { type: DataTypes.STRING(128), allowNull: false },
    grade: { type: DataTypes.STRING(8), allowNull: true },
    relationship: { type: DataTypes.STRING(64), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'manual',
    },
  },
  {
    sequelize,
    modelName: 'PursuitStakeholder',
    tableName: 'pursuit_stakeholders',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['pursuit_id'] }],
  }
);

module.exports = PursuitStakeholder;
