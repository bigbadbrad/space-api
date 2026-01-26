Project Specification: FullOrbit Space-API (ABM & Customer Platform)
1. Executive Summary
We are refactoring an existing Node.js/Express/Sequelize/MySQL backend. The goal is to separate the system into two distinct logical zones:
Internal ABM Dashboard: A "6sense-like" intelligence platform for sales to track ProspectCompany intent, utilizing PostHog events for signal capture.
Customer Control Plane: A multi-tenant SaaS portal for paying CustomerCompany users.
Key Architectural Principle:
Users are unified but scoped (Internal vs. Customer).
Companies are strictly separated (ProspectCompany vs. CustomerCompany) to prevent lifecycle pollution.
Identity is decoupled to handle multi-channel resolution (PostHog IDs, Emails, CRM IDs).
2. Database Schema (Sequelize Models)
A. Identity & Access Control
User
Purpose: Unified authentication.
Fields:
id (UUID, PK)
email (String, Unique)
password_hash (String)
name (String)
role (Enum: internal_admin, internal_sales, customer_admin, customer_member)
customer_company_id (UUID, FK -> CustomerCompany, Nullable)
last_login_at (Date)
Logic:
If customer_company_id IS NULL → User is Internal.
If customer_company_id IS SET → User is a Customer.
CustomerCompany (Tenants)
Purpose: Paying customers accessing the SaaS Control Plane.
Fields:
id (UUID, PK)
name (String)
plan_tier (String)
stripe_customer_id (String)
status (Enum: trial, active, past_due, cancelled)
created_at (Date)
B. ABM & Prospecting (Internal Only)
ProspectCompany (ABM Accounts)
Purpose: The companies we are targeting.
Fields:
id (UUID, PK)
name (String)
domain (String, Unique, Indexed)
intent_score (Integer, Default: 0, No Max Cap)
stage (Enum: new, engaged, opportunity, customer)
owner_user_id (UUID, FK -> User, Nullable)
customer_company_id (UUID, FK -> CustomerCompany, Nullable - for converted leads)
Constraints: owner_user_id must reference a user where customer_company_id is NULL.
CompanyDomain
Purpose: Aliases for prospect companies (e.g., nasa.gov, jpl.nasa.gov).
Fields:
id (UUID, PK)
prospect_company_id (UUID, FK -> ProspectCompany)
domain (String, Unique)
is_primary (Boolean)
Contact (Leads)
Purpose: People we are selling to.
Fields:
id (UUID, PK)
prospect_company_id (UUID, FK -> ProspectCompany)
email (String)
first_name (String)
last_name (String)
title (String)
status (Enum: new, engaged, qualified)
Constraints: Composite Unique Index on (prospect_company_id, email).
C. The Intelligence Layer (6sense Logic)
ContactIdentity
Purpose: Identity resolution. Links various identifiers to a single person.
Fields:
id (UUID, PK)
contact_id (UUID, FK -> Contact)
identity_type (Enum: posthog_distinct_id, email, crm_id, cookie_id)
identity_value (String, Unique per type)
AnonymousVisitor
Purpose: Tracks traffic from companies where we haven't identified the specific person yet (Deanonymization).
Fields:
id (UUID, PK)
prospect_company_id (UUID, FK -> ProspectCompany)
posthog_distinct_id (String, Unique)
ip_hash (String, SHA256 of IP+Salt)
ip_country (String)
ip_org (String - from enrichment)
last_seen_at (Date)
IntentSignal
Purpose: The raw feed of "Why is this account hot?".
Fields:
id (UUID, PK)
prospect_company_id (UUID, FK -> ProspectCompany)
signal_type (Enum: page_view, content_download, g2_review, pricing_view)
service_lane (Enum/String: Launch, Mobility, Fuel, ISAM, Return)
topic (String - e.g., "Starship Specs PDF")
weight (Integer)
occurred_at (Date)
3. Middleware & Routing Architecture
Middleware
requireInternalUser:
Verify JWT.
Check user.customer_company_id IS NULL.
requireCustomerUser:
Verify JWT.
Check user.customer_company_id IS NOT NULL.
Inject req.tenant_id = user.customer_company_id.
API Routes
Group 1: Internal ABM Dashboard (/api/abm/*)
GET /companies: List prospects (sort by intent_score).
GET /companies/:id: Detail view + aggregated signals.
POST /companies/:id/convert: Promote Prospect -> Customer.
GET /signals/feed: Global feed of intent signals.
Group 2: Customer Portal (/api/app/*)
Strict Rule: All DB queries in this group MUST filter by req.tenant_id.
GET /me: Profile.
GET /billing: Subscription info.
Group 3: System Hooks (/api/hooks/*)
POST /posthog: Public endpoint, verifies PostHog secret signature.
4. Workflows & Logic
A. PostHog Ingestion (The "Brain")
When POST /api/hooks/posthog receives an event:
Extract Data: distinct_id, ip, event_type, url.
Identity Check:
Query ContactIdentity for distinct_id.
If Found: We know the person. Log IntentSignal for their Contact -> ProspectCompany.
Deanonymization (If Identity Not Found):
Query AnonymousVisitor for distinct_id.
If New:
Hash IP.
Mock Enrichment (Reverse IP -> Domain).
Find ProspectCompany by CompanyDomain.
Create AnonymousVisitor record.
If Found: Log IntentSignal for the mapped ProspectCompany.
Filtering: Do NOT store every pageview. Only store high-value signals (Pricing, Docs, specific Service Lane pages).
B. Intent Scoring
intent_score is a calculated field, updated asynchronously.
Formula: Sum of IntentSignal.weight where occurred_at > (Now - 30 Days).
Normalization: Frontend handles 0-100 scaling. Backend stores raw integer (e.g., 450).
5. Cursor Implementation Steps
Step 1: Models
Modify User (add fields).
Create CustomerCompany, ProspectCompany, CompanyDomain, Contact, ContactIdentity, AnonymousVisitor, IntentSignal.
Define relationships (hasMany, belongsTo) in models/index.js.
Step 2: Middleware
Implement auth.middleware.js with the dual-role logic.
Step 3: Core ABM Logic
Create services/abm.service.js to handle the PostHog ingestion logic described in Section 4A.
Create services/scoring.service.js to handle intent calculation.
Step 4: Controllers
Scaffold /api/abm controllers.
Scaffold /api/app controllers (ensure tenant scoping).