'use strict';

async function columnExists(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return rows.length > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'lead_requests';

    if (!(await columnExists(queryInterface, table, 'internal_notes'))) {
      await queryInterface.addColumn(table, 'internal_notes', {
        type: Sequelize.TEXT,
        allowNull: true,
        after: 'notes',
      });
    }

    if (!(await columnExists(queryInterface, table, 'tags_json'))) {
      await queryInterface.addColumn(table, 'tags_json', {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [],
        after: 'routed_to_user_id',
      });
    }

    if (!(await columnExists(queryInterface, table, 'disposition_reason'))) {
      await queryInterface.addColumn(table, 'disposition_reason', {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: 'routing_status',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('lead_requests', 'internal_notes');
    await queryInterface.removeColumn('lead_requests', 'tags_json');
    await queryInterface.removeColumn('lead_requests', 'disposition_reason');
  },
};

