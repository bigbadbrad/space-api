'use strict';

/**
 * Phase 2 MVP Step 2: Create daily_account_intent table
 * Stores daily rollups for dashboards and account detail timeline.
 * score_config_id references abm_score_configs (created in Step 3) - no FK yet
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('daily_account_intent', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      prospect_company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'prospect_companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      score_config_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      raw_score_7d: { type: Sequelize.FLOAT, allowNull: true },
      raw_score_prev_7d: { type: Sequelize.FLOAT, allowNull: true },
      raw_score_30d: { type: Sequelize.FLOAT, allowNull: true },
      intent_score: { type: Sequelize.INTEGER, allowNull: true },
      intent_stage: { type: Sequelize.STRING(32), allowNull: true },
      surge_ratio: { type: Sequelize.FLOAT, allowNull: true },
      surge_level: { type: Sequelize.STRING(32), allowNull: true },
      unique_people_7d: { type: Sequelize.INTEGER, allowNull: true },
      top_lane: { type: Sequelize.STRING(64), allowNull: true },
      lane_scores_7d_json: { type: Sequelize.JSON, allowNull: true },
      lane_scores_30d_json: { type: Sequelize.JSON, allowNull: true },
      top_categories_7d_json: { type: Sequelize.JSON, allowNull: true },
      top_pages_7d_json: { type: Sequelize.JSON, allowNull: true },
      key_events_7d_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('daily_account_intent', ['prospect_company_id', 'date'], {
      unique: true,
      name: 'dai_company_date_unique',
    });
    await queryInterface.addIndex('daily_account_intent', ['date', 'intent_stage', 'top_lane', 'surge_level'], {
      name: 'dai_dashboard_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('daily_account_intent');
  },
};
