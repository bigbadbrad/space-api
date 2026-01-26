// scripts/import-businesses-from-json.js
//
// Simple importer that reads a JSON file and creates businesses via POST /api/businesses.
// If a record has `boarding` or `boarding_settings`, it seeds boarding settings with
// { business_id, capacity, nightly_price_cents } via POST /api/boarding/settings.
//
// Accepts either:
//   A) { meta: {...}, businesses: [ ... ] }
//   B) [ ... ]  (just an array of businesses)
//
// Extras: --dry-run, --delay, --concurrency, --stop-on-error, --skip-existing, --timeout

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3005';
const AUTH_BEARER = process.env.AUTH_BEARER || '';

/* --------------- CLI --------------- */
const args = process.argv.slice(2);
const fileArg = args.find(a => !a.startsWith('--'));
if (!fileArg) {
  console.error('❌ Missing JSON file path.\nExample: node scripts/import-businesses-from-json.js data/groomers.json');
  process.exit(1);
}
const flag = (k, fb = null) => {
  const m = args.find(a => a.startsWith(`--${k}=`));
  return m ? m.split('=').slice(1).join('=') : fb;
};
const has = k => args.includes(`--${k}`);

const DRY_RUN       = has('dry-run');
const STOP_ON_ERROR = has('stop-on-error');
const SKIP_EXISTING = has('skip-existing');
const DELAY_MS      = Math.max(0, parseInt(flag('delay', '200'), 10) || 0);
const CONCURRENCY   = Math.max(1, parseInt(flag('concurrency', '1'), 10) || 1);
const TIMEOUT_MS    = Math.max(1000, parseInt(flag('timeout', '15000'), 10) || 15000);

/* --------------- Helpers --------------- */
const sleep = ms => new Promise(res => setTimeout(res, ms));
function absPath(p) { return path.isAbsolute(p) ? p : path.join(process.cwd(), p); }
function loadJson(p) {
  const full = absPath(p);
  if (!fs.existsSync(full)) throw new Error(`File not found: ${full}`);
  const raw = fs.readFileSync(full, 'utf8').trim();
  if (!raw) throw new Error('Input file is empty.');
  return JSON.parse(raw);
}
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/'s\b/g, '')
    .replace(/'/g, '')
    .replace(/\s*-\s*[^\s-]+.*$/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function toZoneSlug(val) {
  if (val == null) return undefined;
  return String(val).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function toJsonStringIfObject(val) {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}
async function checkSlugAvailable({ slug, area_code, headers }) {
  if (!slug || !area_code) return true;
  try {
    const { data } = await axios.get(`${API_URL}/api/businesses/check-slug`, {
      params: { slug, area_code },
      headers,
      timeout: TIMEOUT_MS
    });
    return !!data?.available;
  } catch {
    return true;
  }
}

function autoPackWebsitePreset(rec) {
  const fields = ['headline', 'subheadline', 'description', 'hero_image', 'theme', 'button_color'];
  const any = fields.some(k => rec[k] != null);
  if (!any) return { packed: false, preset: undefined };
  const preset = {};
  for (const k of fields) if (rec[k] != null) preset[k] = rec[k];
  return { packed: true, preset };
}

function buildBusinessPayload(rec, defaults) {
  const name = (rec.name || '').trim();
  const type = (rec.type || defaults.type || '').trim();
  if (!name || !type) return { skip: true, reason: "Missing required 'name' or 'type'." };

  const payload = {
    name,
    type,
    preset: rec.preset || defaults.preset || 'other',
    area_code: rec.area_code || defaults.area_code,
    timezone: rec.timezone || defaults.timezone,
    phone: rec.phone,
    address: rec.address,
    city: rec.city,
    state: rec.state,
    zipcode: rec.zipcode,
    zone: toZoneSlug(rec.zone),
    google_status: rec.google_status,
    google_formatted_address: rec.google_formatted_address,
    google_weekday_text: rec.google_weekday_text,
    business_hours: rec.business_hours,
    place_details: toJsonStringIfObject(rec.place_details),
  };

  let websitePreset = rec.website_preset;
  let websiteOverrides = rec.website_overrides;
  const { packed, preset } = autoPackWebsitePreset(rec);
  if (!websitePreset && packed) websitePreset = preset;

  if (websitePreset) payload.website_preset = toJsonStringIfObject(websitePreset);
  if (websiteOverrides) payload.website_overrides = toJsonStringIfObject(websiteOverrides);

  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
  return { skip: false, payload };
}

function pickBoarding(rec) {
  return rec?.boarding_settings || rec?.boarding || null;
}
const toInt = v => (v == null ? undefined : Math.max(0, parseInt(v, 10) || 0));

/* --------------- Main --------------- */
(async () => {
  try {
    const input = loadJson(fileArg);
    const list  = Array.isArray(input) ? input : (Array.isArray(input.businesses) ? input.businesses : []);
    const meta  = (!Array.isArray(input) && input.meta) ? input.meta : {};

    if (!Array.isArray(list) || list.length === 0) {
      console.error('❌ No businesses found in the input file.');
      process.exit(1);
    }

    const defaults = {
      area_code: meta.area_code_default || undefined,
      timezone:  meta.timezone_default  || undefined,
      preset:    meta.preset_default    || 'other',
      type:      meta.type_default      || undefined
    };

    const headers = { 'Content-Type': 'application/json' };
    if (AUTH_BEARER) headers.Authorization = `Bearer ${AUTH_BEARER}`;

    console.log(`🚀 Importing ${list.length} businesses from ${fileArg}`);
    console.log(`→ API: ${API_URL}`);
    if (AUTH_BEARER) console.log('→ Using Authorization: Bearer ***');
    console.log(`→ Options: dryRun=${DRY_RUN} concurrency=${CONCURRENCY} delay=${DELAY_MS}ms stopOnError=${STOP_ON_ERROR} skipExisting=${SKIP_EXISTING} timeout=${TIMEOUT_MS}ms`);

    let created = 0, seeded = 0, skipped = 0, failed = 0;

    let idx = 0;
    async function worker() {
      while (idx < list.length) {
        const i = idx++;
        const rec = list[i];

        // Build business payload
        let built;
        try { built = buildBusinessPayload(rec, defaults); }
        catch (e) {
          console.error(`❌ [${i + 1}/${list.length}] Bad record: ${e.message}`);
          failed++; if (STOP_ON_ERROR) process.exit(1);
          continue;
        }
        if (built.skip) {
          console.warn(`⚠️  [${i + 1}/${list.length}] ${rec?.name || '(no name)'} — ${built.reason}`);
          skipped++; continue;
        }

        const slug = slugify(built.payload.name);

        // Optional skip-existing
        if (SKIP_EXISTING && built.payload.area_code) {
          const available = await checkSlugAvailable({ slug, area_code: built.payload.area_code, headers });
          if (!available) {
            console.log(`⏭️  [${i + 1}/${list.length}] ${built.payload.name} — slug '${slug}' already in use, skipping.`);
            skipped++; continue;
          }
        }

        // Create business
        console.log(`\n[${i + 1}/${list.length}] ${built.payload.name}`);
        let bizId = null;
        if (DRY_RUN) {
          console.log('📤 (dry-run) Business payload:', JSON.stringify(built.payload, null, 2));
        } else {
          try {
            const { data } = await axios.post(`${API_URL}/api/businesses`, built.payload, { headers, timeout: TIMEOUT_MS });
            const biz = data?.business || data;
            bizId = biz?.id;
            console.log(`✅ Created → slug: ${biz?.slug || '(unknown)'}`);
            created++;
          } catch (err) {
            failed++;
            const status = err.response?.status;
            const body = err.response?.data || err.message;
            console.error(`❌ Failed (status ${status || 'n/a'})`);
            if (typeof body === 'object') console.error(JSON.stringify(body, null, 2));
            else console.error(String(body));
            if (STOP_ON_ERROR) process.exit(1);
            if (DELAY_MS) await sleep(DELAY_MS);
            continue;
          }
        }

        // Seed boarding settings (only capacity + nightly_price_cents)
        const boarding = pickBoarding(rec);
        if (boarding && !DRY_RUN && bizId) {
          const capacity = toInt(boarding.capacity);
          const nightly_price_cents = toInt(boarding.nightly_price_cents);
          const payload = {
            business_id: bizId,
            ...(capacity !== undefined ? { capacity } : {}),
            ...(nightly_price_cents !== undefined ? { nightly_price_cents } : {}),
          };

          try {
            await axios.post(`${API_URL}/api/boarding/settings`, payload, { headers, timeout: TIMEOUT_MS });
            const { data: readBack } = await axios.get(`${API_URL}/api/boarding/settings`, {
              params: { business_id: bizId }, headers, timeout: TIMEOUT_MS
            });
            console.log(`   ↳ 🟢 Seeded boarding (cap=${readBack.capacity}, rate=$${(readBack.nightly_price_cents/100).toFixed(2)})`);
            seeded++;
          } catch (e) {
            failed++;
            const status = e.response?.status;
            const body = e.response?.data || e.message;
            console.error(`   ↳ ❌ Failed to seed boarding (status ${status || 'n/a'})`);
            if (typeof body === 'object') console.error(JSON.stringify(body, null, 2));
            else console.error(String(body));
            if (STOP_ON_ERROR) process.exit(1);
          }
        } else if (boarding && DRY_RUN) {
          console.log('   ↳ (dry-run) boarding payload:', boarding);
        }

        if (DELAY_MS) await sleep(DELAY_MS);
      }
    }

    const workers = [];
    for (let w = 0; w < CONCURRENCY; w++) workers.push(worker());
    await Promise.all(workers);

    console.log('\n— Import Summary —');
    console.log(`   Created: ${created}`);
    console.log(`   Seeded boarding: ${seeded}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Failed : ${failed}`);
    console.log('Done.');
  } catch (e) {
    console.error('💥 Importer crashed:', e.message || e);
    process.exit(1);
  }
})();
