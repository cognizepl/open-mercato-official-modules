# SPEC-010: GUS REGON Company Lookup (`@open-mercato/gus-regon`)

- **Date:** 2026-09-30
- **Status:** Implemented — Phases 1–4 done, sandbox smoke test and Playwright run passed (see Implementation Status).
- **Author:** Cognize (Open Mercato partner)
- **Numbering:** 005–009 are used on `feat/financial-pl-invoice-ux`; 010 is the next free number across all branches.
- **Related:** `financial-pl` SPEC-008 (MF *Wykaz* buyer lookup, branch `feat/financial-pl-invoice-ux`); core spec `2026-08-10-address-contact-and-tax-fields`.

## TLDR
**Key Points:**
- Package `@open-mercato/gus-regon`, module id `gus_regon`: looks Polish companies up in the GUS REGON registry (BIR1.1 API) by NIP and fills company name and registered address into CrudForms; the REGON is shown to the operator.
- Value: fast, correct onboarding of Polish suppliers and business customers — including entities outside the VAT register, which MF *Wykaz* does not cover.

**Scope (MVP):**
- Integration provider `gus_regon` with per-organization credentials (environment, secret API key, "Show on CRM company forms" switch) in **Settings → Integrations**, health check, status line on the integration page.
- Fail-open lookup route `GET /api/gus_regon/lookup` and status route `GET /api/gus_regon/status`.
- Built-in, **opt-in** card on the customers company create/edit forms (default off, effective only with an API key).
- Declarative registration (`createGusLookupWidget` + field map) so other modules attach the same card to their own CrudForms.

**Out of scope (deferred):** full BIR1 reports (legal form, PKD, local units), tax id on customer addresses, a shared "company lookup provider" contract with `financial-pl`/VIES.

**Concerns:**
- Overlap with `financial-pl` SPEC-008, which chose the key-less MF *Wykaz* and rejected GUS BIR because of the per-deployment key. This package is complementary (Problem Statement) and mirrors SPEC-008's response contract.
- BIR1 is SOAP with an escaped inner XML document — parsed in two passes with `fast-xml-parser`, covered by fixtures captured from the GUS test endpoint.

---

## Overview
Polish B2B operators identify counterparties by NIP and today type every company field by hand. GUS REGON (BIR1) is the official statistical business register and covers all registered entities. With this package an operator enters a NIP, clicks **Fetch from GUS**, reviews the filled values and saves. Nothing the operator typed is overwritten, and the form keeps working when GUS is unavailable.

Audience: B2B distributors and producers running Open Mercato for Polish counterparties (CRM, purchasing).

> **Market Reference:** wFirma, inFakt, Fakturownia and SaldeoSMART autofill contractors from NIP via MF *Wykaz* and/or GUS (see SPEC-008 market reference). **Adopted:** explicit button, fill-empty-only, fail-open, NIP validated before any upstream call. **Rejected:** automatic lookup on every NIP change (extra upstream calls, surprising overwrites).

## Problem Statement
- **Coverage gap.** MF *Wykaz podatników VAT* lists VAT taxpayers only. VAT-exempt businesses, sole traders not registered for VAT, foundations and associations are missing there but present in REGON.
- **Surface gap.** The `financial-pl` lookup is wired into its invoice editor (`BuyerFields`). Company forms in CRM, supplier forms in purchasing apps and other CrudForms have no lookup.
- **Reuse gap.** A client-app prototype (2026-09-18) proved the BIR1 flow but stored the key in environment variables and added columns to a host entity — not reusable across deployments.

## Proposed Solution
An external-extension package: an integration provider (credentials, health check), two read-only API routes, and injection widgets. No entities, no core changes.

### Design Decisions
| Decision | Rationale |
|----------|-----------|
| Standalone provider package | Independent of the unreleased `financial-pl`; the lookup is a pure function (`lookupCompanyByNip`) that can later sit behind a shared provider contract |
| Credentials via `integration.ts`, never env vars | Per-organization, encrypted at rest (tenant DEK), edited in Settings → Integrations without redeploy — same mechanism as InPost/Stripe; answers SPEC-008's "per-deployment key" objection |
| Credentials scope = `auth.orgId` | Same scope the core integration routes use, so the lookup always uses what the admin sees in Settings → Integrations |
| Public GUS test key only when `environment = test` and no key is set | Works out of the box for development; production never falls back to it |
| CRM card **opt-in** (`showOnCompanyForms`, default off) and effective only with an API key (also in Test) | Installing the package changes no form by itself; no deployment shows a dead button. The platform credentials form cannot disable one field based on another, so the rule is enforced server-side (`/status`) and explained on the integration page |
| Widgets render only when `/status` says the lookup is usable | No dead cards for organizations that have not enabled the integration |
| Fail-open `{ ok:true, company, candidates } \| { ok:false, reason }` | Same contract as SPEC-008; manual entry is never blocked |
| One 8 s deadline per BIR1 call (headers and body); logout fire-and-forget | Bounded latency (≤ ~16 s); logout never delays the answer or the platform health-check timeout |
| Widget writes into host form values (`onDataChange`), fill-empty-only | Host modules own their fields and persistence; no schema coupling |
| Declarative host registration (`createGusLookupWidget`) | Other modules attach the card with a field map — no React code, standard `widgets/injection` + `injection-table.ts` discovery |
| `fast-xml-parser` | Robust against namespaces, self-closing tags and multi-record answers; values kept as strings (leading zeros) |
| v1 uses `DaneSzukajPodmioty` only | Enough for name, REGON and address; full reports are a follow-up |

### Alternatives Considered
| Alternative | Why Rejected |
|-------------|-------------|
| Env vars (`GUS_API_KEY`) as in the prototype | Violates "secrets only via integration credentials"; per deployment instead of per organization |
| REGON/address columns on host entities | Couples the package to host modules |
| GUS fallback inside `financial-pl` | Ties CRM/purchasing forms to an e-invoicing package and an unmerged branch; still possible later via a shared contract |
| Regex XML parsing (prototype) | Fragile with repeated tags and multi-record answers |
| Card on CRM forms enabled by default | Rejected by product decision: opt-in, and never without a key |

## User Stories / Use Cases
- **A sales admin** wants to **create a company from its NIP** so that **legal name and registered address match the register** → `GET /api/gus_regon/lookup`, built-in company card (UI/UX).
- **A purchasing clerk** (host app) wants to **fill a supplier form from GUS** so that **supplier master data is correct** → `createGusLookupWidget` (UI/UX → Host forms).
- **An administrator** wants to **configure the key once per organization and decide whether CRM forms show the card** → integration credentials + `GET /api/gus_regon/status` + status line (Configuration).

## Architecture

```
CrudForm (company / host form)              Server (gus_regon routes)                 GUS BIR1.1
  └─ injection spot                         GET /api/gus_regon/status                 (test | production)
     └─ GusLookupFormWidget ── apiCall ───▶   ├─ requireAuth + gus_regon.lookup
          (hidden unless status allows)       ├─ integrationStateService.isEnabled
          └─ GusLookupPanel                   └─ integrationCredentialsService.resolve → booleans only
               └── apiCall ──────────────▶  GET /api/gus_regon/lookup?nip=
                   ◀── { ok, company } ───    ├─ NIP structure + checksum (400)
               apply / applyFieldMap          ├─ enabled? credentials (auth.orgId)
               → onDataChange(values)         └─ lookupCompanyByNip ─ Zaloguj ────────────▶
                                                                      DaneSzukajPodmioty ─▶
                                                                      Wyloguj (async) ────▶
```

| File | Responsibility |
|------|----------------|
| `lib/nip.ts` | Normalization, MF `TNrNIP` structure, mod-11 checksum (client-safe) |
| `lib/config.ts` | Endpoints, public test key, credentials → runtime config |
| `lib/client.ts` | SOAP 1.2 + WS-Addressing envelope, session id as HTTP header `sid`, one deadline per call |
| `lib/parser.ts` | MTOM envelope extraction, method results, inner `<root><dane>`, error code `4` = not found, primary record selection |
| `lib/lookup.ts` | Orchestration; never throws; logout after successful login (not awaited) |
| `lib/health.ts` + `di.ts` | `gusRegonHealthCheck` (`Zaloguj` succeeds), registered with Awilix `asValue` |
| `lib/status.ts`, `api/status/route.ts`, `components/useGusStatus.ts` | Effective availability per organization; client cache 30 s |
| `lib/mapping.ts`, `lib/visibility.ts` | Customers company form mapping (names + primary address draft) and visibility rule |
| `lib/widget-config.ts` | Declarative config, `applyFieldMap`, gating, metadata validation |
| `components/GusLookupPanel.tsx` | NIP input + button + states |
| `components/GusLookupFormWidget.tsx`, `components/createGusLookupWidget.tsx` | Generic CrudForm widget and registration factory |
| `widgets/injection/company-lookup`, `widgets/injection/integration-status`, `widgets/injection-table.ts` | Built-in widgets and spot mapping |

DI: only `gusRegonHealthCheck` is registered (Awilix `asValue`). Routes resolve the platform services `integrationStateService` and `integrationCredentialsService` from the request container.

### Commands & Events
None. The package performs no writes and emits no events; the host form persists values through its own commands.

## UMES Extension Points
| Extension point | Used for |
|-----------------|----------|
| Integration registry (`integration.ts`) | Provider `gus_regon`: credentials schema, health check service, detail-page widget spot |
| Widget injection — CrudForm spots | `crud-form:customers.customer_entity` (company create), `customers.company` (company edit, OM 0.6.x), `crud-form:customers.company` (company edit, OM ≥ 0.7) |
| Widget injection — integration detail | `integrations.detail:gus_regon` (status line) |
| API routes (module-owned) | `api/lookup/route.ts`, `api/status/route.ts` |
| Not used | Subscribers, workers, enrichers, interceptors, custom entities, custom fields, backend pages |

## Data Models
None — no entities and no migrations. `GusCompany` is a transient DTO (see API Contracts).

## API Contracts

### Company lookup
- `GET /api/gus_regon/lookup?nip=<nip>` — `requireAuth: true`, `requireFeatures: ['gus_regon.lookup']`, exports `openApi`
- Query (zod `lookupQuerySchema`): `nip` — string ≤ 32 chars; spaces, dashes and a `PL` prefix are normalized
- `200 { ok: true, company: GusCompany, candidates: GusCompany[] }`
- `200 { ok: false, reason: 'not_found' | 'unavailable' | 'not_configured' }` — fail-open (`not_configured` = integration disabled or production without key; `unavailable` also when the integration configuration cannot be read)
- `400 { error }` — missing/invalid NIP or user without an organization · `401 { error }` · `500 { error }` generic (error messages translated via `resolveTranslations`, `gus_regon.errors.*`)
- `GusCompany`: `{ nip, regon, name, street, buildingNumber, flatNumber, postalCode, city, voivodeship, county, commune, type, endDate, country: 'PL' }` — strings or `null`; `type` = BIR1 `Typ` (`P`, `F`, `LP`, `LF`)

### Status
- `GET /api/gus_regon/status` — `requireAuth: true`, `requireFeatures: ['gus_regon.lookup']`, exports `openApi`
- `200 { enabled, environment, hasApiKey, lookupAvailable, companyFormsRequested, companyFormsActive }` — booleans and the environment only, never the key
- `companyFormsActive = enabled && lookupAvailable && showOnCompanyForms && apiKey provided`
- `400` user without an organization · `401` · `500` generic

## Internationalization (i18n)
`i18n/{en,pl,de,es}.json`, 40 keys under `gus_regon.*`: API error messages, widget title/descriptions, NIP label/placeholder, action/searching, invalid NIP, not found, unavailable, not configured, found, filled, nothing to fill, ceased, address label, field names, integration status lines. All UI strings go through `useT()`.

## UI/UX
- **Built-in company card (opt-in).** Shown only when the integration is enabled, **Show on CRM company forms** is on and an API key is set. A stacked card "Fetch data from GUS REGON" above the fields: NIP input + **Fetch from GUS** (Enter triggers it).
- **States.** Invalid NIP → inline error, button disabled; searching → spinner; not found / unavailable / not configured → non-blocking `Alert`; success → "Found: {name} · REGON {regon}".
- **Fill rules.** Empty `legalName` and `displayName` are filled; on the create form, when no address exists, one primary address ("Registered office (GUS)") is added. One flash message lists the filled fields (warning variant when the entity ceased activity).
- **Shared spot.** `crud-form:customers.customer_entity` is also used by the person create page and the "add person" dialog on a company page; the card renders only on the company create route (operation `create`) or a company detail route (operation `update`) and never when person-only fields are present.
- **Integration page.** A status line explains whether the CRM card is on, or why not (switch off, API key missing, integration disabled).
- **Host forms.** A module declares `createGusLookupWidget({ id, nipField?, fields | apply, visible?, gate?, fieldLabels?, titleKey?, descriptionKey? })` in `widgets/injection/<name>/widget.ts` and maps it to its form spot in its own `widgets/injection-table.ts`. `fields` maps `name`, `nip`, `regon`, `street`, `streetLine`, `buildingNumber`, `flatNumber`, `postalCode`, `city`, `voivodeship`, `county`, `commune`, `country` onto form field ids (fill-empty-only). The factory validates the config and always requires the `gus_regon` and `integrations` modules. `GusLookupPanel` remains available for full control.
- Uses DS primitives only (`Input`, `Button`, `Label`, `Spinner`, `Alert`), semantic tokens (`text-status-error-text`), labelled controls, `apiCall`, `flash()`.

## Configuration
- Integration `gus_regon` (Settings → Integrations → GUS REGON):
  - `environment` — select `test` | `production` (Test = synthetic GUS data).
  - `apiKey` — secret; required for Production and for the CRM card; optional in Test for lookups (public GUS test key).
  - `showOnCompanyForms` — boolean, default off.
- Health check service: `gusRegonHealthCheck`.
- No environment variables. ACL: `gus_regon.lookup` (default roles superadmin, admin, employee).

## Migration & Compatibility
- Additive package: no migrations, no core changes, no renamed or removed spot/event ids, no contract changes.
- Peer range `@open-mercato/* ^0.6.0` (same as `forms`). Built and tested against the repo pins (`0.6.3-develop`); the OM ≥ 0.7 company edit spot id (`crud-form:customers.company`) is already registered, so widening the range later needs no code change.

## Implementation Plan

### Phase 1: Lookup core
1. NIP validation; credentials → config.
2. BIR1 client, two-pass parser, fail-open lookup orchestration.
3. Unit tests with fixtures captured from the GUS test endpoint.

### Phase 2: Platform wiring
1. Scaffold (`scaffold-module`): package skeleton, `index.ts`, `acl.ts`, `setup.ts`.
2. `integration.ts` (credentials, health check), `di.ts`.
3. `GET /api/gus_regon/lookup` with `openApi`; route unit tests; TC-GUS-001–003.

### Phase 3: UI
1. `GusLookupPanel`, built-in company widget, injection table, i18n.
2. Visibility rule for the shared create-form spot; unit tests.

### Phase 4: Opt-in gating and host registration
1. `showOnCompanyForms` switch, `GET /api/gus_regon/status`, `useGusStatus`, integration status line; TC-GUS-004–005.
2. `createGusLookupWidget` + `GusFieldMap`; built-in widget moved onto the factory; unit tests.

### File Manifest
| File | Action | Purpose |
|------|--------|---------|
| `packages/gus-regon/{package.json,build.mjs,watch.mjs,jest.config.cjs,tsconfig.json,README.md}` | Create | Package skeleton and docs |
| `src/index.ts`, `src/modules/gus_regon/{index,acl,setup,di,integration}.ts` | Create | Module + provider registration |
| `src/modules/gus_regon/lib/*.ts` | Create | Lookup core, status, mapping, widget config |
| `src/modules/gus_regon/data/validators.ts` | Create | zod schemas |
| `src/modules/gus_regon/api/{lookup,status}/route.ts` | Create | Routes |
| `src/modules/gus_regon/components/*` | Create | Panel, generic widget, factory, status hook |
| `src/modules/gus_regon/widgets/**` | Create | Built-in widgets + injection table |
| `src/modules/gus_regon/i18n/*.json` | Create | Translations |
| `src/modules/gus_regon/__tests__/**`, `__integration__/**` | Create | Unit + integration tests |
| `.changeset/gus-regon-initial.md` | Create | Initial release note (minor) |
| `README.md` (root), `.ai/specs/REDME.md` | Modify | Module list, spec directory |

### Testing Strategy
- **Unit (12 suites, 92 tests):** NIP structure/checksum (with an independent reference implementation), config, SOAP envelope/headers, deadline covering a stalled request and a stalled body, MTOM extraction, SOAP faults, inner-document parsing (found / not found / session error / multi-record / leading zeros), record selection, lookup orchestration (endpoints and keys per environment, logout, fail-open on every failure, key never logged), mapping, visibility, field maps and config validation, status and gating, both routes (guards, scope, fail-open incl. unreadable configuration, 500 without leaks), health check.
- **Integration (Playwright):** see Integration Coverage.

## Integration Coverage
| Path | Kind | Test |
|------|------|------|
| `GET /api/gus_regon/lookup` — 401 / 400 missing NIP / 400 bad checksum | API | TC-GUS-001 |
| Integration `gus_regon` registered with `environment` (select), `apiKey` (secret), `showOnCompanyForms` (boolean) | API | TC-GUS-002 |
| `GET /api/gus_regon/lookup` — disabled → `not_configured`; production without key → `not_configured`; rejected key → `unavailable`, key not echoed; Test → company or `unavailable` | API | TC-GUS-003 |
| `GET /api/gus_regon/status` — off by default; switch without key → off; switch + key → on; integration disabled → off; key not returned | API | TC-GUS-004 |
| `/backend/customers/companies/create` — no card with the switch off; card with switch + key; "Fetch from GUS" fills Display name / Legal name (lookup stubbed in the browser); no card on `/backend/customers/people/create` | UI | TC-GUS-005 |

All tests are self-contained: they snapshot and restore the integration state and credentials in `finally` and skip when a real API key is configured or credentials cannot be read.

## Implementation Status
| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| Phase 1 — Lookup core | Done | 2026-09-30 | Unit-tested with captured BIR1 payloads |
| Phase 2 — Platform wiring | Done | 2026-09-30 | Generator discovers module, ACL, setup, DI, integration, routes, translations |
| Phase 3 — UI | Done | 2026-09-30 | Review fixes applied (person dialog, edit spot, error states) |
| Phase 4 — Opt-in gating + host registration | Done | 2026-10-05 | Status route, switch, status line, `createGusLookupWidget` |
| Sandbox smoke test (`publish:preview` + `module add @preview`) | Done | 2026-10-05 | Installed from local Verdaccio into `apps/sandbox`; integration configured (Test + API key, switch on), company create card fetched and filled a company from the published tarball; sandbox changes reverted |
| Playwright run TC-GUS-001–005 | Done | 2026-10-05 | 7/7 passed against the local sandbox (`yarn dev`). TC-GUS-005 needs `--timeout=120000` there only because the company create page takes ~13 s to SSR in dev; the default 20 s budget applies to the CI build |
| Manual QA (sandbox) | Done | 2026-10-05 | Integration status line (off / key required / on), company create card, fill-empty-only, checksum error, no card on person forms and the add-person dialog, switch off, integration disabled |

Verification: `yarn workspace @open-mercato/gus-regon build`, `typecheck`, `test` — pass. Self-review scan (`: any`, `fetch(`, `em.find`, `alert(`, `<button`) — clean in `src/`. Integration tests use the core helpers (`@open-mercato/core/helpers/integration/{api,auth}`).

## Risks & Impact Review

### Data Integrity Failures
- The package writes nothing. An interrupted lookup leaves the form untouched; the NIP input is disabled while a lookup runs, so a stale answer cannot fill a different NIP.

### Cascading Failures & Side Effects
- GUS unavailable → `unavailable`, manual entry continues. Login and search have an 8 s deadline each (headers and body); logout is fire-and-forget. No events, subscribers or workers.

### Tenant & Data Isolation Risks
- Credentials and state are resolved per `(auth.orgId, tenantId)` through the platform services. Routes read no tenant records and return only public register data. The client status cache is per browser session and holds booleans only.

### Migration & Deployment Risks
- None: additive routes and widgets, no migrations. Deployments that install the package see no CRM change until the switch is on and a key is set.

### Operational Risks
- GUS rate limits and outages are external; failures are logged as warnings without the key. The health check on the integration page reports connectivity.

### Risk Register

#### GUS outage or slow responses
- **Scenario**: BIR1 is down or slow.
- **Severity**: Low
- **Affected area**: Lookup card only.
- **Mitigation**: Per-call deadline, fail-open `unavailable`, non-blocking alert.
- **Residual risk**: Up to ~16 s before the alert; acceptable for an explicit button.

#### Wrong record for multi-record answers
- **Scenario**: A NIP returns the entity and its local units.
- **Severity**: Low
- **Affected area**: Filled name/address.
- **Mitigation**: Entity (`P`/`F`) over local units (`LP`/`LF`), active over ceased; all candidates returned; name and REGON shown before saving.
- **Residual risk**: No picker UI in v1.

#### API key exposure
- **Scenario**: The key leaks via responses, logs or the client.
- **Severity**: High
- **Affected area**: Organization's GUS account.
- **Mitigation**: Encrypted platform credentials, server-side use only, never logged (unit tests) or returned (unit tests, TC-GUS-003/004).
- **Residual risk**: None identified.

#### Personal data of sole traders
- **Scenario**: For natural-person businesses (`Typ F`) the name is personal data.
- **Severity**: Medium
- **Affected area**: Host forms that store the filled values.
- **Mitigation**: Data comes from a public statutory register, is fetched only on an explicit operator action and is not stored by the package; persistence follows the host module's PII/encryption rules.
- **Residual risk**: Hosts must apply their own retention policy.

#### Test data used in production
- **Scenario**: An organization keeps the Test environment and fills synthetic data.
- **Severity**: Low
- **Affected area**: Filled values.
- **Mitigation**: Required environment field labelled "synthetic data"; production never uses the public test key.
- **Residual risk**: Operator error remains possible.

## Spec Checklist Coverage
| Checklist area | Answer |
|----------------|--------|
| 1. Design logic & phasing | MVP and deferred work explicit (TLDR); user stories map to API/UI/Configuration; phases incremental and tested |
| 2. Architecture & isolation | No ORM links (no entities); package placement `packages/gus-regon`; DI via Awilix (`asValue`); no events/subscribers/workers |
| 3. Data integrity & security | No writes (atomicity N/A); zod on all inputs; guards declared; secrets excluded from logs/responses/errors; XML values escaped in SOAP bodies; NIP URL-encoded; React renders text only (no raw HTML); no SQL (no queries); PII note in Risk Register |
| 4. Commands, events & naming | N/A — no mutations, commands or events. Feature `gus_regon.lookup` follows `<moduleId>.<action>`. Module id `gus_regon` is a provider name (precedent `carrier_inpost`, `financial_pl`), not a plural entity collection |
| 5. API, UI & compatibility | Contracts complete with errors; both routes export `openApi`; DS primitives + CrudForm injection; i18n for all strings; pagination N/A (single-record lookups); compatibility in Migration & Compatibility |
| 6. Performance, cache & scale | Point lookups only, no DB queries/indexes; one upstream lookup per explicit click; `/status` cached client-side 30 s (per session, booleans only, no tenant data); no server cache — low volume, freshness preferred |
| 7. Risks & anti-patterns | Concrete scenarios with severity, mitigation, residual risk; no boilerplate CRUD, no speculative phases in the MVP plan |

## Final Compliance Report — 2026-10-05

### AGENTS.md Files Reviewed
- `AGENTS.md` (root, official-modules) — Task Router rows: scaffold-module, spec-writing, implement-spec, sandbox, Verdaccio preview
- `.ai/specs/AGENTS.md`
- `.ai/skills/spec-writing/SKILL.md` (+ `references/spec-checklist.md`, `references/compliance-review.md`)
- `.ai/skills/scaffold-module/SKILL.md`
- `.ai/skills/implement-spec/SKILL.md` (+ `references/code-review-compliance.md`)
- `open-mercato/AGENTS.md` (core) — integration provider placement, secrets, design system

### Compliance Matrix

| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| root AGENTS.md | External extension via UMES; MUST NOT modify core packages | Compliant | See UMES Extension Points |
| root AGENTS.md | Validate all inputs with zod in `data/validators.ts` | Compliant | `lookupQuerySchema`; response schemas for `openApi` |
| root AGENTS.md | Filter every query by `organization_id` | N/A | No DB queries; credentials resolved per `auth.orgId` |
| root AGENTS.md | Declarative guards `requireAuth`, `requireFeatures` | Compliant | Both routes; widgets declare `features` |
| root AGENTS.md | API routes export `openApi` and `metadata` | Compliant | Both routes |
| root AGENTS.md | Write operations use the Command pattern | N/A | No writes |
| root AGENTS.md | `defaultRoleFeatures` for every feature in `acl.ts` | Compliant | `gus_regon.lookup` → superadmin, admin, employee |
| root AGENTS.md | Naming: package kebab-case, module snake_case, feature `<moduleId>.<action>`, i18n `<moduleId>.<context>.<key>` | Compliant | `gus-regon`, `gus_regon`, `gus_regon.lookup`, `gus_regon.lookup.*` |
| root AGENTS.md | API route path convention | Compliant | `api/<path>/route.ts` → `/api/gus_regon/<path>`, as used by the merged `forms` package |
| root AGENTS.md | No hardcoded strings; `useT()` / `resolveTranslations` | Compliant | 40 keys × 4 locales, incl. API errors |
| root AGENTS.md | No raw `fetch` in UI; `apiCall` | Compliant | Server-side BIR1 calls use `fetchWithTimeout` |
| root AGENTS.md | `flash()` not `alert()` | Compliant | |
| root AGENTS.md | No `any` types | Compliant | Self-review scan clean |
| root AGENTS.md | Boolean parsing via shared helpers | Compliant | `parseBooleanFromUnknown` |
| root AGENTS.md | No sensitive data in error messages; never log credentials | Compliant | Generic 500; `[internal]` details only in logs; key-leak tests |
| root AGENTS.md | No hand-written migrations | N/A | No entities |
| scaffold-module, README | Package layout, `index.ts`/`acl.ts`/`setup.ts`, README module row, no `"private": true`, exports map identical to `test-package`, stable peer ranges | Compliant | `build.mjs`/`jest.config.cjs` follow `carrier-inpost` (excludes `__integration__` from the build, `transformIgnorePatterns` for `@open-mercato`) |
| implement-spec | Unit tests per function, self-review scan, Implementation Status, build/typecheck/test, sandbox smoke test | Compliant | Verdaccio smoke test and Playwright run passed (Implementation Status) |
| .ai/specs/AGENTS.md | Required sections, risks with scenario/severity/mitigation/residual, changelog | Compliant | |
| .ai/specs/AGENTS.md | Integration coverage for all API paths and key UI paths, tests in the same change | Compliant | Integration Coverage; TC-GUS-001–005 |
| core AGENTS.md | Integration provider in a dedicated package | Compliant | `packages/gus-regon` |
| core AGENTS.md | Never commit credentials | Compliant | Only the public GUS test key (documented as public) |
| core AGENTS.md | DS: semantic tokens, labelled controls, existing primitives | Compliant | `Alert` status, `text-status-error-text`, `Label` + `Input` |

### Internal Consistency Check

| Check | Status | Notes |
|-------|--------|-------|
| Data models match API contracts | Pass | No entities; `GusCompany` matches `lib/types.ts` and `data/validators.ts` |
| API contracts match UI/UX section | Pass | Widget handles every `reason`; status fields drive gating and the status line |
| Risks cover all write operations | Pass | No writes |
| Commands defined for all mutations | Pass | No mutations |
| Cache strategy covers all read APIs | Pass | `/status` client cache 30 s; `/lookup` uncached by design |

### Non-Compliant Items
None.

### Verdict
- **Fully compliant**: Approved — ready for implementation

## Changelog
### 2026-09-30
- Skeleton spec (TLDR + Open Questions Q1–Q5) per `spec-writing`. Open Questions resolved by the requester: Q1 standalone provider package; Q2 `@open-mercato/gus-regon` / `gus_regon`, category `other`, no hub; Q3 customers company form + host mappings; Q4 `DaneSzukajPodmioty` only; Q5 `fast-xml-parser`.
- Full specification; Phases 1–3 implemented.
- Review fixes: widget hidden in person forms and the add-person dialog, OM 0.6.x edit spot `customers.company`, credentials scope `auth.orgId`, one deadline covering the response body, logout not awaited, robust panel error states, single combined flash, REGON shown, NIP structure check.

### 2026-10-05
- Phase 4: CRM card opt-in (`showOnCompanyForms`, default off, effective only with an API key), `GET /api/gus_regon/status`, integration status line, widgets hidden until the lookup is usable.
- Declarative host registration: `createGusLookupWidget` + `GusFieldMap`; built-in company widget uses the factory.
- Boolean parsing via `parseBooleanFromUnknown`; TC-GUS-004–005; Integration Coverage, UMES Extension Points, Implementation Status and checklist coverage sections.
- TC-GUS-005 uses the core `login` helper (`@open-mercato/core/helpers/integration/auth`) and locates CrudForm fields by `data-crud-field-id`.
- Local verification: manual QA, Playwright TC-GUS-001–005 (7/7) and the Verdaccio smoke test (`publish:preview` + `module add @preview`) passed; Implementation Status updated.
- Code-review fixes: TC-GUS-005 restores state in `afterEach` and waits for the person form; expected GUS outcomes logged without "failed" (sandbox dev runner flags such lines as runtime errors); deadline also covers the response body, translated API errors, fail-open on unreadable configuration, `^0.6.0` peers, version `0.0.0`, core integration-test helpers, `titleKey`/`descriptionKey`.

### Review — 2026-10-05
- **Reviewer**: Agent (independent code review + spec checklist pass)
- **Security**: Passed — key never logged/returned (tests), guards on both routes, inputs zod-validated, SOAP values XML-escaped
- **Performance**: Passed — point lookups, per-call deadline, no DB access
- **Cache**: Passed — `/status` client-only cache (30 s, booleans), no tenant data cached
- **Commands**: Passed — N/A (no mutations)
- **Risks**: Passed — PII note for sole traders added
- **Verdict**: Approved

### Review — 2026-10-05 (code-review skill)
- **Reviewer**: Agent (`code-review` + `auto-review-pr` auto-detections, CI gates)
- **CI gates**: `yarn install --immutable`, `build:packages`, `generate`, `check:dep-versions`, `i18n:check-sync:packages`, `typecheck`, `test` — pass. `i18n:check-usage:packages` and `platform:sync --check` fail on a clean `develop` as well (pre-existing; this package adds no missing keys).
- **Fixed**: body read now raced against the per-call deadline (`fetchWithTimeout` detaches the caller's signal after headers); API error messages translated (`gus_regon.errors.*`); lookup fails open when the configuration cannot be read; peer range `^0.6.0`, package version `0.0.0` + minor changeset (first release 0.1.0, matches `integration.ts`); `license` field; integration tests on core helpers without per-test timeout overrides; widget config `titleKey`/`descriptionKey`; built-in field labels referenced statically; unused `invalidateGusStatus` removed; REGON wording (shown, not filled).
- **Accepted as-is (Low)**: no outbound rate limit (point lookups behind `gus_regon.lookup`); 30 s client status cache not keyed by organization (server re-checks on lookup); status-line precedence.
- **Verdict**: Approved
