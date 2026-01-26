// /services/abm.service.js
const crypto = require('crypto');
const { 
  ContactIdentity, 
  AnonymousVisitor, 
  IntentSignal, 
  ProspectCompany, 
  CompanyDomain,
  Contact 
} = require('../models');
const { Op } = require('sequelize');

/**
 * Hash IP address with salt for privacy
 */
function hashIP(ip, salt = process.env.IP_HASH_SALT || 'default-salt-change-me') {
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
}

/**
 * Mock IP enrichment - reverse IP to domain
 * In production, you'd use a service like MaxMind, IPinfo, etc.
 */
async function enrichIP(ip) {
  // Mock implementation - replace with real IP enrichment service
  // For now, return mock data
  return {
    country: 'US',
    org: 'Mock ISP',
  };
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    // If URL parsing fails, try simple extraction
    const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
    return match ? match[1].replace(/^www\./, '') : null;
  }
}

/**
 * Find ProspectCompany by domain (checking both primary domain and CompanyDomain aliases)
 */
async function findProspectCompanyByDomain(domain) {
  if (!domain) return null;

  // First check primary domain
  let prospect = await ProspectCompany.findOne({
    where: { domain },
  });

  if (prospect) return prospect;

  // Then check CompanyDomain aliases
  const companyDomain = await CompanyDomain.findOne({
    where: { domain },
    include: [{ model: ProspectCompany, as: 'prospectCompany' }],
  });

  return companyDomain ? companyDomain.prospectCompany : null;
}

/**
 * Determine if an event is a high-value signal worth storing
 */
function isHighValueSignal(eventType, url) {
  // Filter out low-value pageviews, only store high-value signals
  const highValuePatterns = [
    /pricing/i,
    /purchase/i,
    /checkout/i,
    /contact/i,
    /request.*demo/i,
    /download/i,
    /g2/i,
    /review/i,
    /docs/i,
    /api/i,
  ];

  // Always store these event types
  if (['content_download', 'g2_review', 'pricing_view'].includes(eventType)) {
    return true;
  }

  // For page_view, check if URL matches high-value patterns
  if (eventType === 'page_view') {
    return highValuePatterns.some(pattern => pattern.test(url || ''));
  }

  return false;
}

/**
 * Extract service lane from URL or event properties
 */
function extractServiceLane(url, properties = {}) {
  const serviceLanes = ['Launch', 'Mobility', 'Fuel', 'ISAM', 'Return'];
  const urlLower = (url || '').toLowerCase();
  
  // Check URL for service lane keywords
  for (const lane of serviceLanes) {
    if (urlLower.includes(lane.toLowerCase())) {
      return lane;
    }
  }

  // Check event properties
  if (properties.service_lane) {
    return properties.service_lane;
  }

  return null;
}

/**
 * Main PostHog ingestion handler
 */
async function ingestPostHogEvent(eventData) {
  const { distinct_id, ip, event: eventType, properties = {}, url } = eventData;

  // Step 1: Check if we know this person (ContactIdentity lookup)
  const contactIdentity = await ContactIdentity.findOne({
    where: {
      identity_type: 'posthog_distinct_id',
      identity_value: distinct_id,
    },
    include: [{ model: Contact, as: 'contact' }],
  });

  let prospectCompanyId = null;

  if (contactIdentity && contactIdentity.contact) {
    // We know the person - use their Contact's ProspectCompany
    prospectCompanyId = contactIdentity.contact.prospect_company_id;
  } else {
    // Step 2: Deanonymization - check AnonymousVisitor
    let anonymousVisitor = await AnonymousVisitor.findOne({
      where: { posthog_distinct_id: distinct_id },
    });

    if (!anonymousVisitor) {
      // New anonymous visitor - enrich IP and find company
      const enriched = await enrichIP(ip);
      const ipHash = hashIP(ip);
      
      // Try to find company from URL domain
      const domain = extractDomain(url);
      const prospectCompany = domain ? await findProspectCompanyByDomain(domain) : null;

      if (prospectCompany) {
        // Create AnonymousVisitor record
        anonymousVisitor = await AnonymousVisitor.create({
          prospect_company_id: prospectCompany.id,
          posthog_distinct_id: distinct_id,
          ip_hash: ipHash,
          ip_country: enriched.country,
          ip_org: enriched.org,
          last_seen_at: new Date(),
        });
        prospectCompanyId = prospectCompany.id;
      } else {
        // Can't identify company - skip this event
        console.log(`Could not identify company for distinct_id: ${distinct_id}`);
        return null;
      }
    } else {
      // Update last_seen_at
      anonymousVisitor.last_seen_at = new Date();
      await anonymousVisitor.save();
      prospectCompanyId = anonymousVisitor.prospect_company_id;
    }
  }

  // Step 3: Filter - only store high-value signals
  if (!isHighValueSignal(eventType, url)) {
    return null;
  }

  // Step 4: Create IntentSignal
  const serviceLane = extractServiceLane(url, properties);
  const topic = properties.topic || properties.title || extractDomain(url) || 'Unknown';
  const weight = properties.weight || 1;

  const signal = await IntentSignal.create({
    prospect_company_id: prospectCompanyId,
    signal_type: eventType,
    service_lane: serviceLane,
    topic,
    weight,
    occurred_at: properties.timestamp ? new Date(properties.timestamp) : new Date(),
  });

  return signal;
}

/**
 * Verify PostHog webhook signature
 */
function verifyPostHogSignature(payload, signature, secret) {
  if (!secret) {
    console.warn('PostHog webhook secret not configured');
    return true; // Allow if no secret configured (for development)
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

module.exports = {
  ingestPostHogEvent,
  verifyPostHogSignature,
  findProspectCompanyByDomain,
};
