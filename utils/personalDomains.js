'use strict';

/**
 * Epic 5: Personal email domains — never create prospect/group or attribute intent to these.
 */
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
  'gmx.net',
  'fastmail.com',
  'tutanota.com',
  'mailfence.com',
  'hey.com',
]);

/**
 * @param {string} domainOrEmail - domain (e.g. "gmail.com") or email (e.g. "u@gmail.com")
 * @returns {boolean}
 */
function isPersonalDomain(domainOrEmail) {
  if (!domainOrEmail || typeof domainOrEmail !== 'string') return false;
  const s = domainOrEmail.trim().toLowerCase();
  const domain = s.includes('@') ? s.split('@')[1] : s;
  return PERSONAL_DOMAINS.has(domain);
}

module.exports = { isPersonalDomain, PERSONAL_DOMAINS };
