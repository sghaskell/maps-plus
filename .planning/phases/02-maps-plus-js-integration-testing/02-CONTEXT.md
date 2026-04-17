# Phase 2: Maps+ JavaScript Integration + Testing — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Mode:** Interactive — recommended-defaults accepted for 5 gray areas

<domain>
## Phase Boundary

Wire the Maps+ JavaScript client (`src/maps-plus.js`) to detect Dashboard
Studio at runtime and route Leaflet raster tile requests through the Phase 1
REST proxy endpoint (`/servicesNS/-/leaflet_maps_app/maps_plus/tile_proxy/{z}/{x}/{y}`),
rebuild `visualization.js`, and verify end-to-end across every OOTB raster tile
provider and the 24 example dashboards — with zero behavioural change when
Maps+ runs in Classic Splunk.

**In scope:**
- DS runtime detection via `window.__SPLUNK_DASHBOARD_STUDIO__` (REQ-DS-01)
- Leaflet `createTile` interception via an `L.TileLayer.extend(...)` subclass,
  activated only when `_isDashboardStudio === true` (REQ-DS-03)
- URL construction for the Phase 1 proxy endpoint using
  `api/SplunkVisualizationUtils` / `splunkjs/mvc/utils` so the client honours
  Splunk locale prefixes, SSO gateways, and custom root paths
- Webpack 5 rebuild of `visualization.js` with integrity verification
- Manual UAT matrix covering all OOTB raster providers × (Classic, DS) ×
  a representative sample of the 24 example dashboards
- Minimal Jest/Vitest unit-test harness for the two pure helpers introduced
  in this phase (DS-detection predicate + proxy-URL builder)

**Out of scope (deferred):**
- MapLibre GL JS vector tile / style-JSON proxying — Milestone 2, Phase 2.1
- External KML / KMZ AJAX proxying — Milestone 2, Phase 2.2
- Bing tile layer (`L.tileLayer.bing`) — requires its own API-key flow; not a
  `blocked:csp` case in the filed bug
- Any change to Classic Splunk dashboards (must be byte-for-byte identical)
- User-facing error UI (toast/banner) — console logging only this phase
- Google Street View sub-plugin (separate Webpack, separate codebase)

</domain>

<decisions>
## Implementation Decisions

### Interception Mechanism (Gray Area 1)
- **D-01:** Raster tile interception is implemented via a subclass
  `L.TileLayer.extend({ createTile, getTileUrl })` (working name:
  `L.TileLayer.MapsPlusProxied`). The subclass is instantiated in place of
  `L.tileLayer(...)` **only** when `this._isDashboardStudio === true`.
  Classic Splunk continues to call `L.tileLayer(this.activeTile, this.tileOptions)`
  untouched. Rationale: matches REQ-DS-03 ("Intercept Leaflet's `createTile`
  method"), keeps DS code behind a clean boundary, and lets Leaflet's internal
  retry/error paths flow through the same transform.
- **D-02:** Do NOT monkey-patch `L.TileLayer.prototype.getTileUrl`. Per-viz-
  instance state can leak across dashboards that mount/unmount Maps+ (DS
  multi-panel layouts), so the prototype must stay untouched.
- **D-03:** The subclass overrides `getTileUrl(coords)` to produce the proxy
  URL. `createTile` itself stays at Leaflet's default (which calls
  `getTileUrl`) — we avoid re-implementing image element creation.

### DS Detection (Gray Area 2 — pre-decided by REQ-DS-01)
- **D-04:** Detection happens once, during
  `SplunkVisualizationBase.prototype.initialize` (or the earliest viz lifecycle
  hook that runs before the first `updateView`). Cached on `this._isDashboardStudio`.
  Rationale: avoids re-checking `window.__SPLUNK_DASHBOARD_STUDIO__` on every
  tile fetch; detection is a pointer read at viz construction.
- **D-05:** Detection is a **truthy check** on `window.__SPLUNK_DASHBOARD_STUDIO__`,
  NOT `=== true`. Splunk has historically used both boolean-true and
  object-with-metadata for this flag across DS releases; truthy covers both.
- **D-06:** If `window` is undefined (defensive — e.g., unit-test environment),
  `_isDashboardStudio` is `false`. No exceptions propagate to the viz init path.

### Proxy URL Construction (Gray Area 2)
- **D-07 [ERRATA 2026-04-17 per 02-RESEARCH §1]:** URL shape is **query-param**,
  not path-param. The Phase 1 handler (`bin/tile_proxy.py:776-789`,
  `default/restmap.conf:13-14`) exposes the route as `.../maps_plus/tile/proxy`
  and reads `z`, `x`, `y` from the **query string** — not the URL path.
  The client must build:
  `{splunk_rest_root}/maps_plus/tile/proxy?url=<encoded-template>&z=<z>&x=<x>&y=<y>[&s=<s>][&r=<r>]`.
  The `{splunk_rest_root}` prefix (including `servicesNS/{owner}/{app}` shape)
  must be resolved via the Splunk URL builder (see D-08) and VERIFIED in the
  running Splunk UAT environment — do not hand-construct. Phase 1 UAT
  confirmed working examples at `https://localhost:8089/services/maps_plus/tile/proxy?url=...&z=0&x=0&y=0`
  (`01-UAT.md:33,108`). Server-side allowlist / SSRF validation is already in
  place (Phase 1, T1-01-SSRF closed).
- **D-08:** The `{splunk_root}` prefix is resolved via
  `api/SplunkVisualizationUtils` or `splunkjs/mvc/utils` (already an AMD
  dependency: line 11 `'api/SplunkVisualizationUtils'`). This honours
  locale prefixes (`/en-US/`), SSO gateways, and non-root Splunk mounts.
  Never hand-construct `/en-US/splunkd/__raw/...`.
- **D-09 [ERRATA 2026-04-17 per 02-RESEARCH §10]:** The upstream template
  passed to `url=` is NOT fully verbatim — it must be **pre-merged** with
  Leaflet's per-layer options (`L.Util.template`-equivalent merge) for any
  tokens beyond `{z}, {x}, {y}, {s}, {r}`. The Phase 1 server
  (`bin/tile_proxy.py:_resolve_tile` lines 291-316) only substitutes those
  five tokens. Leaflet's default `getTileUrl` merges `this.options` (e.g.
  `gibsLayerId`, `gibsTime`, `gibsFormat`, `gibsTileMatrixSet`) before
  substitution at `node_modules/leaflet/src/layer/tile/TileLayer.js:196`.
  Therefore the client's `buildTileProxyUrl` must first call
  `L.Util.template(rawTemplate, layerOptions)` (or an equivalent pre-merge)
  to resolve every non-{z,x,y,s,r} token, THEN pass the result as `url=`.
  Esri's `{y}/{x}` template-ordering and preserved `{s}/{r}` behaviour are
  unchanged (Phase 1 A-07: no client-side x/y swap).
- **D-10:** Subdomain-sharded templates (`{s}`): the client substitutes `{s}`
  to `a` before handing to the server, matching Phase 1 D-09 default. (Server
  also substitutes, but client-side normalization means the resolved URL
  cache key is deterministic per tile coord, maximizing memory-LRU hit rate.)

### Scope of Interception (Gray Area 3)
- **D-11:** Only the main basemap path at `src/maps-plus.js:2616`
  (`this.tileLayer = L.tileLayer(this.activeTile, this.tileOptions)`) is
  routed through the proxied subclass. This is the exact site of the filed
  `blocked:csp` bug.
- **D-12:** `L.maplibreGL({ style: styleUrl })` (lines 466, 2572) is **NOT**
  intercepted in Phase 2. Vector / style-JSON proxying is Milestone 2
  Phase 2.1 and uses a fundamentally different fetch model.
- **D-13:** `L.tileLayer.bing(...)` (lines 2588, 2600) is **NOT** intercepted.
  Bing's plugin constructs URLs internally after an API-key flow; it's also
  not a CSP case reported against DS. Documented as deferred.
- **D-14:** `L.tileLayer.setUrl(...)` calls on an already-attached proxied
  layer (lines 437/443/445) must still route through the subclass. The
  subclass's `getTileUrl` is consulted by Leaflet on next tile draw, so the
  setUrl path works automatically — no additional hook needed.

### Failure UX (Gray Area 4)
- **D-15:** Proxy failures (4xx/5xx) in DS mode surface as:
  (a) Leaflet's default blank-tile placeholder (same as any failed tile
  fetch in Classic), and (b) a single `console.warn` per failed URL with
  the stable prefix `[maps-plus] tile proxy:` followed by the HTTP status
  and short-code error body emitted by Phase 1 (`{"error":"<short-code>"}`).
- **D-16:** No user-visible toast, banner, or modal. Rationale: adding a
  DS-only UI surface is out of Phase 2's verification-oriented scope, and
  Phase 1 already sanitizes error responses (T1-11-ErrorLeak closed).
- **D-17:** No client-side fallback to direct (non-proxied) fetch on
  failure. A direct fetch in DS will be blocked by CSP anyway — attempting
  it wastes a request and creates confusing mixed states.

### Integration Test Strategy (Gray Area 5)
- **D-18:** Introduce a minimal Jest harness (preferred over Vitest —
  Webpack 5 + Babel 7 already in place makes Jest zero-config via
  `babel-jest`; no ESM wrangling). Test files under
  `appserver/static/visualizations/maps-plus/tests/` to mirror the Python
  `tests/` convention at repo root.
- **D-19:** Unit test scope is intentionally narrow — the two pure helpers
  introduced in this phase:
  1. `isDashboardStudio(window)` — returns boolean, no side effects
  2. `buildTileProxyUrl(template, z, x, y, splunkRoot)` — returns string
  Every other behaviour (Leaflet subclass wiring, `SplunkVisualizationUtils`
  interaction, end-to-end map rendering) is covered by manual UAT.
- **D-20:** `package.json` gains a `"test": "jest"` script. `npm test` runs
  the new harness. No CI required this phase (none exists in repo) — local
  run before merge is sufficient.
- **D-21:** Manual UAT matrix captured in `02-UAT.md`, structured like
  Phase 1's `01-UAT.md`:
  - Axis 1: Provider (OSM, CartoDB Light, CartoDB Dark, Esri World Imagery,
    HOTOSM, OpenTopoMap, GBIF Geyser, GBIF OSMBright, NASA GIBS, custom
    HTTPS override)
  - Axis 2: Runtime (Classic Splunk, Dashboard Studio)
  - Axis 3: Representative sample of example dashboards (recommend 4–6
    picked from the 24 in `default/data/ui/views/` to cover markers,
    clusters, heatmap, KML, path tracing, MapLibre)
  - Pass criteria: (a) no `blocked:csp` in DevTools, (b) no CORS errors,
    (c) tiles render at zoom levels 0 → 18, (d) pan/zoom triggers proxy
    hits with 200 responses, (e) Classic mode Network panel shows direct
    tile CDN requests (NOT proxy).

### Rebuild Verification
- **D-22:** After source changes, `npm run build` must produce a new
  `visualization.js` and the file is re-committed (per CLAUDE.md:
  "visualization.js bundle ... committed to the repo — rebuild it whenever
  `src/maps-plus.js` changes"). Integrity check: `tar -tzf` of a fresh
  release package confirms the new bundle is shipped.
- **D-23:** Bundle-size regression budget: the Phase 2 diff is expected to
  add <5 KB minified (one small subclass + two helpers + detection). Flag
  in plan if diff exceeds this — likely indicates unintended dependency.

### Claude's Discretion
- Exact name and file layout for the two helpers (inline in `maps-plus.js`
  vs. a small sibling module) — either works; preferred is inline to
  avoid a new AMD dep line unless the planner has a strong case otherwise.
- Jest config shape (`jest.config.js` vs. `package.json`-inline).
- Console warning throttling (e.g., de-dupe identical failed URLs within
  a session) — nice-to-have, not required.
- Exact sample of 4–6 example dashboards picked for UAT (must cover the
  feature axes called out in D-21).

### Folded Todos
_No pending todos matched Phase 2 scope. Backlog design spec
`docs/superpowers/specs/2026-04-14-improvement-backlog-design.md` covers
unrelated improvement categories (dependency pinning, bundle split,
monolith modularization) and is out-of-scope._

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before
planning or implementing Phase 2.**

### Project & Requirements
- `.planning/PROJECT.md` — REQ-DS-01 (detect DS via
  `window.__SPLUNK_DASHBOARD_STUDIO__`), REQ-DS-03 (intercept `createTile`),
  REQ-DS-05 (full OOTB provider list), Key Decisions (raster-only scope,
  runtime detection vs config toggle)
- `.planning/REQUIREMENTS.md` — DS-JS-01..DS-JS-04 (the four JS integration
  requirements), Phase 1 Out of Scope rows (confirm what stays deferred)
- `.planning/ROADMAP.md` — Phase 2 plan outline (2.1 detection + tile
  intercept, 2.2 rebuild + integration testing), Milestone 2 boundary

### Phase 1 Prior Work (read first — server contract is fixed)
- `.planning/phases/01-rest-proxy-backend-routing/01-CONTEXT.md` — all
  Phase 1 decisions; especially D-09 (https-only), D-15/D-16 (response
  headers the client will receive), A-07 (no `{x}`/`{y}` swap server-side)
- `.planning/phases/01-rest-proxy-backend-routing/01-SECURITY.md` — trust
  boundaries (Browser → Splunkweb → splunkd → upstream), confirms the
  endpoint path `/servicesNS/.../maps_plus/tile_proxy/{z}/{x}/{y}` and
  `requireAuthentication = true`
- `.planning/phases/01-rest-proxy-backend-routing/01-UAT.md` — format to
  mirror for this phase's UAT
- `bin/tile_proxy.py` — the actual handler; especially `_resolve_tile` and
  the `url=` query-param contract
- `default/restmap.conf` — confirms the final route name and auth posture
- `default/settings.json` — confirms the `enabled` flag the client must
  gracefully survive (503 response → log and fall through to blank tiles)

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — AMD/RequireJS bundle layout,
  Splunk Web integration
- `.planning/codebase/STACK.md` — Webpack 5 + Babel 7 build chain
- `.planning/codebase/CONVENTIONS.md` — JS style (since this is a JS-heavy
  phase, unlike Phase 1)
- `.planning/codebase/TESTING.md` — current test posture (Phase 1 introduced
  Python `unittest`; Phase 2 introduces Jest)
- `.planning/codebase/INTEGRATIONS.md` — Splunk Web / `SplunkVisualizationBase`
  lifecycle

### Source Code to Read Before Implementing
- `appserver/static/visualizations/maps-plus/src/maps-plus.js` §1–60 —
  AMD define list; confirms `api/SplunkVisualizationUtils` is already a
  dependency (line 11)
- `appserver/static/visualizations/maps-plus/src/maps-plus.js` §430–470 —
  `setUrl` call sites (D-14 applies)
- `appserver/static/visualizations/maps-plus/src/maps-plus.js` §2560–2620 —
  the tile-layer construction block; line 2616 is the exact mutation point
- `appserver/static/visualizations/maps-plus/src/maps-plus.js` §250–275 —
  the `initialize` / lifecycle entry where DS detection runs (D-04)
- `appserver/static/visualizations/maps-plus/package.json` — add `jest` +
  `babel-jest` to devDependencies and `"test": "jest"` to scripts
- `appserver/static/visualizations/maps-plus/webpack.config.js` — confirm
  rebuild path; no webpack change expected this phase

### Build & Deploy
- `appserver/static/visualizations/maps-plus/scripts/deploy.sh` — deploy to
  running Splunk container for UAT
- `build_release.sh` — release packaging (no change expected; Phase 1
  already added `bin/` and `default/restmap.conf` to the archive)
- `CLAUDE.md` — "visualization.js ... rebuild it whenever src/maps-plus.js
  changes" rule (D-22)

### Splunk Platform Reference (external — fetch via Context7 or Splunk docs)
- `SplunkVisualizationUtils` API — preferred helper for building Splunk
  app-scoped URLs from inside a custom viz
- `splunkjs/mvc/utils.make_url` (or equivalent) — fallback if
  `SplunkVisualizationUtils` does not expose a URL builder
- Dashboard Studio runtime flag conventions — confirm
  `window.__SPLUNK_DASHBOARD_STUDIO__` shape across Splunk 9.0+ minor
  releases (truthy-check rationale, D-05)
- Leaflet `L.TileLayer` subclass docs — `createTile` and `getTileUrl`
  extension points

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`api/SplunkVisualizationUtils`** — already imported at
  `src/maps-plus.js:11`, bound to `SplunkVisualizationUtils` at line 55.
  Use its URL helpers (or `splunkjs/mvc/utils`) for proxy URL construction
  so we pick up Splunk's root prefix, locale path, and SSO gateway
  handling for free.
- **Webpack 5 + Babel 7 build pipeline** (per CLAUDE.md) — mature and fast;
  `npm run build` / `npm run watch` both already in place. Jest slots in
  cleanly via `babel-jest` since Babel is already configured.
- **Phase 1 UAT format** (`01-UAT.md`) — copy the table structure for
  Phase 2's manual test matrix; keep reviewers on a consistent pattern.

### Established Patterns
- **All tile layer construction funnels through one block** (`src/maps-plus.js`
  ~§2560–2620). This is the single surgical point for D-11's interception.
  Vector (MapLibre) and Bing branches are cleanly separated by conditionals,
  so carving out only the raster `L.tileLayer(...)` path is low-risk.
- **`this.isArgTrue(...)` style** for boolean feature flags — reuse this
  idiom when adding the DS-detection conditional rather than inventing a
  new pattern.
- **AMD `define([...], function(...) { ... })` module boundary** — new
  dependencies must be listed in both the `define` array and the function
  signature. If helpers live inline, no new entry is needed (D-18 discretion).

### Integration Points
- **`SplunkVisualizationBase.prototype.initialize`** (§260) — earliest
  lifecycle hook Maps+ uses; DS detection goes here (D-04).
- **Tile construction block** (§2616) — only code path that needs a
  DS-mode conditional; swap `L.tileLayer(activeTile, opts)` for the
  proxied subclass when `_isDashboardStudio`.
- **`this.tileLayer.setUrl(...)`** (§437, §443, §445, §2955) — these
  continue to work transparently because the subclass overrides
  `getTileUrl`, which Leaflet re-reads on redraw (D-14).
- **`visualization.js` (committed bundle)** — must be rebuilt and
  re-committed; release packaging already includes it.

### Creative Constraints
- **No new runtime deps in the Webpack bundle** — Leaflet + underscore
  + jQuery already give everything the subclass needs. Any new
  `dependencies` entry in `package.json` must be justified.
- **Jest is a `devDependency` only** — never enters the AMD bundle.
- **Classic Splunk path must be byte-identical** — the DS-mode branch
  is strictly additive. The recommended review heuristic: a diff line
  outside an `if (this._isDashboardStudio)` block (other than adding
  the one-time detection assignment and the new subclass definition)
  deserves scrutiny.
- **No TypeScript / ES2022+ features in source** that Babel 7's current
  preset does not already handle — stay consistent with the surrounding
  ES5/ES6 style of `maps-plus.js`.

</code_context>

<specifics>
## Specific Ideas

- **Start from the failing case.** The fastest feedback loop is: open a
  DS dashboard with an OSM-backed Maps+ panel, confirm `blocked:csp`
  in DevTools, then implement until that single case shows the proxy
  request succeeding. Every other provider follows by changing the URL
  template.
- **Copy Phase 1's UAT discipline.** `01-UAT.md` is an 8-row table with
  clear pass/fail. Phase 2's matrix is larger (provider × runtime × dashboard
  sample) but the structure should mirror it so reviewers can scan quickly.
- **Treat the subclass as throw-away-if-needed.** If during planning the
  researcher identifies a cleaner Leaflet extension hook (e.g. a plugin
  with a fetch-transform slot), the subclass approach is a 30-line
  replacement — D-01 is the recommended default, not a hard lock.
- **Regression-check the 24 dashboards.** Even though most are identical
  from a tile-layer perspective, running each in Classic mode post-build
  is the cheapest way to catch an accidental leak of DS code into the
  Classic path. Scripted with `scripts/deploy.sh` + manual dashboard
  browsing.

</specifics>

<deferred>
## Deferred Ideas

- **MapLibre GL JS / vector tile proxying** — ROADMAP Milestone 2 Phase 2.1.
  Tracked there; do not pull forward.
- **External KML / KMZ AJAX routing through proxy** — ROADMAP Milestone 2
  Phase 2.2.
- **Bing tile layer routing** — needs API-key flow + is not a reported CSP
  case. Revisit if a Bing-specific DS bug is filed.
- **User-facing error UI** (toast/banner when proxy fails) — future polish
  phase if support volume warrants; today `console.warn` is sufficient for
  diagnostics.
- **CI pipeline for JS tests** — project has no CI today; adding one is a
  broader engineering-health investment (see
  `docs/superpowers/specs/2026-04-14-improvement-backlog-design.md`).
- **Bundle-size optimization / monolith split** — backlog design spec
  tracks this; orthogonal to DS compatibility.
- **`getTileUrl` failure-retry de-duplication** — D-15 mentions throttled
  warnings as Claude's discretion; a more sophisticated retry / backoff
  strategy belongs in a later performance phase.

### Reviewed Todos (not folded)
_None — no backlog todos matched Phase 2 scope._

</deferred>

---

*Phase: 02-maps-plus-js-integration-testing*
*Context gathered: 2026-04-17*
*Mode: interactive — 5 gray areas presented, recommended defaults accepted.*
*Next: `/gsd-plan-phase 2` (or `/gsd-discuss-phase 2 --chain` to auto plan+execute).*
