const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class PursuitProgramLink extends Model {}

PursuitProgramLink.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pursuit_id: { type: DataTypes.UUID, allowNull: false },
    program_item_id: { type: DataTypes.UUID, allowNull: false },
  },
  {
    sequelize,
    modelName: 'PursuitProgramLink',
    tableName: 'pursuit_program_links',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['pursuit_id'] },
      { fields: ['program_item_id'] },
      { unique: true, fields: ['pursuit_id', 'program_item_id'] },
    ],
  }
);

module.exports = PursuitProgramLink;
