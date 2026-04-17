# Phase 2: Maps+ JS Integration + Testing — Research

**Researched:** 2026-04-17  
**Status:** Ready for planning

## 1. Phase 1 Server Contract (confirmed)

**Authoritative contract (matches `REQUIREMENTS.md` DS-TP-01, not `02-CONTEXT.md` D-07 path shape):**

- **Method / route:** `GET` with `restmap.conf` `match = /maps_plus/tile/proxy` → Splunk exposes this under the REST namespace as **`/services/.../maps_plus/tile/proxy`** (no `{z}/{x}/{y}` in the path). Confirmed in module docstring and handler class docstring: `bin/tile_proxy.py:3-5`, `bin/tile_proxy.py:920-921`. `default/restmap.conf:13-14` shows the match pattern is only `/maps_plus/tile/proxy`.
- **Query parameters (required unless noted):**
  - `url` — URL-encoded **template** string (must be present or `400` `missing_param_url`). `bin/tile_proxy.py:776-786`.
  - `z`, `x`, `y` — required integers (non-negative, injection-checked); missing → `400` `missing_param_zxy`. `bin/tile_proxy.py:777-789`, `272-288`.
  - `s`, `r` — optional; passed into `_resolve_tile`; defaults applied if absent. `bin/tile_proxy.py:781-782`, `291-316`, `48-49`.
- **Substitution rules:** `_resolve_tile` performs **literal** `.replace` for `{z}`, `{x}`, `{y}`, `{s}`, `{r}` only — **no** `{x}`/`{y}` order swapping and no Esri/GIBS magic. `bin/tile_proxy.py:291-316` (explicit A-07 comment at `294-296`).
- **Success response:** raw tile bytes, `Content-Type` and `Cache-Control` from upstream (with defaults documented in Phase 1 security context). `bin/tile_proxy.py:909-913`.
- **Error response:** JSON `{"error":"<short-code>"}` via `_write_json_error`. `bin/tile_proxy.py:735-747`.
- **Disabled:** `enabled: false` → `503` + `proxy_disabled`. `bin/tile_proxy.py:771-774`, `default/settings.json:4-6`.

**Discrepancy vs `02-CONTEXT.md` D-07:** D-07 specifies  
`{splunk_root}/servicesNS/-/leaflet_maps_app/maps_plus/tile_proxy/{z}/{x}/{y}?url=<encoded-template>`.  
The **implemented** contract uses **query-string** `z`, `x`, `y` — not path segments — and the **documented live UAT URL** in `01-UAT.md` is  
`https://localhost:8089/services/maps_plus/tile/proxy?url=...&z=0&x=0&y=0` (`01-UAT.md:33`, `108`).  
**Planner action:** revise D-07 (or add errata) so the JS `buildTileProxyUrl` helper targets **`.../maps_plus/tile/proxy?url=<enc>&z=<z>&x=<x>&y=<y>`** (plus optional `&s=` / `&r=` when used). Any `servicesNS/{owner}/{app}` prefix must follow whatever Splunk Web’s REST prefix rules are for **app-scoped** handlers (confirm at integration time; do not assume `/-/leaflet_maps_app` without verifying in target Splunk).

## 2. Splunk URL Construction

**What the repo already proves about `api/SplunkVisualizationUtils`:** the AMD module is imported and bound as `SplunkVisualizationUtils` (`src/maps-plus.js:10-11`, `54-55`). Current usages are **`SplunkVisualizationUtils.escapeHtml`** (`861`) and **`SplunkVisualizationUtils.makeSafeUrl`** (`866`, `2163-2164`) — **no** URL-to-splunkd-root builder appears in `maps-plus.js` (grep hits only those APIs).

**Planner implication:** D-08’s requirement to honour locale / mount / SSO **cannot** be satisfied by copy-pasting `SplunkVisualizationUtils` methods already in use — the executor must **discover** in Splunk’s shipped `splunkjs` / viz-utils sources (on a dev Splunk instance) whether `SplunkVisualizationUtils` exposes something like `makeUrl`, `getSplunkdPath`, or similar, **or** add a minimal AMD dependency on **`splunkjs/mvc/utils`** (or the documented successor in 10.x) and use its **`make_url`** (or equivalent) with the **relative REST path** fragment that points at `maps_plus/tile/proxy`. Exact function signature is **not** in this repo; verify against Splunk 9.x and 10.x `splunkjs` bundles before locking PLAN tasks.

**Idiom sketch (verify signatures in Splunk source, not normative):** `make_url` historically builds app-relative URLs with correct `en-US` / web prefixes. Pass the REST path and query object for `url`, `z`, `x`, `y`.

## 3. Leaflet TileLayer Extension Pattern

**Verified against vendored Leaflet `^1.9.4` in `node_modules/leaflet/src/...`:**

**`createTile(coords, done)`:** Builds an `<img>` and sets `tile.src = this.getTileUrl(coords)` — `node_modules/leaflet/src/layer/tile/TileLayer.js:147-171`. Overriding **`getTileUrl` alone is sufficient** for normal loads and retries that reuse the same pipeline (aligns with `02-CONTEXT.md` D-03).

**`getTileUrl(coords)`:** Public docs in source: “`coords: Object`” — implementation reads **`coords.x`**, **`coords.y`**, and uses **`this._getZoomForUrl()`** as **`z`** in the template data object, plus **`s`**, **`r`**, TMS `y` inversion when configured — `node_modules/leaflet/src/layer/tile/TileLayer.js:180-196`.

**`L.Util.template(str, data)`:** Regex `\{ *([\w_ -]+) *\}` per placeholder; missing keys **throw** (`No value provided for variable …`) — `node_modules/leaflet/src/core/Util.js:158-176`. Default tile URL merge is **`Util.template(this._url, Util.extend(data, this.options))`** — `node_modules/leaflet/src/layer/tile/TileLayer.js:196`. Any proxy-side “verbatim template” must still supply **every** `{token}` the template contains **unless** those tokens were merged away before encoding (see §10 GIBS risk).

**`setUrl`:** Assigns **`this._url = url`** and calls **`this.redraw()`** unless `noRedraw` suppresses — `node_modules/leaflet/src/layer/tile/TileLayer.js:126-140`. After `setUrl`, new tile fetches re-invoke **`getTileUrl`** — consistent with Maps+ **`setUrl`** sites at `src/maps-plus.js:437`, `443`, `445`, `2955-2956`.

## 4. Dashboard Studio Detection

**Project decision (locked):** truthy check on `window.__SPLUNK_DASHBOARD_STUDIO__`, with `window` guard for non-browser contexts — `02-CONTEXT.md` D-05, D-06.

**External documentation:** A targeted Splunk docs / help portal search did **not** return a first-party page documenting `window.__SPLUNK_DASHBOARD_STUDIO__` shape (boolean vs object) for 9.0–10.x. Treat **truthy** as the pragmatic contract; add a **manual matrix** row to spot-check **Splunk 9.x vs 10.x** DS iframes once per release.

## 5. Jest Harness for AMD Codebase

**Goal:** unit-test **`isDashboardStudio(window)`** and **`buildTileProxyUrl(...)`** only (`02-CONTEXT.md` D-19–D-20) — no Splunk/Leaflet runtime.

**`package.json` additions (compatible with existing Babel 7):** e.g. `jest@^29.7.0`, `babel-jest@^29.7.0` as **devDependencies** alongside existing `@babel/core@^7.26.0` / `@babel/preset-env@^7.26.0` (`package.json:13-21`). Add `"test": "jest"` script (`02-CONTEXT.md` D-20).

**Minimal `jest.config.js`:** `testEnvironment: 'node'`; `testMatch: ['**/tests/**/*.test.js']` under `appserver/static/visualizations/maps-plus/`; `transform: { '^.+\\.js$': 'babel-jest' }`; reuse Babel preset via `babel.config.js` or `jest` `transformIgnorePatterns` only if needed (node_modules mostly untested).

**File structure:** Prefer a **small sibling module** (e.g. `src/ds-tile-proxy-helpers.js`) exporting **CommonJS** `module.exports = { ... }` or **named exports** transpiled by Babel — **imported into `maps-plus.js` via the AMD dependency array** so Webpack still produces one `visualization.js`. Jest imports the same file by path. **Alternative:** helpers live only in `tests/` duplicated for “spec mirror” — worse for drift; sibling `src/` file is cleaner.

**Release / packaging:** `build_release.sh` / `scripts/deploy.sh` strip `src/` and tests from shipped tgz (`build_release.sh` stages from `git archive`; `scripts/deploy.sh:48-52` removes viz `src`); **Jest stays dev-only** — no packaging change required (`02-CONTEXT.md` D-22 vs deploy strip list).

## 6. OOTB Tile URL Templates (enumerated from `src/maps-plus.js`)

**Single `L.tileLayer(...)` call site:** `src/maps-plus.js:2616` (raster basemap path). Templates are whatever becomes **`this.activeTile`** (`2338`, `2612` for Antarctic GBIF branch).

**Defaults & attribution keys (same strings as formatter options):**

| Provider | Template string | File reference |
|----------|-----------------|----------------|
| CartoDB Light (default `mapTile`) | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` | `158`, `252`, `formatter.html:5` |
| Dark-theme auto-switch | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` | `2335` |
| OpenStreetMap | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | `251`, `formatter.html:4` |
| CartoDB Dark | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` | `253`, `formatter.html:6` |
| OpenTopoMap | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` | `254`, `formatter.html:7` |
| HOTOSM | `https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png` | `255`, `formatter.html:8` |
| Esri World Imagery | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | `256`, `formatter.html:9` |
| GBIF Geyser (Antarctic preset) | `https://tile.gbif.org/3031/omt/{z}/{x}/{y}@{r}x.png?gbif-geyser` | `228`, `formatter.html:619` |
| GBIF OSM Bright | `https://tile.gbif.org/3031/omt/{z}/{x}/{y}@{r}x.png?osm-bright` | `formatter.html:620` |
| NASA GIBS | `https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3031/best/{gibsLayerId}/default/{gibsTime}/{gibsTileMatrixSet}/{z}/{y}/{x}.{gibsFormat}` | `formatter.html:621` |

**Not `L.tileLayer` raster paths:** `L.maplibreGL` uses style URLs from `_getMaplibreStyleUrl` (`870-874`, `2567-2575`, `461-466`) — e.g. `https://tiles.openfreemap.org/styles/` + preset; **deferred** from tile proxy per D-12. **`L.tileLayer.bing`** — `2588`, `2600`; deferred per D-13.

**`activeTile =` reassignment:** `2338`, `2612` (Antarctic GBIF template from config `228`).

## 7. Classic-Mode Zero-Impact Verification

**Recommended (cheap + reliable):**

1. **Code review gate:** All DS-specific behaviour lives behind **`if (this._isDashboardStudio)`** (or early `return` of classic branch) except the one-time `_isDashboardStudio` assignment — matches `02-CONTEXT.md` “additive diff” guidance.
2. **Unit tests:** `isDashboardStudio` with `undefined` / `{}` / `false` ensures Classic predicate false (`D-06`). `buildTileProxyUrl` **not invoked** from Classic path (or invoked only in DS branch).
3. **Runtime spot-check (mandatory):** In Classic Simple XML, DevTools **Network** must show **direct** `https://tile.openstreetmap.org/...` (or chosen provider) — **no** `/maps_plus/tile/proxy` — per D-21 pass criteria (`02-CONTEXT.md:149-150`).
4. **Optional string-level check:** For a frozen template + z/x/y, assert Classic `L.tileLayer` would build the same upstream URL Leaflet’s default `getTileUrl` produces vs proxy builder output shape — high effort; use only for Esri `{y}/{x}` regression paranoia.

## 8. UAT Matrix Template

**Structure (mirror `01-UAT.md`):** frontmatter + **Tests** list with `expected` / `result` / `observed` / `notes`.

**Axes:**

| Axis | Values |
|------|--------|
| **1 — Provider** | OSM; CartoDB Light; CartoDB Dark; Esri; HOTOSM; OpenTopoMap; GBIF Geyser; GBIF OSM Bright; NASA GIBS; **custom** HTTPS override (allowlisted host) |
| **2 — Runtime** | Classic Splunk dashboard; Dashboard Studio |
| **3 — Feature / dashboard** | Pick **one dashboard per cell** from `default/data/ui/views/*.xml` |

**Note:** `TESTING.md` references “24” example dashboards; the repo currently has **22** XML views under `default/data/ui/views/` (glob verification 2026-04-17).

**Recommended 6 dashboards (collective coverage):**

| Dashboard XML | Covers (axis 3) |
|---------------|-----------------|
| `heatmap.xml` | Heatmap layer + basemap |
| `multicluster_groups.xml` | Marker clustering (multi-group) |
| `path_lines.xml` | Path tracing |
| `kml_overlay.xml` | KML/KMZ overlay (CSP on tiles is orthogonal; ensures no DS regressions in panel) |
| `antarctic_projection.xml` | Antarctic CRS + GBIF / GIBS-style tile options |
| `features.xml` | Geoman / feature drawing (heavy viz init; smoke for side effects) |

**MapLibre axis:** use any dashboard duplicated in DS with **`useOpenFreeMap`** enabled in viz format (not a specific shipped XML default); expect **direct** vector/style traffic still — document **proxy not applied** per D-12.

**Pass criteria (from D-21):** no `blocked:csp` for raster tiles in DS; no spurious CORS on same-origin proxy; tiles 200 at zoom sweep; Classic shows **direct** CDN requests.

## 9. Build & Deploy

**Rebuild bundle:**  
`cd appserver/static/visualizations/maps-plus` → `npm install` (per `CLAUDE.md`, often `--ignore-scripts`) → **`npm run build`** (`package.json:7`, `build_release.sh:21-22`). Output: `visualization.js` in the viz directory (`webpack.config.js:21-24`).

**`npm run deploy`:** `npm run build && bash scripts/deploy.sh` (`package.json:8`). **`scripts/deploy.sh`** stages `leaflet_maps_app` from repo root dirs and writes **`maps-plus-for-splunk_<version>.tgz`** at repo root — **not** a Docker `cp` flow (`scripts/deploy.sh:9-59`). Adjust onboarding text if older docs implied container copy.

**Release packaging:** **`./build_release.sh`** from repo root runs viz build, optionally commits artifacts, **`git archive`** to stage, strips `tests/`, `.planning/`, etc., verifies `bin/tile_proxy.py` + `default/restmap.conf` (`build_release.sh:19-76`).

**Jest / `tests/`:** excluded from release tarball by design; **no change** required for Phase 2 test harness unless you intentionally want shipped QA assets (not recommended).

## 10. Risks & Pitfalls

| Risk | Detail |
|------|--------|
| **D-07 / contract drift** | If JS implements path-style `{z}/{x}/{y}` against current splunkd handler, requests will **not** match `_handle_get_internal`’s required **query** `z/x/y` — tiles fail with `missing_param_zxy`. Must align with §1. |
| **GIBS / custom `{tokens}` beyond z,x,y,s,r** | Server `_resolve_tile` **does not** replace `{gibsLayerId}`, `{gibsTime}`, etc. (`291-316`). Leaflet’s **default** `getTileUrl` **does** merge `this.options` into the template via `L.Util.template`. A naïve “encode `this._url` verbatim” proxy URL **breaks GIBS** unless the client **pre-merges** the same option keys Leaflet would merge **before** encoding `url=`, leaving only placeholders the server understands **or** Phase 1 is extended (out of current Phase 1 code contract). **Planner:** explicit task for “template normalization for proxy query param”. |
| **`{r}` on GBIF** | Code replaces `{r}` with `this.pixelRatio` in the Antarctic non-GIBS branch (`2468`); server also replaces `{r}` (`309-316`). Ensure **one coherent strategy** (D-10 client `s` default vs server defaults). |
| **`SplunkVisualizationUtils` gap** | No URL builder in repo usage — wrong helper choice silently builds broken relative URLs on mounted Splunk. |
| **503 `proxy_disabled`** | Client must tolerate **`enabled: false`** without throwing — Leaflet shows blank tiles; optional `console.warn` per D-15. |
| **`tileLayer._url` check** | `2955-2956` compares `this.tileLayer._url` to `this.activeTile`. A proxied layer may set **`_url`** to the inner template or proxy base — verify **equality / `setUrl` path** still behaves to avoid infinite `setUrl` loops. |
| **CSP / iframe (web search)** | No Splunk-first-party doc surfaced linking DS iframe CSP to custom viz tiles; **empirical** DevTools verification remains the source of truth. |
| **Babel / Jest** | `webpack.config.js` uses `modules: false` for shipped code; Jest Babel config can use `preset-env` with `modules: 'commonjs'` for tests only — avoid changing Webpack transpile unless required. |

**Nothing in §1–§10 invalidates D-01–D-06, D-08’s intent, D-10–D-04, D-11–D-17, D-18–D-23** when D-07 is corrected to query-param contract and GIBS normalization is planned.

## 11. Planning Recommendations

**Split per `ROADMAP.md` into exactly two plans:**

### Plan 02-01 — DS detection + tile interception (JS integration)

- **Wave A — Contract + URL builder spike:** Fix D-07 doc; implement `buildTileProxyUrl` against **`bin/tile_proxy.py:759-789`** + `default/restmap.conf`; Splunk URL builder verification task.
- **Wave B — Leaflet integration:** `L.TileLayer` subclass + `_isDashboardStudio` in `initialize` (`259-267`); swap instantiation at `2616`; handle **template normalization** for GIBS/GBIF (`2468`, `formatter.html:621`).
- **Wave C — Lifecycle hardening:** Audit `setUrl` / `_url` compare (`437-445`, `2955-2956`); optional `img` error listener → `console.warn` with stable prefix (`D-15`).
- **Files:** `src/maps-plus.js` (primary), possible `src/ds-tile-proxy-helpers.js`, `formatter.html` only if new options (avoid unless needed), `02-CONTEXT.md` errata for D-07.

### Plan 02-02 — Rebuild + integration testing + Jest

- **Wave A — Tooling:** `package.json` + `jest.config.js` + `appserver/static/visualizations/maps-plus/tests/*.test.js`; helpers wired for import.
- **Wave B — Build:** `npm run build`; commit `visualization.js` (`D-22`); size smoke (`D-23`).
- **Wave C — UAT:** Author `02-UAT.md` using matrix §8; execute Classic + DS rows; record Network evidence.
- **Files:** `package.json`, `jest.config.js`, `babel.config.js` (if split), tests, `visualization.js`, `02-UAT.md`.

**Task counts (rough):** 02-01 → **8–12** tasks; 02-02 → **6–10** tasks (depends on whether GIBS normalization is one task or three).

## Validation Architecture

**Layer 1 — Jest:** Locks pure **URL predicate + builder** behaviour (DS flag, encoding, query param ordering, optional `s`/`r`, edge cases for Esri `y/x` order in **template** not in query). Catches contract drift vs Python (`missing_param_*` avoidance).

**Layer 2 — Webpack build:** Catches AMD/webpack resolution errors and bundle regressions before Splunk.

**Layer 3 — Manual UAT (Classic vs DS):** Only layer that observes **real CSP**, Splunk **locale/root prefixes**, **`servicesNS` paths**, and Leaflet **runtime** interaction with `setUrl` / Antarctic CRS. **Classic Network must prove zero proxy traffic**; **DS Network must prove same-origin proxy + 200 tile bodies**.

**Layer 4 — Regression breadth:** Spot-check the **22** shipped example dashboards in Classic after touch `maps-plus.js` to catch accidental global behaviour (cluster/heatmap/KML paths unaffected).

---

*Phase: `02-maps-plus-js-integration-testing` · Research agent: gsd-phase-researcher · Sources: repo files only for citations; web search attempted for DS flag / CSP with inconclusive first-party hits.*
