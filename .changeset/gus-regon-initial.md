---
"@open-mercato/gus-regon": minor
---

Add `@open-mercato/gus-regon` — GUS REGON (BIR1.1) company lookup for Open Mercato.

Autofills the company name and registered address by NIP on the customers company forms (opt-in switch, effective only with an API key), with per-organization credentials in Settings → Integrations, a health check, a status endpoint, a fail-open `GET /api/gus_regon/lookup` route, declarative `createGusLookupWidget` registration for other forms, and integration tests (TC-GUS-001–005).
