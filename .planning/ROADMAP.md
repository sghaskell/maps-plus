# Maps+ Dashboard Studio Compatibility — Roadmap

## Milestone 1: Dashboard Studio Raster Tile Proxy Support

### Phase 1: REST Proxy Backend + Routing

**Goal:** Same-origin Splunk REST endpoint that resolves, validates, fetches, caches, and streams raster tiles back to Leaflet running inside a Dashboard Studio iframe — bypassing DS CSP — with 4-layer SSRF defense, response-size cap, and two-tier (memory + optional disk) LRU caching.

**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Python REST handler (bin/rest/maps_plus/tile_proxy.py) + pure-function library + unittest suite (first tests in project, stdlib only, Splunk stub harness) — SUMMARY: 01-01-SUMMARY.md (49/49 tests pass)
- [ ] 01-02-PLAN.md — restmap.conf [script:] stanza + default/settings.json allowlist seed + deploy.sh / build_release.sh updates to ship bin/ and configs
- [ ] 01-03-PLAN.md — DiskCache class (atomic writes, LRU prune by mtime, concurrency lock, Splunk Cloud fallback, path confinement) + two-tier handle_GET integration + concurrency/disk tests

**Plan 1.1 — Python REST Handler (`bin/rest/maps_plus/tile_proxy.py`)**
- Implement `BaseRestHandler` GET endpoint at `/services/rest/maps_plus/tile/proxy`
- Template substitution logic for `{z}`, `{x}`, `{y}`, `{s}`, `{r}`
- Cache-Control, Content-Type header forwarding
- Upstream fetch via `urllib.request` with 10-second timeout
- Error handling: 403 rate-limits → log + return 502; 504 timeout → log + return 504
- Unit tests for `_resolve_tile()` with mocked responses (new test infrastructure — first automated tests in project)

**Plan 1.2 — Configuration (`restmap.conf`, `default/settings.json`)**
- `restmap.conf` route definition: `[route:maps_plus_tile_proxy]` → handler path
- Default `settings.json` template with all cache/provider config options
- App-scoped only, no system file modifications
- Deploy script updates (`scripts/deploy.sh`) to include new files

**Plan 1.3 — Disk Cache + LRU Pruning (`bin/rest/maps_plus/tile_proxy.py`)**
- In-memory LRU: 256-entry ordered dict keyed by resolved URL
- Optional on-disk cache at `var/run/maps_plus/tile_cache/`
- Auto-prune: on each write, if total size exceeds cap, remove oldest files until under cap
- Graceful degradation for Splunk Cloud (disk write fails → log warning, use memory-only)

### Phase 2: Maps+ JavaScript Integration + Testing

**Plan 2.1 — DS Detection + Tile Interception (`src/maps-plus.js`)**
- Add `_isDashboardStudio` detection via `window.__SPLUNK_DASHBOARD_STUDIO__`
- Override Leaflet tile creation for all raster tile layers when in DS mode
- Wrap URL templates through proxy endpoint (pass full template as query param)
- Maintain existing behavior when NOT in DS mode (zero impact on Classic Splunk dashboards)

**Plan 2.2 — Rebuild + Integration Testing**
- Webpack rebuild of `visualization.js` and verification of build output integrity
- Test against Dashboard Studio instances at multiple zoom levels / tile sources
- Verify no CORS/CSP errors in Chrome DevTools Network panel
- Test all OOTB providers: CartoDB Light/Dark, OSM, Esri, HOTOSM, OpenTopoMap, GBIF Geyser/OSMBright, NASA GIBS
- Test with custom tile URL overrides from format menu
- Manual test against each of the 24 existing example dashboards (regression check)

---

## Milestone 2: Phase 2 — Vector Tiles + KML Proxy (Future)

**Phase 2.1: MapLibre GL JS Style Document & MVT Tile Proxy**
- Proxy style JSON fetches from OpenFreeMap CDN
- Proxy vector tile requests (MVT/protobuf) through same-origin endpoint
- Maps+ MapLibre integration layer to route style/tile URLs through proxy in DS

**Phase 2.2: External KML/KMZ Loading Through Proxy**
- Route external KML file AJAX requests through `$.ajax` → proxy endpoint
- Preserve KMZ ZIP extraction logic (JSZip handles decompression client-side)
- KML tile/image references within KML files — handle via same mechanism or documented limitation

---

*This roadmap will be updated at the end of Milestone 1 based on testing results and discovered edge cases.*
