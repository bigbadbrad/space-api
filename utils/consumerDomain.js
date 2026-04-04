/**
 * Normalize domain for consumer properties: lowercase, strip scheme/path/query/fragment.
 * Spec: consumer-gtm-properties-publisher-v1.md §1.1
 * @param {string} input - e.g. "https://Example.com/path?q=1"
 * @returns {string} - e.g. "example.com"
 */
function normalizeDomain(input) {
  if (typeof input !== 'string') return '';
  let s = input.trim().toLowerCase();
  try {
    if (!s.includes('://')) s = 'https://' + s;
    const u = new URL(s);
    return u.hostname || '';
  } catch {
    return '';
  }
}

module.exports = { normalizeDomain };
