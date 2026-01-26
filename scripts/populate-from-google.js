// scripts/populate-from-google.js
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { toGoogleOpeningHours, DEFAULT_WEEKLY_TEMPLATE } = require('../utils/openingHours');

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;
const ZIP = '94070';
const CATEGORY = 'car repair';
const PRESET = 'car_repair';
const TIMEZONE = 'America/Los_Angeles';
const LIMIT = 15; // For local testing
const API_URL = 'http://localhost:3005/api/businesses'; // No auth required
const USED_PLACES_FILE = path.join(__dirname, 'used-place-ids.json');

// ─────────────────────────────────────────────────────────────
// USED PLACE IDS
// ─────────────────────────────────────────────────────────────
let usedPlaceIds = new Set();

if (fs.existsSync(USED_PLACES_FILE)) {
  usedPlaceIds = new Set(JSON.parse(fs.readFileSync(USED_PLACES_FILE, 'utf-8')));
}

function saveUsedPlaceIds() {
    fs.writeFileSync(USED_PLACES_FILE, JSON.stringify([...usedPlaceIds], null, 2));
    console.log(`📁 Saved ${usedPlaceIds.size} used place IDs to ${USED_PLACES_FILE}`);
  }


// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function cleanBusinessName(name) {
    return name
      .replace(/,\s*Inc\.?/gi, '')   // remove ", Inc." or ", Inc"
      .replace(/\s+Inc\.?/gi, '')    // remove " Inc." or " Inc"
      .replace(/,/g, '')             // remove stray commas
      .trim();
}

function extractBusinessHours(opening_hours) {
    if (
      opening_hours &&
      Array.isArray(opening_hours.periods) &&
      opening_hours.periods.every(p => p.open?.day !== undefined && p.open?.time && p.close?.time)
    ) {
      // ✔ Already Google‑formatted – return as‑is
      return {
        periods: opening_hours.periods,
        weekday_text: opening_hours.weekday_text || [],
      };
    }
  
    // ❌ Fallback to default 9‑5 template
    console.warn('⚠️  opening_hours missing/invalid – using default M‑F 9‑5');
    return toGoogleOpeningHours(DEFAULT_WEEKLY_TEMPLATE, TIMEZONE);
  }


// ─────────────────────────────────────────────────────────────
// 1. Google Places Text Search
// ─────────────────────────────────────────────────────────────
async function fetchPlaceIds(category, zip) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    `${category} in ${zip}`
  )}&key=${GOOGLE_API_KEY}`;

  const { data } = await axios.get(url);
  return data.results.slice(0, LIMIT).map(p => p.place_id);
}

// ─────────────────────────────────────────────────────────────
// 2. Fetch full place details
// ─────────────────────────────────────────────────────────────
async function fetchPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_API_KEY}`;
  const { data } = await axios.get(url);
  return data.result;
}
  

// ─────────────────────────────────────────────────────────────
// 3. Create business via your API (no auth)
// ─────────────────────────────────────────────────────────────
async function createBusiness(place) {
    const { place_id, name: rawName, formatted_phone_number } = place;
  
    if (usedPlaceIds.has(place_id)) {
      console.log(`⚠️ Already imported: ${rawName}`);
      return;
    }
  
    const name = cleanBusinessName(rawName);
    const place_details = JSON.stringify(place);
  
    const payload = {
      name,
      type: PRESET,
      phone: formatted_phone_number || '',
      preset: PRESET,
      timezone: TIMEZONE,
      place_details,
      business_hours: extractBusinessHours(place.opening_hours),
      address: '', city: '', state: '', zipcode: '', // let backend extract
    };
  
    try {
      const { data } = await axios.post(API_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      usedPlaceIds.add(place_id);
      saveUsedPlaceIds(); // 🔥 Immediately write after success
      console.log(`✅ Created: ${data.business.name} → ${data.business.slug}`);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      console.error(`❌ Error creating ${name}:`, msg);
    }
}

// ─────────────────────────────────────────────────────────────
// MAIN EXECUTION
// ─────────────────────────────────────────────────────────────
(async () => {
  try {
    const placeIds = await fetchPlaceIds(CATEGORY, ZIP);
    for (const id of placeIds) {
      const place = await fetchPlaceDetails(id);
      await createBusiness(place);
    }
  } catch (err) {
    console.error('💥 Script failed:', err.message);
  }
})();
