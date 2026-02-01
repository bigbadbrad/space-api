// /models/abm_prompt_template.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/connection');

class AbmPromptTemplate extends Model {}

AbmPromptTemplate.init(
  {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lane: { type: DataTypes.STRING(64), allowNull: false },
    persona: { type: DataTypes.STRING(32), allowNull: false },
    intent_stage: { type: DataTypes.STRING(32), allowNull: false },
    version: { type: DataTypes.STRING(32), allowNull: true },
    system_prompt: { type: DataTypes.TEXT, allowNull: false },
    user_prompt_template: { type: DataTypes.TEXT, allowNull: false },
    max_words: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 180 },
  },
  {
    sequelize,
    modelName: 'AbmPromptTemplate',
    tableName: 'abm_prompt_templates',
    freezeTableName: true,
    underscored: true,
    timestamps: true,
  }
);

module.exports = AbmPromptTemplate;
