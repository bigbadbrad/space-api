// /services/scoring.service.js
const { IntentSignal, ProspectCompany } = require('../models');
const { Op } = require('sequelize');

/**
 * Calculate intent score for a ProspectCompany
 * Formula: Sum of IntentSignal.weight where occurred_at > (Now - 30 Days)
 */
async function calculateIntentScore(prospectCompanyId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await IntentSignal.sum('weight', {
    where: {
      prospect_company_id: prospectCompanyId,
      occurred_at: {
        [Op.gte]: thirtyDaysAgo,
      },
    },
  });

  return result || 0;
}

/**
 * Update intent score for a single ProspectCompany
 */
async function updateIntentScore(prospectCompanyId) {
  const score = await calculateIntentScore(prospectCompanyId);
  
  await ProspectCompany.update(
    { intent_score: score },
    { where: { id: prospectCompanyId } }
  );

  return score;
}

/**
 * Update intent scores for all ProspectCompanies (batch job)
 */
async function updateAllIntentScores() {
  const companies = await ProspectCompany.findAll({
    attributes: ['id'],
  });

  const updates = await Promise.all(
    companies.map(company => updateIntentScore(company.id))
  );

  return {
    updated: updates.length,
    scores: updates,
  };
}

/**
 * Update intent score when a new signal is created
 * This can be called asynchronously after signal creation
 */
async function updateIntentScoreOnNewSignal(prospectCompanyId) {
  return updateIntentScore(prospectCompanyId);
}

module.exports = {
  calculateIntentScore,
  updateIntentScore,
  updateAllIntentScores,
  updateIntentScoreOnNewSignal,
};
