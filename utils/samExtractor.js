/**
 * Extract structured data from SAM.gov raw_json for program detail view
 */
function extractDescription(item) {
  return item.description || item.Description || item.summary || null;
}

function extractContacts(item) {
  const contacts = [];
  const points = item.pointOfContact || item.pointOfContactList || item.pointsOfContact || [];
  if (Array.isArray(points)) {
    for (const p of points) {
      contacts.push({
        role: p.type || p.role || 'Contact',
        name: p.fullName || p.name || null,
        email: p.email || p.emailAddress || null,
        phone: p.phone || p.phoneNumber || null,
      });
    }
  } else if (points && typeof points === 'object') {
    contacts.push({
      role: points.type || 'Contact',
      name: points.fullName || points.name || null,
      email: points.email || points.emailAddress || null,
      phone: points.phone || points.phoneNumber || null,
    });
  }
  return contacts.length ? contacts : null;
}

function extractAttachments(item) {
  const attachments = [];
  const links = item.resourceLinks || item.links || item.documents || item.attachments || [];
  if (Array.isArray(links)) {
    for (const l of links) {
      const url = typeof l === 'string' ? l : (l.url || l.href || l.link);
      const title = typeof l === 'object' ? (l.title || l.name || l.description || url?.split('/').pop()) : null;
      if (url) attachments.push({ url, title: title || 'Document' });
    }
  }
  const addInfo = item.additionalInfoLink || item.additionalInfo;
  if (addInfo && typeof addInfo === 'string') attachments.push({ url: addInfo, title: 'Additional Info' });
  return attachments.length ? attachments : null;
}

function extractPlaceOfPerformance(item) {
  const pop = item.placeOfPerformance || item.placeOfPerformanceAddress || item.placeOfPerformanceCountryCode;
  if (!pop) return null;
  if (typeof pop === 'string') return { country: pop };
  return {
    street: pop.streetAddress || pop.address,
    city: pop.city,
    state: pop.state || pop.stateCode,
    country: pop.country || pop.countryCode,
    zip: pop.zip || pop.postalCode,
  };
}

/**
 * Heuristic extraction of requirements from description
 * Looks for headings like SCOPE, REQUIREMENTS, EVALUATION, SUBMISSION
 */
function extractRequirements(description) {
  if (!description || typeof description !== 'string') return null;
  const text = description.replace(/\r\n/g, '\n');
  const result = { objective: null, scope: [], deliverables: [], submission: [], evaluation: [] };

  const sections = [
    { key: 'scope', patterns: [/\bSCOPE\s*:?\s*\n([\s\S]*?)(?=\n[A-Z]{2,}\s*:?|\n\n\n|$)/i, /\bREQUIREMENTS\s*:?\s*\n([\s\S]*?)(?=\n[A-Z]{2,}\s*:?|\n\n\n|$)/i] },
    { key: 'deliverables', patterns: [/\bDELIVERABLES?\s*:?\s*\n([\s\S]*?)(?=\n[A-Z]{2,}\s*:?|\n\n\n|$)/i] },
    { key: 'submission', patterns: [/\bSUBMISSION\s*:?\s*\n([\s\S]*?)(?=\n[A-Z]{2,}\s*:?|\n\n\n|$)/i, /\bDUE\s+DATE\s*:?\s*\n([\s\S]*?)(?=\n[A-Z]{2,}\s*:?|\n\n\n|$)/i] },
    { key: 'evaluation', patterns: [/\bEVALUATION\s*:?\s*\n([\s\S]*?)(?=\n[A-Z]{2,}\s*:?|\n\n\n|$)/i] },
  ];

  for (const { key, patterns } of sections) {
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1]) {
        const content = m[1].trim();
        const bullets = content.split(/\n\s*[-*•]\s*/).map((b) => b.trim()).filter((b) => b.length > 10);
        if (bullets.length) result[key] = bullets;
        else if (content.length > 20) result[key] = [content];
        break;
      }
    }
  }

  const firstPara = text.split(/\n\n+/)[0]?.trim();
  if (firstPara && firstPara.length > 30 && firstPara.length < 500) {
    result.objective = firstPara;
  }

  return result;
}

function buildProgramViewFromRaw(program) {
  const raw = program.raw_json || {};
  const description = program.description || program.summary || extractDescription(raw);

  return {
    description,
    contacts: program.contacts_json || extractContacts(raw),
    attachments: program.attachments_json || extractAttachments(raw),
    place_of_performance: program.place_of_performance_json || extractPlaceOfPerformance(raw),
    requirements: extractRequirements(description),
  };
}

module.exports = {
  extractDescription,
  extractContacts,
  extractAttachments,
  extractPlaceOfPerformance,
  extractRequirements,
  buildProgramViewFromRaw,
};
