/**
 * Pursuits v2 §9 — Clay provider (v1).
 * Headless: raw payloads stored in enrichment_sources.raw_json; normalize into prospect_companies/contacts.
 *
 * Clay does not expose a public REST API for enrichment. Two options:
 * 1) Clay Enterprise API (contact Clay GTM): sync company/people lookup by domain or email; set CLAY_API_KEY + CLAY_API_URL to the base they provide.
 * 2) Stub mode: when CLAY_API_KEY is unset, returns stub firmographics so the pipeline still runs; set env to go live.
 */
const fetch = require('node-fetch');

/**
 * @implements {IEnrichmentProvider}
 */
class ClayProvider {
  constructor() {
    this.apiKey = process.env.CLAY_API_KEY || process.env.CLAY_API_KEY_HEADLESS;
    this.baseUrl = (process.env.CLAY_API_URL || 'https://api.clay.com').replace(/\/$/, '');
  }

  async enrichCompany({ name, domain }) {
    if (!this.apiKey) {
      return this._stubEnrichCompany({ name, domain });
    }
    try {
      const res = await fetch(`${this.baseUrl}/v1/company/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ name, domain }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `Clay API ${res.status}`);
      }
      const data = await res.json();
      return {
        firmographics: data.firmographics || data,
        contacts: data.contacts || [],
      };
    } catch (err) {
      console.error('Clay enrichCompany error:', err.message);
      return this._stubEnrichCompany({ name, domain });
    }
  }

  async findContacts({ domain, roles = [] }) {
    if (!this.apiKey) {
      return { contacts: [] };
    }
    try {
      const res = await fetch(`${this.baseUrl}/v1/people/find`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ domain, roles }),
      });
      if (!res.ok) return { contacts: [] };
      const data = await res.json();
      return { contacts: data.contacts || data || [] };
    } catch (err) {
      console.error('Clay findContacts error:', err.message);
      return { contacts: [] };
    }
  }

  async verifyEmail({ email }) {
    if (!this.apiKey) {
      return { valid: undefined };
    }
    try {
      const res = await fetch(`${this.baseUrl}/v1/email/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) return { valid: undefined };
      const data = await res.json();
      return { valid: data.valid };
    } catch (err) {
      console.error('Clay verifyEmail error:', err.message);
      return { valid: undefined };
    }
  }

  _stubEnrichCompany({ name, domain }) {
    return {
      firmographics: { name, domain, _stub: true, _message: 'Set CLAY_API_KEY (and CLAY_API_URL for Enterprise) for live enrichment' },
      contacts: [],
    };
  }
}

module.exports = { ClayProvider };
