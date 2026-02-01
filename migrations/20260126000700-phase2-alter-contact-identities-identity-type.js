'use strict';

/**
 * Phase 2 MVP Step 2: Alter contact_identities to support hashed_email
 * Change identity_type from ENUM to STRING(64) for flexibility per spec 4.6
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('contact_identities', 'identity_type', {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('contact_identities', 'identity_type', {
      type: Sequelize.ENUM('posthog_distinct_id', 'email', 'crm_id', 'cookie_id'),
      allowNull: false,
    });
  },
};
