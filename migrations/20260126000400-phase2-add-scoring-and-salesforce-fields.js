'use strict';

/**
 * Phase 2 MVP Step 1: Add scoring fields + Salesforce IDs
 * - prospect_companies: intent_stage, surge_level, top_lane, last_seen_at, score_updated_at,
 *   score_7d_raw, score_30d_raw, salesforce_account_id, salesforce_account_url, salesforce_owner_id
 * - contacts: salesforce_lead_id, salesforce_contact_id
 * - lead_requests: salesforce_lead_id, salesforce_task_id, account_key, why_hot_json
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // prospect_companies
    await queryInterface.addColumn('prospect_companies', 'intent_stage', {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'surge_level', {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'top_lane', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'last_seen_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'score_updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'score_7d_raw', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'score_30d_raw', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'salesforce_account_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'salesforce_account_url', {
      type: Sequelize.STRING(512),
      allowNull: true,
    });
    await queryInterface.addColumn('prospect_companies', 'salesforce_owner_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    // contacts
    await queryInterface.addColumn('contacts', 'salesforce_lead_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('contacts', 'salesforce_contact_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    // lead_requests
    await queryInterface.addColumn('lead_requests', 'salesforce_lead_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('lead_requests', 'salesforce_task_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('lead_requests', 'account_key', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('lead_requests', 'why_hot_json', {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    // prospect_companies
    await queryInterface.removeColumn('prospect_companies', 'intent_stage');
    await queryInterface.removeColumn('prospect_companies', 'surge_level');
    await queryInterface.removeColumn('prospect_companies', 'top_lane');
    await queryInterface.removeColumn('prospect_companies', 'last_seen_at');
    await queryInterface.removeColumn('prospect_companies', 'score_updated_at');
    await queryInterface.removeColumn('prospect_companies', 'score_7d_raw');
    await queryInterface.removeColumn('prospect_companies', 'score_30d_raw');
    await queryInterface.removeColumn('prospect_companies', 'salesforce_account_id');
    await queryInterface.removeColumn('prospect_companies', 'salesforce_account_url');
    await queryInterface.removeColumn('prospect_companies', 'salesforce_owner_id');

    // contacts
    await queryInterface.removeColumn('contacts', 'salesforce_lead_id');
    await queryInterface.removeColumn('contacts', 'salesforce_contact_id');

    // lead_requests
    await queryInterface.removeColumn('lead_requests', 'salesforce_lead_id');
    await queryInterface.removeColumn('lead_requests', 'salesforce_task_id');
    await queryInterface.removeColumn('lead_requests', 'account_key');
    await queryInterface.removeColumn('lead_requests', 'why_hot_json');
  },
};
