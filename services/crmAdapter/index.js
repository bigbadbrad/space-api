/**
 * ABM Rev 3: CRM (Salesforce) adapter for Mission → Opportunity push.
 * One-way sync. When SF env vars are not set, returns stub (no API call).
 *
 * Two auth modes (pick one):
 *
 * 1) External Client App (Spring '26+) — Client Credentials (no username/password)
 *    .env: SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_LOGIN_URL
 *    Create app in Setup: Quick Find → "External Client App Manager" → New → enable Client Credentials, set Run As user.
 *
 * 2) Connected App (legacy) — Username-Password
 *    .env: add SALESFORCE_USERNAME, SALESFORCE_PASSWORD (password + security token, no space)
 */
const axios = require('axios');

const SF_API_VERSION = 'v59.0';

function hasClientCredentials() {
  return !!(
    process.env.SALESFORCE_CLIENT_ID &&
    process.env.SALESFORCE_CLIENT_SECRET &&
    process.env.SALESFORCE_LOGIN_URL
  );
}

function hasUsernamePassword() {
  return !!(process.env.SALESFORCE_USERNAME && process.env.SALESFORCE_PASSWORD);
}

function isConfigured() {
  if (!hasClientCredentials()) return false;
  return hasUsernamePassword() || true; // client_credentials works with just 3 vars
}

const LOGIN_PRODUCTION = 'https://login.salesforce.com';
const LOGIN_SANDBOX = 'https://test.salesforce.com';

function getLoginBaseUrl() {
  return (process.env.SALESFORCE_LOGIN_URL || '').replace(/\/$/, '') || LOGIN_PRODUCTION;
}

function isDomainNotSupportedError(err) {
  const data = err.response?.data;
  const msg = (data && (data.error_description || data.error || data.message))
    ? String(data.error_description || data.error || data.message)
    : (err.message || '');
  const body = data ? JSON.stringify(data) : '';
  return String(msg).toLowerCase().includes('request not supported on this domain')
    || body.toLowerCase().includes('request not supported on this domain');
}

/** All standard login URLs to try when one returns "request not supported on this domain". */
function getLoginUrlsToTry() {
  const configured = getLoginBaseUrl();
  const urls = [configured];
  if (configured !== LOGIN_PRODUCTION) urls.push(LOGIN_PRODUCTION);
  if (configured !== LOGIN_SANDBOX) urls.push(LOGIN_SANDBOX);
  return urls;
}

/**
 * Client Credentials flow (External Client App). No username/password.
 * @param {string} [baseUrl] - optional override (used for retry)
 * @returns {Promise<{ accessToken: string, instanceUrl: string }>}
 */
async function getAccessTokenClientCredentials(baseUrl) {
  const url = baseUrl || getLoginBaseUrl();
  const res = await axios.post(
    `${url}/services/oauth2/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SALESFORCE_CLIENT_ID,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    }
  );
  return {
    accessToken: res.data.access_token,
    instanceUrl: res.data.instance_url,
  };
}

/**
 * Username-Password flow (Connected App).
 * @param {string} [baseUrl] - optional override (used for retry)
 * @returns {Promise<{ accessToken: string, instanceUrl: string }>}
 */
async function getAccessTokenUsernamePassword(baseUrl) {
  const url = baseUrl || getLoginBaseUrl();
  const res = await axios.post(
    `${url}/services/oauth2/token`,
    new URLSearchParams({
      grant_type: 'password',
      client_id: process.env.SALESFORCE_CLIENT_ID,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET,
      username: process.env.SALESFORCE_USERNAME,
      password: process.env.SALESFORCE_PASSWORD,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    }
  );
  return {
    accessToken: res.data.access_token,
    instanceUrl: res.data.instance_url,
  };
}

async function getAccessToken() {
  const tryToken = (baseUrl) => (hasUsernamePassword() ? getAccessTokenUsernamePassword(baseUrl) : getAccessTokenClientCredentials(baseUrl));
  const urls = getLoginUrlsToTry();
  let lastErr;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.error('[Salesforce] Token attempt', i + 1, 'of', urls.length, url);
    try {
      return await tryToken(url);
    } catch (err) {
      lastErr = err;
      const msg = err.response?.data?.error_description || err.message || '';
      if (i < urls.length - 1) console.error('[Salesforce] Failed:', msg);
      if (!isDomainNotSupportedError(err)) throw err;
    }
  }
  const tried = urls.join(', ');
  const sfMsg = lastErr?.response?.data?.error_description || lastErr?.message || String(lastErr);
  const hint = ' Set SALESFORCE_LOGIN_URL to your org My Domain URL (Setup → My Domain in Salesforce, e.g. https://yourorg.my.salesforce.com). Or use a Connected App with SALESFORCE_USERNAME and SALESFORCE_PASSWORD.';
  throw new Error(sfMsg + ' (tried: ' + tried + ').' + hint);
}

/**
 * @param {string} instanceUrl
 * @param {string} accessToken
 * @param {string} sobject - e.g. 'Account', 'Opportunity'
 * @param {object} body - field key-value
 * @returns {Promise<string>} new record id
 */
async function createRecord(instanceUrl, accessToken, sobject, body) {
  const url = `${instanceUrl}/services/data/${SF_API_VERSION}/sobjects/${sobject}`;
  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return res.data.id;
}

/**
 * @param {string} instanceUrl
 * @param {string} accessToken
 * @param {string} sobject
 * @param {string} id
 * @param {object} body - fields to update
 */
async function updateRecord(instanceUrl, accessToken, sobject, id, body) {
  const url = `${instanceUrl}/services/data/${SF_API_VERSION}/sobjects/${sobject}/${id}`;
  await axios.patch(url, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}

/**
 * @param {string} instanceUrl
 * @param {string} accessToken
 * @param {string} soql
 * @returns {Promise<{ records: Array<{ Id: string }> }>}
 */
async function query(instanceUrl, accessToken, soql) {
  const url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  return res.data;
}

/**
 * Find or create a Contact on the Account. Returns contact Id or null if no contact info.
 * @param {string} instanceUrl
 * @param {string} accessToken
 * @param {string} accountId
 * @param {{ email?: string; first_name?: string; last_name?: string; title?: string }} contactInfo
 * @returns {Promise<string | null>}
 */
async function findOrCreateContact(instanceUrl, accessToken, accountId, contactInfo) {
  const email = (contactInfo?.email || contactInfo?.Email || '').trim();
  const lastName = (contactInfo?.last_name ?? contactInfo?.LastName ?? 'Contact').trim() || 'Contact';
  const firstName = (contactInfo?.first_name ?? contactInfo?.FirstName ?? '').trim();
  const title = (contactInfo?.title ?? contactInfo?.Title ?? '').trim();
  if (!accountId) return null;

  if (email) {
    const q = `SELECT Id FROM Contact WHERE AccountId = '${accountId.replace(/'/g, "\\'")}' AND Email = '${email.replace(/'/g, "\\'")}' LIMIT 1`;
    try {
      const data = await query(instanceUrl, accessToken, q);
      if (data.records && data.records.length > 0) {
        return data.records[0].Id;
      }
    } catch (_) { /* ignore query errors, create below */ }
  }

  const contactFields = {
    AccountId: accountId,
    LastName: lastName,
    ...(firstName && { FirstName: firstName }),
    ...(email && { Email: email }),
    ...(title && { Title: title }),
  };
  const contactId = await createRecord(instanceUrl, accessToken, 'Contact', contactFields);
  return contactId;
}

/**
 * Link Contact to Opportunity as primary role. Idempotent: creates role if missing.
 * @param {string} instanceUrl
 * @param {string} accessToken
 * @param {string} opportunityId
 * @param {string} contactId
 */
async function linkContactToOpportunity(instanceUrl, accessToken, opportunityId, contactId) {
  const q = `SELECT Id FROM OpportunityContactRole WHERE OpportunityId = '${opportunityId.replace(/'/g, "\\'")}' AND ContactId = '${contactId.replace(/'/g, "\\'")}' LIMIT 1`;
  try {
    const data = await query(instanceUrl, accessToken, q);
    if (data.records && data.records.length > 0) return;
  } catch (_) { /* continue to create */ }
  await createRecord(instanceUrl, accessToken, 'OpportunityContactRole', {
    OpportunityId: opportunityId,
    ContactId: contactId,
    Role: 'Decision Maker',
    IsPrimary: true,
  });
}

/**
 * Map mission stage to Salesforce StageName (picklist). Use as-is if org uses same values; else extend mapping.
 * @param {string} stage
 * @returns {string}
 */
function mapStageToSalesforce(stage) {
  const map = {
    new: 'Prospecting',
    qualified: 'Qualification',
    solutioning: 'Needs Analysis',
    proposal: 'Proposal/Price Quote',
    negotiation: 'Negotiation/Review',
    closed_won: 'Closed Won',
    closed_lost: 'Closed Lost',
    on_hold: 'Prospecting',
  };
  return map[stage] || stage || 'Prospecting';
}

/**
 * @param {object} missionPayload - Mission fields + linked account/contact/leadRequest; must include salesforce_opportunity_id, salesforce_account_id when known
 * @returns {Promise<{ opportunityId: string | null, accountId: string | null }>}
 */
async function pushMission(missionPayload) {
  if (!isConfigured()) {
    return { opportunityId: null, accountId: null };
  }

  const {
    title,
    stage,
    service_lane,
    prospectCompany,
    leadRequest,
    primaryContact,
    salesforce_opportunity_id: existingOpportunityId,
    salesforce_account_id: existingAccountId,
  } = missionPayload || {};

  const accountName =
    prospectCompany?.name ||
    leadRequest?.organization_name ||
    'Unknown Account';

  const accountWebsite =
    leadRequest?.organization_website ||
    prospectCompany?.domain ||
    null;
  const websiteUrl = accountWebsite
    ? (/^https?:\/\//i.test(accountWebsite) ? accountWebsite : `https://${accountWebsite.replace(/^\/+|\/+$/g, '')}`)
    : null;

  const accountFields = {
    Name: accountName,
    ...(websiteUrl && { Website: websiteUrl }),
  };

  // Opportunity Name: human-friendly for any mission (normalize dashes, underscores→spaces, title-case). No service-specific logic.
  const rawName = (title || service_lane || 'Mission').trim();
  const normalizedName = rawName
    .replace(/\s*[—–-]\s*/g, ' - ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const titleCase = (s) => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const opportunityName = normalizedName
    ? normalizedName.split(' - ').map((part) => titleCase(part.trim())).join(' - ')
    : 'Mission';

  const closeDate = new Date();
  closeDate.setDate(closeDate.getDate() + 90);
  const closeDateStr = closeDate.toISOString().slice(0, 10);

  let accessToken;
  let instanceUrl;
  try {
    const auth = await getAccessToken();
    accessToken = auth.accessToken;
    instanceUrl = auth.instanceUrl;
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message || String(err);
    throw new Error(`Salesforce login failed: ${msg}`);
  }

  let accountId = existingAccountId;

  if (!accountId) {
    try {
      accountId = await createRecord(instanceUrl, accessToken, 'Account', accountFields);
    } catch (err) {
      const msg = err.response?.data?.[0]?.message || err.message || String(err);
      throw new Error(`Salesforce Account create failed: ${msg}`);
    }
  } else {
    try {
      await updateRecord(instanceUrl, accessToken, 'Account', accountId, accountFields);
    } catch (err) {
      const msg = err.response?.data?.[0]?.message || err.message || String(err);
      throw new Error(`Salesforce Account update failed: ${msg}`);
    }
  }

  const contactInfo = primaryContact
    ? { email: primaryContact.email, first_name: primaryContact.first_name, last_name: primaryContact.last_name, title: primaryContact.title }
    : leadRequest?.work_email
      ? { email: leadRequest.work_email, first_name: '', last_name: 'Contact', title: '' }
      : null;
  const hasContactInfo = contactInfo && (contactInfo.email || contactInfo.first_name || (contactInfo.last_name && contactInfo.last_name !== 'Contact'));
  let contactId = null;
  if (hasContactInfo) {
    try {
      contactId = await findOrCreateContact(instanceUrl, accessToken, accountId, contactInfo);
    } catch (err) {
      const msg = err.response?.data?.[0]?.message || err.message || String(err);
      throw new Error(`Salesforce Contact create failed: ${msg}`);
    }
  }

  const opportunityFields = {
    Name: opportunityName,
    AccountId: accountId,
    StageName: mapStageToSalesforce(stage),
    CloseDate: closeDateStr,
    Description: service_lane ? `Service lane: ${service_lane}` : undefined,
  };
  Object.keys(opportunityFields).forEach((k) => {
    if (opportunityFields[k] === undefined) delete opportunityFields[k];
  });

  if (existingOpportunityId) {
    try {
      await updateRecord(instanceUrl, accessToken, 'Opportunity', existingOpportunityId, opportunityFields);
      if (contactId) {
        try {
          await linkContactToOpportunity(instanceUrl, accessToken, existingOpportunityId, contactId);
        } catch (_) { /* non-fatal */ }
      }
      return { opportunityId: existingOpportunityId, accountId };
    } catch (err) {
      const msg = err.response?.data?.[0]?.message || err.message || String(err);
      throw new Error(`Salesforce Opportunity update failed: ${msg}`);
    }
  }

  try {
    const opportunityId = await createRecord(instanceUrl, accessToken, 'Opportunity', opportunityFields);
    if (contactId) {
      try {
        await linkContactToOpportunity(instanceUrl, accessToken, opportunityId, contactId);
      } catch (_) { /* non-fatal */ }
    }
    return { opportunityId, accountId };
  } catch (err) {
    const msg = err.response?.data?.[0]?.message || err.message || String(err);
    throw new Error(`Salesforce Opportunity create failed: ${msg}`);
  }
}

module.exports = { pushMission };
