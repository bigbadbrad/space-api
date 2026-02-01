'use strict';

/**
 * Phase 2 MVP Step 2: Create account_ai_summaries table
 * Caches premium AI account summaries.
 * prompt_template_id references abm_prompt_templates (created in Step 3) - no FK yet
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [results] = await queryInterface.sequelize.query(
      "SHOW TABLES LIKE 'account_ai_summaries'"
    );
    const tableExists = Array.isArray(results) && results.length > 0;
    if (!tableExists) {
      await queryInterface.createTable('account_ai_summaries', {
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
      cache_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      top_lane: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      intent_score: { type: Sequelize.INTEGER, allowNull: true },
      surge_level: { type: Sequelize.STRING(32), allowNull: true },
      prompt_template_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      input_json: { type: Sequelize.JSON, allowNull: true },
      summary_md: { type: Sequelize.TEXT, allowNull: true },
      model: { type: Sequelize.STRING(64), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    }
    await queryInterface.addIndex('account_ai_summaries', ['prospect_company_id', 'cache_date', 'top_lane'], {
      unique: true,
      name: 'aas_company_date_lane_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('account_ai_summaries');
  },
};
