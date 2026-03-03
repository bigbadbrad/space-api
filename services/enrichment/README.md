# Headless enrichment (Pursuits v2 §9)

Provider-agnostic enrichment: firmographics, contacts, email verification. Raw payloads go to `enrichment_sources.raw_json`; results are normalized into `prospect_companies` and `contacts`.

## Clay

- **Public Clay** is webhook-based: you send data to a Clay table; enrichment runs asynchronously. Not ideal for sync “real-time” flows.
- **Clay Enterprise API**: Company/people lookup by domain (and email/LinkedIn for people). Contact Clay GTM for base URL and auth. Set:
  - `CLAY_API_KEY` — Bearer token they provide
  - `CLAY_API_URL` — Base URL (e.g. `https://api.clay.com` or their Enterprise endpoint)
- **Stub**: If `CLAY_API_KEY` is unset, `ClayProvider` returns stub firmographics so the pipeline still runs; no external calls.

## Other providers

Implement `IEnrichmentProvider` (enrichCompany, optional findContacts/verifyEmail) and swap the provider in `jobs/runEnrichmentJob.js` (e.g. Apollo, People Data Labs).
