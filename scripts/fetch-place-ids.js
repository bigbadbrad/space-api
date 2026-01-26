// scripts/fetch-place-ids.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;
const ZIP = '94070';
const CATEGORY = 'car repair';
const OUTPUT_FILE = path.join(__dirname, 'car-repair-place-ids.json');
const USED_FILE = path.join(__dirname, 'used-place-ids.json');

let usedIds = new Set();
if (fs.existsSync(USED_FILE)) {
  usedIds = new Set(JSON.parse(fs.readFileSync(USED_FILE, 'utf8')));
}

let existingOutputIds = new Set();
if (fs.existsSync(OUTPUT_FILE)) {
  existingOutputIds = new Set(JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')));
}

// Merge all known IDs into one master used set
for (const id of existingOutputIds) usedIds.add(id);

async function fetchAllPlaceIds(category, zip) {
  let allNewIds = new Set();
  let nextPageToken = null;
  let page = 1;

  do {
    const base = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${category} in ${zip}`)}&key=${GOOGLE_API_KEY}`;
    const url = nextPageToken ? `${base}&pagetoken=${nextPageToken}` : base;

    if (nextPageToken) await new Promise(r => setTimeout(r, 2000));

    const { data } = await axios.get(url);
    if (!data.results) break;

    const newIds = data.results.map(p => p.place_id).filter(id => !usedIds.has(id));
    newIds.forEach(id => allNewIds.add(id));

    console.log(`📄 Page ${page++}: ${newIds.length} new IDs`);

    nextPageToken = data.next_page_token;
  } while (nextPageToken);

  return [...allNewIds];
}

(async () => {
  const newIds = await fetchAllPlaceIds(CATEGORY, ZIP);
  const combined = [...existingOutputIds, ...newIds];

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(combined, null, 2));
  console.log(`✅ Added ${newIds.length} new IDs (${combined.length} total) → ${OUTPUT_FILE}`);
})();
