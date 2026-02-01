'use strict';

/**
 * Phase 2 MVP Step 3: Create registry tables
 * - abm_event_rules
 * - abm_score_configs
 * - abm_score_weights
 * - abm_prompt_templates
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('abm_score_configs', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      name: { type: Sequelize.STRING(64), allowNull: false },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'active' },
      lambda_decay: { type: Sequelize.DECIMAL(10, 4), allowNull: false, defaultValue: 0.1 },
      normalize_k: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 80 },
      cold_max: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 34 },
      warm_max: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 69 },
      surge_surging_min: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 1.5 },
      surge_exploding_min: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 2.5 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('abm_score_weights', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      score_config_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'abm_score_configs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      event_name: { type: Sequelize.STRING(64), allowNull: false },
      content_type: { type: Sequelize.STRING(64), allowNull: true },
      cta_id: { type: Sequelize.STRING(64), allowNull: true },
      weight: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('abm_event_rules', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
      event_name: { type: Sequelize.STRING(64), allowNull: false },
      match_type: { type: Sequelize.STRING(32), allowNull: false },
      match_value: { type: Sequelize.STRING(512), allowNull: false },
      content_type: { type: Sequelize.STRING(64), allowNull: true },
      lane: { type: Sequelize.STRING(64), allowNull: true },
      weight_override: { type: Sequelize.INTEGER, allowNull: true },
      score_config_id: { type: Sequelize.UUID, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('abm_prompt_templates', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      lane: { type: Sequelize.STRING(64), allowNull: false },
      persona: { type: Sequelize.STRING(32), allowNull: false },
      intent_stage: { type: Sequelize.STRING(32), allowNull: false },
      version: { type: Sequelize.STRING(32), allowNull: true },
      system_prompt: { type: Sequelize.TEXT, allowNull: false },
      user_prompt_template: { type: Sequelize.TEXT, allowNull: false },
      max_words: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 180 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('abm_score_weights', ['score_config_id']);
    await queryInterface.addIndex('abm_event_rules', ['score_config_id', 'enabled', 'priority']);
    await queryInterface.addIndex('abm_prompt_templates', ['lane', 'persona', 'intent_stage', 'enabled']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('abm_prompt_templates');
    await queryInterface.dropTable('abm_event_rules');
    await queryInterface.dropTable('abm_score_weights');
    await queryInterface.dropTable('abm_score_configs');
  },
};
