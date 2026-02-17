'use strict';

/**
 * ABM Rev 3: Mission artifacts - content_md, input_hash, model_name for cached briefs
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('mission_artifacts');
    if (!table.content_md) {
      await queryInterface.addColumn('mission_artifacts', 'content_md', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!table.input_hash) {
      await queryInterface.addColumn('mission_artifacts', 'input_hash', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }
    if (!table.model_name) {
      await queryInterface.addColumn('mission_artifacts', 'model_name', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('mission_artifacts');
    if (table.content_md) await queryInterface.removeColumn('mission_artifacts', 'content_md');
    if (table.input_hash) await queryInterface.removeColumn('mission_artifacts', 'input_hash');
    if (table.model_name) await queryInterface.removeColumn('mission_artifacts', 'model_name');
  },
};
