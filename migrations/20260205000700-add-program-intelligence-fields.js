'use strict';

/**
 * Addendum: Program Intelligence - add relevance fields + create registry tables
 * Idempotent: skips if table/column/index already exists
 */
async function tableExists(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${tableName}' LIMIT 1`
  );
  return rows && rows.length > 0;
}
async function columnExists(queryInterface, tableName, columnName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND column_name = '${columnName}' LIMIT 1`
  );
  return rows && rows.length > 0;
}
async function indexExists(queryInterface, tableName, indexName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND index_name = '${indexName}' LIMIT 1`
  );
  return rows && rows.length > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = [
      { name: 'relevance_score', def: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 } },
      { name: 'match_confidence', def: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 } },
      { name: 'match_reasons_json', def: { type: Sequelize.JSON, allowNull: true } },
      { name: 'classification_version', def: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'v1' } },
      { name: 'suppressed', def: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false } },
      { name: 'suppressed_reason', def: { type: Sequelize.STRING(512), allowNull: true } },
    ];
    for (const c of cols) {
      if (!(await columnExists(queryInterface, 'procurement_programs', c.name))) {
        await queryInterface.addColumn('procurement_programs', c.name, c.def);
      }
    }
    const ppIndexes = [
      { cols: ['relevance_score'], name: 'procurement_programs_relevance_score' },
      { cols: ['match_confidence'], name: 'procurement_programs_match_confidence' },
      { cols: ['suppressed'], name: 'procurement_programs_suppressed' },
    ];
    for (const idx of ppIndexes) {
      if (!(await indexExists(queryInterface, 'procurement_programs', idx.name))) {
        await queryInterface.addIndex('procurement_programs', idx.cols, { name: idx.name });
      }
    }

    if (!(await tableExists(queryInterface, 'abm_program_rules'))) {
      await queryInterface.createTable('abm_program_rules', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      match_field: { type: Sequelize.STRING(64), allowNull: true },
      match_type: { type: Sequelize.STRING(32), allowNull: true },
      match_value: { type: Sequelize.TEXT, allowNull: true },
      service_lane: { type: Sequelize.STRING(64), allowNull: true },
      topic: { type: Sequelize.STRING(128), allowNull: true },
      add_score: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 20 },
      set_confidence: { type: Sequelize.FLOAT, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
      if (!(await indexExists(queryInterface, 'abm_program_rules', 'abm_program_rules_enabled_priority'))) {
        await queryInterface.addIndex('abm_program_rules', ['enabled', 'priority'], { name: 'abm_program_rules_enabled_priority' });
      }
    }

    if (!(await tableExists(queryInterface, 'abm_program_suppression_rules'))) {
      await queryInterface.createTable('abm_program_suppression_rules', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      match_field: { type: Sequelize.STRING(64), allowNull: true },
      match_type: { type: Sequelize.STRING(32), allowNull: true },
      match_value: { type: Sequelize.TEXT, allowNull: true },
      suppress_reason: { type: Sequelize.STRING(255), allowNull: true },
      suppress_score_threshold: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
      if (!(await indexExists(queryInterface, 'abm_program_suppression_rules', 'abm_program_suppression_rules_enabled_priority'))) {
        await queryInterface.addIndex('abm_program_suppression_rules', ['enabled', 'priority'], { name: 'abm_program_suppression_rules_enabled_priority' });
      }
    }

    if (!(await tableExists(queryInterface, 'abm_lane_definitions'))) {
      await queryInterface.createTable('abm_lane_definitions', {
      lane_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
        primaryKey: true,
      },
      display_name: { type: Sequelize.STRING(128), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      keywords_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('procurement_programs', 'procurement_programs_relevance_score');
    await queryInterface.removeIndex('procurement_programs', 'procurement_programs_match_confidence');
    await queryInterface.removeIndex('procurement_programs', 'procurement_programs_suppressed');
    await queryInterface.removeColumn('procurement_programs', 'relevance_score');
    await queryInterface.removeColumn('procurement_programs', 'match_confidence');
    await queryInterface.removeColumn('procurement_programs', 'match_reasons_json');
    await queryInterface.removeColumn('procurement_programs', 'classification_version');
    await queryInterface.removeColumn('procurement_programs', 'suppressed');
    await queryInterface.removeColumn('procurement_programs', 'suppressed_reason');

    await queryInterface.dropTable('abm_program_rules');
    await queryInterface.dropTable('abm_program_suppression_rules');
    await queryInterface.dropTable('abm_lane_definitions');
  },
};
