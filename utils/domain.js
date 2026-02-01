/**
 * Phase 2: Canonical domain normalization (Account Key)
 * Account Key = normalized domain (lowercase, strip protocol/path, strip www.)
 * Personal email domains must not be used → account_key = null
 */

const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'mail.com',
]);

function safeLower(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

/**
 * Normalize domain from URL
 * @param {string} url - Full URL or host
 * @returns {string|null} e.g. 'acmespace.com'
 */
function normalizeDomainFromUrl(url) {
  try {
    if (!url) return null;
    const s = safeLower(url);
    const withProto = s.startsWith('http') ? s : `https://${s}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Extract domain from email; return null for personal domains
 * @param {string} email
 * @returns {string|null}
 */
function normalizeDomainFromEmail(email) {
  const e = safeLower(email);
  if (!e.includes('@')) return null;
  const domain = e.split('@')[1];
  if (!domain) return null;
  if (PERSONAL_DOMAINS.has(domain)) return null;
  return domain;
}

/**
 * Resolve account key from payload (LeadRequest-style)
 * Preference: organization_website domain, then work_email domain
 * @param {{ organization_website?: string, work_email?: string }} payload
 * @returns {string|null}
 */
function resolveAccountKey(payload) {
  if (!payload) return null;
  const fromUrl = normalizeDomainFromUrl(payload.organization_website);
  if (fromUrl && !PERSONAL_DOMAINS.has(fromUrl)) return fromUrl;
  const fromEmail = normalizeDomainFromEmail(payload.work_email);
  return fromEmail;
}

module.exports = {
  normalizeDomainFromUrl,
  normalizeDomainFromEmail,
  resolveAccountKey,
  PERSONAL_DOMAINS,
};
