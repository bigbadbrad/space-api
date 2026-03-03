/**
 * Pursuits v2 §9 — Headless enrichment provider abstraction.
 * Use Clay (or Apollo, etc.) as a backend utility; users never see Clay/spreadsheets.
 *
 * @typedef {Object} EnrichCompanyResult
 * @property {Object} [firmographics] - name, domain, industry, employee_count, etc.
 * @property {Array<{ name?: string; email?: string; title?: string; linkedin?: string }>} [contacts]
 *
 * @typedef {Object} FindContactsResult
 * @property {Array<{ name?: string; email?: string; title?: string }>} contacts
 *
 * @typedef {Object} IEnrichmentProvider
 * @property {function({ name: string, domain: string }): Promise<EnrichCompanyResult>} enrichCompany
 * @property {function({ domain: string, roles?: string[] }): Promise<FindContactsResult>} [findContacts]
 * @property {function({ email: string }): Promise<{ valid?: boolean }>} [verifyEmail]
 */

module.exports = {};
