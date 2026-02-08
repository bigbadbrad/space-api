'use strict';

/**
 * Sprint 2: Unified program_items table (SAM + USAspending + SpaceWERX)
 * Idempotent: skips if table/indexes already exist (handles partial run recovery).
 */
async function indexExists(queryInterface, tableName, indexName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.statistics 
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    { replacements: [tableName, indexName] }
  );
  return rows.length > 0;
}

async function tableExists(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.tables 
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    { replacements: [tableName] }
  );
  return rows.length > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const programItemsExists = await tableExists(queryInterface, 'program_items');
    if (!programItemsExists) {
      await queryInterface.createTable('program_items', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      source_type: {
        type: Sequelize.ENUM('sam_opportunity', 'usaspending_award', 'spacewerx_award'),
        allowNull: false,
      },
      source_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      title: { type: Sequelize.STRING(1024), allowNull: false },
      agency: { type: Sequelize.STRING(255), allowNull: true },
      agency_path: { type: Sequelize.STRING(512), allowNull: true },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'open' },
      notice_type: { type: Sequelize.STRING(64), allowNull: true },
      posted_at: { type: Sequelize.DATE, allowNull: true },
      updated_at_source: { type: Sequelize.DATE, allowNull: true },
      due_at: { type: Sequelize.DATE, allowNull: true },
      due_in_days: { type: Sequelize.INTEGER, allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      naics: { type: Sequelize.STRING(64), allowNull: true },
      psc: { type: Sequelize.STRING(64), allowNull: true },
      set_aside: { type: Sequelize.STRING(128), allowNull: true },
      place_of_performance_json: { type: Sequelize.JSON, allowNull: true },
      amount_obligated: { type: Sequelize.DECIMAL(18, 2), allowNull: true },
      amount_total_value: { type: Sequelize.DECIMAL(18, 2), allowNull: true },
      links_json: { type: Sequelize.JSON, allowNull: true },
      attachments_json: { type: Sequelize.JSON, allowNull: true },
      contacts_json: { type: Sequelize.JSON, allowNull: true },
      service_lane: { type: Sequelize.STRING(64), allowNull: true },
      topic: { type: Sequelize.STRING(128), allowNull: true },
      relevance_score: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      match_confidence: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      match_reasons_json: { type: Sequelize.JSON, allowNull: true },
      classification_version: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'v1_rules' },
      suppressed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      suppressed_reason: { type: Sequelize.STRING(512), allowNull: true },
      owner_user_id: { type: Sequelize.UUID, allowNull: true },
      triage_status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'new' },
      priority: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'med' },
      last_triaged_at: { type: Sequelize.DATE, allowNull: true },
      internal_notes: { type: Sequelize.TEXT, allowNull: true },
      linked_prospect_company_id: { type: Sequelize.UUID, allowNull: true },
      linked_mission_id: { type: Sequelize.UUID, allowNull: true },
      raw_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }

    const indexes = [
      { fields: ['source_type', 'source_id'], opts: { unique: true }, name: 'program_items_source_type_source_id' },
      { fields: ['relevance_score'], opts: {}, name: 'program_items_relevance_score' },
      { fields: ['match_confidence'], opts: {}, name: 'program_items_match_confidence' },
      { fields: ['service_lane'], opts: {}, name: 'program_items_service_lane' },
      { fields: ['suppressed'], opts: {}, name: 'program_items_suppressed' },
      { fields: ['triage_status'], opts: {}, name: 'program_items_triage_status' },
      { fields: ['priority'], opts: {}, name: 'program_items_priority' },
      { fields: ['owner_user_id'], opts: {}, name: 'program_items_owner_user_id' },
      { fields: ['due_at'], opts: {}, name: 'program_items_due_at' },
      { fields: ['posted_at'], opts: {}, name: 'program_items_posted_at' },
    ];
    for (const { fields, opts, name } of indexes) {
      if (!(await indexExists(queryInterface, 'program_items', name))) {
        await queryInterface.addIndex('program_items', fields, { ...opts, name });
      }
    }

    const notesExists = await tableExists(queryInterface, 'program_item_notes');
    if (!notesExists) {
      await queryInterface.createTable('program_item_notes', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      program_item_id: { type: Sequelize.UUID, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: true },
        note: { type: Sequelize.TEXT, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      if (!(await indexExists(queryInterface, 'program_item_notes', 'program_item_notes_program_item_id'))) {
        await queryInterface.addIndex('program_item_notes', ['program_item_id'], { name: 'program_item_notes_program_item_id' });
      }
    }

    const accountLinksExists = await tableExists(queryInterface, 'program_item_account_links');
    if (!accountLinksExists) {
      await queryInterface.createTable('program_item_account_links', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      program_item_id: { type: Sequelize.UUID, allowNull: false },
        prospect_company_id: { type: Sequelize.UUID, allowNull: false },
        link_type: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'unknown' },
        confidence: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0.5 },
        evidence_json: { type: Sequelize.JSON, allowNull: true },
        created_by_user_id: { type: Sequelize.UUID, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      if (!(await indexExists(queryInterface, 'program_item_account_links', 'program_item_account_links_program_item_id'))) {
        await queryInterface.addIndex('program_item_account_links', ['program_item_id'], { name: 'program_item_account_links_program_item_id' });
      }
      if (!(await indexExists(queryInterface, 'program_item_account_links', 'program_item_account_links_program_item_id_prospect_company_id'))) {
        await queryInterface.addIndex('program_item_account_links', ['program_item_id', 'prospect_company_id'], { unique: true, name: 'program_item_account_links_program_item_id_prospect_company_id' });
      }
    }

    const missionLinksExists = await tableExists(queryInterface, 'program_item_mission_links');
    if (!missionLinksExists) {
      await queryInterface.createTable('program_item_mission_links', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      program_item_id: { type: Sequelize.UUID, allowNull: false },
        mission_id: { type: Sequelize.UUID, allowNull: false },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_by_user_id: { type: Sequelize.UUID, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      if (!(await indexExists(queryInterface, 'program_item_mission_links', 'program_item_mission_links_program_item_id'))) {
        await queryInterface.addIndex('program_item_mission_links', ['program_item_id'], { name: 'program_item_mission_links_program_item_id' });
      }
      if (!(await indexExists(queryInterface, 'program_item_mission_links', 'program_item_mission_links_program_item_id_mission_id'))) {
        await queryInterface.addIndex('program_item_mission_links', ['program_item_id', 'mission_id'], { unique: true, name: 'program_item_mission_links_program_item_id_mission_id' });
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('program_item_mission_links');
    await queryInterface.dropTable('program_item_account_links');
    await queryInterface.dropTable('program_item_notes');
    await queryInterface.dropTable('program_items');
  },
};
