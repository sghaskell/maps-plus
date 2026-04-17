# Phase 2: Maps+ JavaScript Integration + Testing — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `02-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 02-maps-plus-js-integration-testing
**Mode:** Interactive — user replied "recommended" accepting all defaults
**Areas discussed:** Interception mechanism, Proxy URL encoding, Scope of interception, Failure UX, Integration test strategy

---

## 1. Interception Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| A. `L.TileLayer.extend({ createTile })` subclass (DS-mode only) | Surgical, Leaflet-idiomatic, one boundary to maintain | ✓ |
| B. URL string rewrite at `L.tileLayer(url, opts)` call sites | Simpler diff but won't catch Leaflet-internal retries | |
| C. Monkey-patch `L.TileLayer.prototype.getTileUrl` globally | One-liner but risks leaking into Classic between viz instances | |

**User's choice:** A (recommended)
**Notes:** Matches REQ-DS-03 wording ("Intercept Leaflet's `createTile` method"). Actual implementation overrides `getTileUrl` (D-03) rather than `createTile` — same extension point, simpler override surface.

---

## 2. Proxy URL Encoding Contract

| Option | Description | Selected |
|--------|-------------|----------|
| A. Path-param `{z}/{x}/{y}` + `?url=<encoded-template>` via `SplunkVisualizationUtils` | Matches Phase 1 handler contract; respects locale / SSO / custom roots | ✓ |
| B. Hand-constructed `/en-US/splunkd/__raw/...` | Fails behind non-root mounts and non-en-US locales | |

**User's choice:** A (recommended)
**Notes:** `api/SplunkVisualizationUtils` is already AMD-imported at `src/maps-plus.js:11`, so no new dependency. Subdomain `{s}` is normalized to `"a"` client-side (D-10) to maximize memory-LRU cache-hit determinism.

---

## 3. Scope of Interception

| Option | Description | Selected |
|--------|-------------|----------|
| A. Only raster `L.tileLayer(activeTile, ...)` at line 2616 | The exact CSP bug case; matches ROADMAP raster-only scope | ✓ |
| B. Also MapLibre `L.maplibreGL({ style })` | Violates ROADMAP — vector tiles are Milestone 2 Phase 2.1 | |
| C. Also Bing `L.tileLayer.bing` | Needs separate API-key flow; not a reported CSP case | |

**User's choice:** A (recommended)
**Notes:** Vector (MapLibre) and Bing branches explicitly deferred and documented in `<deferred>`.

---

## 4. Failure UX in DS Mode

| Option | Description | Selected |
|--------|-------------|----------|
| A. Silent fallback: Leaflet default blank tiles + `console.warn` with `[maps-plus] tile proxy:` prefix | Matches Classic behaviour; Phase 1 already sanitizes error bodies | ✓ |
| B. Toast / banner on first failure | Adds DS-only UI surface; out of scope for verification-oriented phase | |
| C. Fallback to direct non-proxied fetch | Defeats CSP purpose; wasted request in DS | |

**User's choice:** A (recommended)
**Notes:** Stable prefix for log-grepping during support triage. Phase 1 emits `{"error":"<short-code>"}` bodies (T1-11-ErrorLeak closed), so logging the short-code is safe.

---

## 5. Integration Test Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| A. Manual UAT matrix only in `02-UAT.md` | Mirrors Phase 1; unavoidable for 24-dashboard regression | |
| B. Jest / Vitest unit tests only for pure helpers | Adds first JS test infrastructure but misses real-dashboard coverage | |
| C. Both — Jest for the two pure helpers + manual UAT matrix for real dashboards | Mirrors Phase 1's "test infra first" discipline (A-10 lesson) | ✓ |

**User's choice:** C (recommended)
**Notes:** Jest over Vitest because Webpack 5 + Babel 7 are already configured (`babel-jest` = zero config). Unit scope deliberately narrow: `isDashboardStudio(window)` and `buildTileProxyUrl(...)` only — everything else is manual UAT. No CI added this phase (none exists in the repo).

---

## Claude's Discretion

- Inline helpers vs. sibling module file (inline preferred to avoid new AMD dep row)
- Jest config shape (`jest.config.js` vs. inlined in `package.json`)
- Console-warning de-duplication / throttling (nice-to-have, not required)
- Exact 4–6 dashboards sampled for UAT from the 24 in `default/data/ui/views/` (must cover markers, clusters, heatmap, KML, path tracing, MapLibre)

## Deferred Ideas

- MapLibre GL JS / vector tile proxying — Milestone 2 Phase 2.1
- External KML / KMZ proxying — Milestone 2 Phase 2.2
- Bing tile layer routing — separate API-key flow, no filed CSP bug
- User-facing error toast / banner — future polish
- CI pipeline for JS tests — broader engineering-health investment (see improvement-backlog spec)
- Bundle-size / monolith split — tracked in improvement-backlog spec
- Sophisticated retry/backoff for failed proxy tiles — future performance phase
