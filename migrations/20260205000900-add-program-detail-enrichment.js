'use strict';

/**
 * Program Detail Panel Rev: enrich program fields + triage + notes
 */
async function columnExists(queryInterface, tableName, columnName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${tableName}' AND column_name = '${columnName}' LIMIT 1`
  );
  return rows && rows.length > 0;
}
async function tableExists(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${tableName}' LIMIT 1`
  );
  return rows && rows.length > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = [
      { name: 'description', def: { type: Sequelize.TEXT, allowNull: true } },
      { name: 'agency_path', def: { type: Sequelize.STRING(512), allowNull: true } },
      { name: 'updated_at_source', def: { type: Sequelize.DATE, allowNull: true } },
      { name: 'place_of_performance_json', def: { type: Sequelize.JSON, allowNull: true } },
      { name: 'contacts_json', def: { type: Sequelize.JSON, allowNull: true } },
      { name: 'attachments_json', def: { type: Sequelize.JSON, allowNull: true } },
      { name: 'owner_user_id', def: { type: Sequelize.UUID, allowNull: true } },
      { name: 'triage_status', def: { type: Sequelize.STRING(32), allowNull: true } },
      { name: 'priority', def: { type: Sequelize.STRING(16), allowNull: true } },
      { name: 'internal_notes', def: { type: Sequelize.TEXT, allowNull: true } },
      { name: 'last_triaged_at', def: { type: Sequelize.DATE, allowNull: true } },
    ];
    for (const c of cols) {
      if (!(await columnExists(queryInterface, 'procurement_programs', c.name))) {
        await queryInterface.addColumn('procurement_programs', c.name, c.def);
      }
    }

    if (!(await tableExists(queryInterface, 'procurement_program_notes'))) {
      await queryInterface.createTable('procurement_program_notes', {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
        },
        procurement_program_id: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
      await queryInterface.addIndex('procurement_program_notes', ['procurement_program_id']);
    }
  },

  async down(queryInterface) {
    const cols = ['description', 'agency_path', 'updated_at_source', 'place_of_performance_json', 'contacts_json', 'attachments_json', 'owner_user_id', 'triage_status', 'priority', 'internal_notes', 'last_triaged_at'];
    for (const c of cols) {
      try {
        await queryInterface.removeColumn('procurement_programs', c);
      } catch (_) {}
    }
    await queryInterface.dropTable('procurement_program_notes');
  },
};
