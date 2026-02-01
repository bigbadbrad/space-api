# Full Orbit “6sense-lite” ABM MVP — Final Sprint Spec (Steps 1–10)

This is the **single source-of-truth implementation spec** for Cursor. It fits the “6sense-lite MVP” into the ABM schema and endpoints you already built:

- **ProspectCompany** (accounts)
- **Contact** (people at accounts)
- **IntentSignal** (time-series “why hot”)
- **LeadRequest** (canonical QuinStreet-style reservation/procurement submission)
- Existing ABM routes: `/api/abm/lead-requests` and `/api/abm/lead-requests/:id`
- Public ingestion: `/api/hooks/lead-requests`

It defines the **next stage Cursor should implement**:
account resolution → decayed scoring → 3 dashboards → AI summaries,
and includes:
- **future Salesforce compatibility** (fields + mapping)
- the **Registry architecture (Phases A–E)** so behavior evolves without rewrites.

---

## 0) MVP Definition of “Done”
MVP is done when:

1) We can **resolve activity to an Account** (`ProspectCompany`) primarily by **normalized company domain**.
2) We can compute **Account Intent Score (0–100)** with **exponential decay** + **surge classification**.
3) We can show 3 dashboards via API endpoints:
   - **Hot Accounts**
   - **Service Lane Intent**
   - **People Inside Accounts**
4) We can generate a **premium AI Account Summary** in 1 click (cached).

**Non-goals for MVP**
- Full CRM bidirectional sync
- Real-time event streaming into DB (daily batch is enough)
- Perfect deanonymization for all traffic (forms/domains solve most of it)

---

## 1) Current Model Alignment (What We Already Have)
### Existing ABM Tables (assumed present)
- `prospect_companies` — accounts (ABM targets)
- `contacts` — people at accounts
- `intent_signals` — timeline explanation entries
- `lead_requests` — canonical form submission artifact
- (optional later) `company_domains`, `anonymous_visitors`

### Existing Flows
- LeadRequest ingestion upserts:
  - company by domain (from `organization_website` or `work_email`)
  - contact by `(prospect_company_id, email)`
  - writes intent signals
  - recomputes a simple rollup score

This MVP upgrades the rollup to:
- decayed scores (7d/30d) + normalization
- lane scoring
- surge detection
- dashboards fed from stored daily snapshots

---

## 2) Canonical Domain Normalization (Account Key)
**Account Key = normalized domain** (lowercase, strip protocol/path, strip `www.`).

### Rules
- Source preference:
  1) domain from `organization_website`
  2) fallback: email domain from `work_email`
- Personal email domains (e.g. gmail.com, yahoo.com, outlook.com, hotmail.com) **must not** be used to group to an account.
  - if domain is personal → `account_key = null` (still store LeadRequest)
- Domain is stored on `prospect_companies.domain` (unique).

Create shared helper:
- `utils/domain.js`
  - `normalizeDomainFromUrl(url)`
  - `normalizeDomainFromEmail(email)`
  - `resolveAccountKey(payload)`

**Acceptance**
- Given `https://www.AcmeSpace.com/path`, account_key == `acmespace.com`
- Given `name@gmail.com`, account_key == `null`

---

## 3) Registry-Driven Architecture (No Hardcoding)
We will build 3 registries (implemented as 4 tables):
1) **Event → lane/content mapping rules**
2) **Scoring config (versioned) + weights**
3) **Prompt templates (lane/persona/stage)**

A tiny loader layer reads registries and provides them to the scoring job + AI generator.

---

## 4) Data Model Changes (Migrations + Models)

### 4.1 Extend `prospect_companies` (scoring + Salesforce future)
Add columns:
- `intent_stage` STRING (`Cold|Warm|Hot`)
- `surge_level` STRING (`Normal|Surging|Exploding`)
- `top_lane` STRING
- `last_seen_at` DATETIME
- `score_updated_at` DATETIME
- `score_7d_raw` FLOAT (debuggable)
- `score_30d_raw` FLOAT (debuggable)

**Salesforce future fields**
- `salesforce_account_id` STRING (nullable)
- `salesforce_account_url` STRING (nullable) (optional convenience)
- `salesforce_owner_id` STRING (nullable) (optional)

### 4.2 Extend `contacts` (Salesforce future)
Add columns:
- `salesforce_lead_id` STRING (nullable)
- `salesforce_contact_id` STRING (nullable)

### 4.3 Extend `lead_requests` (Salesforce future)
Add columns:
- `salesforce_lead_id` STRING (nullable)
- `salesforce_task_id` STRING (nullable) (optional)
- `account_key` STRING (nullable) (store resolved domain for easier joins)
- `why_hot_json` JSON (optional; otherwise computed from daily snapshot)

### 4.4 New table: `daily_account_intent`
Purpose: store daily rollups for dashboards and account detail timeline.

Fields:
- `id` UUID
- `prospect_company_id` UUID FK
- `date` DATE (UTC)
- `score_config_id` UUID FK (registry)
- `raw_score_7d` FLOAT
- `raw_score_prev_7d` FLOAT
- `raw_score_30d` FLOAT
- `intent_score` INT (0–100)
- `intent_stage` STRING
- `surge_ratio` FLOAT
- `surge_level` STRING
- `unique_people_7d` INT
- `top_lane` STRING
- `lane_scores_7d_json` JSON  (lane → raw)
- `lane_scores_30d_json` JSON (lane → raw)
- `top_categories_7d_json` JSON (category → count/score)
- `top_pages_7d_json` JSON (path → count)
- `key_events_7d_json` JSON (event/category → count)
- timestamps

Constraints/Indices:
- unique (`prospect_company_id`, `date`)
- index on `date`, `intent_stage`, `top_lane`, `surge_level`

### 4.5 New table: `account_ai_summaries`
Purpose: cache “premium” AI summary.

Fields:
- `id` UUID
- `prospect_company_id` UUID FK
- `cache_date` DATE
- `top_lane` STRING
- `intent_score` INT
- `surge_level` STRING
- `prompt_template_id` UUID FK (registry)
- `input_json` JSON
- `summary_md` TEXT
- `model` STRING
- timestamps

Unique:
- (`prospect_company_id`, `cache_date`, `top_lane`)

### 4.6 Recommended new table: `contact_identities` (for People dashboard)
Fields:
- `id` UUID
- `contact_id` UUID FK
- `identity_type` STRING (`posthog_distinct_id|email|hashed_email|crm_id`)
- `identity_value` STRING
- timestamps

Unique:
- (`identity_type`, `identity_value`)

---

## 5) Registry Tables (Phases A–E)

### Registry Table 1: `abm_event_rules`
Purpose: map URL patterns (or other rules) → lane/content_type/weight override.

Fields:
- `id` UUID
- `enabled` BOOL
- `priority` INT (lower = first match)
- `event_name` STRING (e.g. `page_view`, `cta_click`, `form_*`)
- `match_type` STRING (`path_regex|path_prefix|contains|equals`)
- `match_value` STRING
- `content_type` STRING (output)
- `lane` STRING (output)
- `weight_override` INT nullable
- `score_config_id` UUID nullable (optional; can scope rules to config)
- `notes` TEXT
- timestamps

**Match behavior**
- evaluate enabled rules by ascending `priority`
- first match wins

### Registry Table 2: `abm_score_configs` + `abm_score_weights`
Purpose: versioned scoring models + weights.

`abm_score_configs` fields:
- `id` UUID
- `name` STRING (e.g. `default_v1`)
- `status` STRING (`active|draft|archived`)
- `lambda_decay` DECIMAL default `0.10`
- `normalize_k` INT default `80`
- `cold_max` INT default `34`
- `warm_max` INT default `69`
- `surge_surging_min` DECIMAL default `1.5`
- `surge_exploding_min` DECIMAL default `2.5`
- timestamps

`abm_score_weights` fields:
- `id` UUID
- `score_config_id` UUID FK
- `event_name` STRING
- `content_type` STRING nullable
- `cta_id` STRING nullable
- `weight` INT
- timestamps

### Registry Table 3: `abm_prompt_templates`
Purpose: prompt per lane + persona + stage.

Fields:
- `id` UUID
- `enabled` BOOL
- `lane` STRING (`*` allowed)
- `persona` STRING (`sales|marketing|exec|*`)
- `intent_stage` STRING (`Cold|Warm|Hot|*`)
- `version` STRING
- `system_prompt` TEXT
- `user_prompt_template` TEXT (must contain `{{JSON_HERE}}`)
- `max_words` INT default 180
- timestamps

Optional: `abm_prompt_changelog` can be deferred.

---

## 6) Scoring Engine (Exact Formula + Decay)
All scoring is done using the **active** `abm_score_configs` and `abm_score_weights`.

### 6.1 Event weights (default seed)
For `page_view` by content_type:
- pricing: 25
- request_reservation: 30
- integrations: 18
- security: 18
- case_study: 12
- service_page: 10
- directory_page: 8
- docs: 6
- blog: 3
- comparison: 15
- other: 1

For `cta_click` by `cta_id`:
- request_reservation: 25
- contact_sales: 20

For forms:
- form_started: 20
- form_submitted: 60

### 6.2 Exponential decay (exact)
`decay(age_days) = exp(-lambda_decay * age_days)`  
Default: `lambda_decay = 0.10`

Contribution per event:
`contrib = weight * decay(age_days)`

### 6.3 Windows
Compute:
- `raw_7d` (events 0–7 days, decayed)
- `raw_prev_7d` (events 7–14 days, decayed)
- `raw_30d` (events 0–30 days, decayed)
- `lane_raw_7d[lane]`, `lane_raw_30d[lane]`

### 6.4 Normalization (exact)
`intent_score = round(100 * (1 - exp(-raw_30d / normalize_k)))`  
Default: `normalize_k = 80`

### 6.5 Stage thresholds (exact)
Using config thresholds:
- Cold: `0..cold_max` (default 34)
- Warm: `cold_max+1..warm_max` (default 69)
- Hot: `>= warm_max+1` (default 70)

### 6.6 Surge (exact)
`surge_ratio = (raw_7d + 5) / (raw_prev_7d + 5)`

Classification:
- Normal: `< surge_surging_min` (default 1.5)
- Surging: `>= 1.5 and <= 2.5`
- Exploding: `> surge_exploding_min` (default 2.5)

### 6.7 Top lane
`top_lane = argmax(lane_raw_7d[lane])`  
If none, `other`.

### 6.8 “Why hot” reasons (exact)
From last 7d counts, generate up to top 3 strings:
- pricing page views
- security page views
- integrations page views
- request_reservation page views
- form_started count
- form_submitted count
- cta_click request_reservation count

Example:
`["2× Pricing", "1× Security", "1× Form Started"]`

Store in `daily_account_intent.key_events_7d_json` (and optionally in account response).

---

## 7) PostHog Aggregation Strategy (MVP Batch Job)
Use **daily batch job** at 2am UTC. Do not store raw events in MySQL.

### 7.1 Implementation approach
- Query **PostHog** API for last 30 days grouped by:
  - account group key (domain)
  - day (UTC)
  - event name
  - content_type
  - service_lane
  - unique persons (7d)

Where client props are missing, server applies `abm_event_rules` using URL/path to infer:
- `lane`
- `content_type`
- optional `weight_override`

### 7.2 Output of job
For each account_key:
- upsert `prospect_companies` by `domain`
- compute score + stage + surge + top_lane
- write/update `daily_account_intent` for today UTC
- update `prospect_companies` summary fields:
  - intent_score, intent_stage, surge_level, top_lane, last_seen_at, score_updated_at, raw debug fields

---

## 8) ABM API Endpoints (Internal)
All endpoints below are under `/api/abm` and require internal auth middleware.

### 8.1 Dashboards
#### GET `/api/abm/accounts`
Hot Accounts dashboard
Query:
- `range=7d|30d` (default 7d)
- `stage=Cold|Warm|Hot` optional
- `lane=<lane>` optional
- `surge=Normal|Surging|Exploding` optional
- `search=` optional
- `page`, `limit`

Return rows:
- account id, name, domain
- intent_score, intent_stage, surge_level, top_lane, last_seen_at
- unique_people_7d
- why_hot (top 3)
- latest lead_request id (optional)

#### GET `/api/abm/lanes`
Service Lane Intent dashboard
Query:
- `range=7d|30d`
- optional `lane=<lane>` to include top accounts list

Return:
- lane cards with:
  - hot count
  - surging count
  - exploding count
  - avg intent_score
  - trend vs prev 7d (optional; can defer)
- for selected lane: accounts table subset

#### GET `/api/abm/people`
People Inside Accounts dashboard
Query:
- `range=7d|30d`
- `account_id` optional

Return rows:
- person display (known email/name or “Anonymous”)
- account name/domain
- role/title (explicit or inferred)
- last_seen_at
- top 2 categories (7d)

MVP acceptable:
- Known people only (contacts + identities)
- Inference based on account’s top categories if person-level not available yet

### 8.2 Account detail (glue)
#### GET `/api/abm/accounts/:id`
Return:
- account header fields
- latest snapshot (`daily_account_intent`)
- lane breakdown from snapshot json
- 30d timeline (from `daily_account_intent` history)
- recent `lead_requests` for this account
- recent `intent_signals` for this account
- people list (`contacts`)
- cached AI summary if present

### 8.3 AI summary
#### POST `/api/abm/accounts/:id/ai-summary`
Generate or return cached summary.
Inputs:
- account + latest snapshot + known_people + key events

Caching rule:
- cache key: (account_id, cache_date, top_lane)
- regenerate if:
  - abs(intent_score - cached.intent_score) >= 10 OR surge_level changed OR prompt template changed

---

## 9) Lead Requests Integration (Keep What’s Working, Align It)
Your `lead_requests` already exist and are critical “high intent” signals.

### 9.1 Ensure LeadRequest stores `account_key`
On ingestion:
- resolve account_key
- store into `lead_requests.account_key`
- link to `prospect_company_id` when available

### 9.2 Ensure PostHog distinct id can attach to contact identities (recommended)
If modal can send `tracking.posthog_distinct_id`:
- upsert `contact_identities(identity_type=posthog_distinct_id)` linked to the contact

### 9.3 Keep LeadRequest lead_score (existing)
Do not remove your current `lead_score` formula. It’s useful for:
- sales prioritization within hot accounts
- converting into Salesforce Lead only above threshold later

---

## 10) Salesforce Compatibility (Future, But Designed-In)
We are not building Salesforce sync now, but we will be ready.

### 10.1 Fields to support future SFDC
Already specified in migrations:
- `prospect_companies.salesforce_account_id`
- `contacts.salesforce_lead_id`, `contacts.salesforce_contact_id`
- `lead_requests.salesforce_lead_id`, optional `salesforce_task_id`

### 10.2 Intended sync semantics (future)
- Upsert Salesforce **Account** by domain
- Create Salesforce **Lead** for qualified LeadRequests (lead_score >= threshold)
- Update Account intent fields daily (intent_score/stage/surge/top_lane)
- Create a Salesforce Task when account becomes Hot/Exploding (optional)

No changes required now beyond storing those IDs.

---

# Implementation Plan: Steps 1–10 (Cursor Sprint)
Each step must land with tests and minimal wiring; do not “half build” across steps.

## Step 1 — Add migrations for scoring fields + Salesforce IDs
Deliverables:
- migration: add columns to `prospect_companies`, `contacts`, `lead_requests`
- update Sequelize models accordingly
Acceptance:
- migrations run cleanly
- models load without errors
- existing lead_requests flow still works

## Step 2 — Add new ABM tables: daily snapshots + AI cache + identities
Deliverables:
- migrations + models:
  - `daily_account_intent`
  - `account_ai_summaries`
  - `contact_identities`
Acceptance:
- CRUD works in a quick script
- unique constraints enforced

## Step 3 — Add registry tables (Phase A)
Deliverables:
- migrations + models:
  - `abm_event_rules`
  - `abm_score_configs`
  - `abm_score_weights`
  - `abm_prompt_templates`
Acceptance:
- can seed defaults; can query active config

## Step 4 — Seed defaults (Phase A)
Deliverables:
- seed script (or migration seed step) that inserts:
  - 1 active score config `default_v1` (lambda=0.10, k=80, thresholds)
  - score weights matching MVP defaults
  - minimal event rules for your current URL patterns (services, pricing, security, integrations, request-reservation)
  - 1 default prompt template `*/*/*`
Acceptance:
- running seed twice doesn’t duplicate critical unique rows (idempotent seed)

## Step 5 — Registry loader (Phase B)
Deliverables:
- `abm/registry/index.js` loader with in-memory cache TTL (e.g. 60s):
  - `getActiveScoreConfig()`
  - `getWeightsMap(scoreConfigId)`
  - `getEventRules(scoreConfigId?)`
  - `getPromptTemplate({lane, persona, stage})`
Acceptance:
- unit-style tests or minimal script shows:
  - active config loads
  - template selection precedence works

## Step 6 — Scoring library modules (Phase C)
Deliverables:
- `abm/scoring/weights.js` (reads weights map)
- `abm/scoring/decay.js`
- `abm/scoring/normalize.js`
- `abm/scoring/stage.js`
- `abm/scoring/surge.js`
- `abm/scoring/whyHot.js`
Acceptance:
- given a synthetic set of events, produces stable output:
  - raw_30d, normalized intent_score, stage, surge, top_lane, why_hot

## Step 7 — PostHog client wrapper + batch job (Phase C)
Deliverables:
- `abm/posthog/client.js` (API wrapper)
- `abm/jobs/recomputeAccountIntent.js`:
  - pulls aggregates last 30d grouped by account_key/day/event/content_type/lane
  - applies event_rules fallback mapping
  - computes daily snapshot for today
  - upserts account summary fields
Acceptance:
- running job locally creates/updates `daily_account_intent` rows
- accounts get intent_score/stage/surge/top_lane updated
- job is safe to re-run (idempotent per date)

## Step 8 — Schedule job with BullMQ + manual trigger endpoint (Phase C)
Deliverables:
- queue + worker:
  - `queues/abmIntentQueue.js`
  - `workers/abmIntentWorker.js`
- manual endpoint:
  - `POST /api/abm/jobs/recompute-intent` (internal only)
Acceptance:
- manual call enqueues and runs
- scheduled run is configured (2am UTC)

## Step 9 — Dashboards API endpoints (Phase D)
Deliverables:
- controllers + routes:
  - `GET /api/abm/accounts`
  - `GET /api/abm/lanes`
  - `GET /api/abm/people`
  - `GET /api/abm/accounts/:id`
Acceptance:
- endpoints return data from latest `daily_account_intent` snapshots
- supports filters and pagination without N+1 queries

## Step 10 — AI summary generation + caching + registry prompts (Phase D/E)
Deliverables:
- `POST /api/abm/accounts/:id/ai-summary`
- uses prompt template registry selection:
  - lane + persona + stage precedence
- caches in `account_ai_summaries`
- regeneration rules enforced
Acceptance:
- first call generates summary and stores it
- second call returns cached
- changing score by >=10 or surge level regenerates
- prompt template changes take effect without deploy

---

# Phase E (Admin editing without deploy) — implement if time permits this sprint
Internal-only endpoints (role = internal_admin):
- `GET/POST/PATCH /api/abm/admin/event-rules`
- `GET/POST/PATCH /api/abm/admin/score-configs`
- `GET/POST/PATCH /api/abm/admin/score-weights`
- `GET/POST/PATCH /api/abm/admin/prompt-templates`

MVP acceptable alternative:
- seed + direct DB edits (but admin routes are the real “AI-built future” unlock)

---

# Notes for Cursor (guardrails)
- Do not store raw PostHog events in MySQL.
- Domain is the ABM “primary key” concept; keep normalization centralized.
- Registry loader must be used everywhere (no constants in scoring or prompts).
- Keep LeadRequest as the canonical sales artifact (do not move its fields into contacts/accounts).
- Make all jobs idempotent and safe to re-run.

---

## Appendix A — AI Summary Prompt (Default Template Seed)
**System prompt**
You are an elite B2B ABM strategist. Generate concise, actionable account summaries for sales and marketing. Be specific about why the account is hot, what they likely care about, and what to do next. Do not invent facts. If something is uncertain, label it as a hypothesis.

**User prompt template**
Create an “Account Brief” for the account in the JSON below.
Output exactly in this structure:

Why they’re hot (3 bullets) — cite observed behaviors only  
Likely buying stage — one sentence  
Primary service interest — one sentence referencing lane scores  
Recommended next action (Sales) — 3 bullets  
Recommended next action (Marketing) — 3 bullets  
Personalization angle — 2 bullets with suggested messaging themes  
Risks / unknowns — 2 bullets  

Keep it under {{MAX_WORDS}} words.  
JSON: {{JSON_HERE}}

---

## Appendix B — Registry Selection Precedence (Prompt Templates)
Select most specific enabled template by:
1) lane + persona + stage
2) lane + persona + `*`
3) lane + `*` + stage
4) `*` + persona + stage
5) `*/*/*` fallback

---

## Appendix C — Required Env Vars
- `POSTHOG_HOST`
- `POSTHOG_API_KEY` (personal or project key as needed by API endpoints used)
- `LEAD_REQUEST_SECRET` (optional but recommended)
- `REDIS_URL` (BullMQ)
- `AI_MODEL` + any existing LLM credentials already used in this API

---
