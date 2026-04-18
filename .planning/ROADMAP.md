# Maps+ Dashboard Studio Compatibility — Roadmap

## Milestone 1: Dashboard Studio Raster Tile Proxy Support

### Phase 1: REST Proxy Backend + Routing

**Goal:** Same-origin Splunk REST endpoint that resolves, validates, fetches, caches, and streams raster tiles back to Leaflet running inside a Dashboard Studio iframe — bypassing DS CSP — with 4-layer SSRF defense, response-size cap, and two-tier (memory + optional disk) LRU caching.

**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Python REST handler (bin/rest/maps_plus/tile_proxy.py) + pure-function library + unittest suite (first tests in project, stdlib only, Splunk stub harness) — SUMMARY: 01-01-SUMMARY.md (49/49 tests pass)
- [x] 01-02-PLAN.md — restmap.conf [script:] stanza + default/settings.json allowlist seed + deploy.sh / build_release.sh updates to ship bin/ and configs
- [x] 01-03-PLAN.md — DiskCache class (atomic writes, LRU prune by mtime, concurrency lock, Splunk Cloud fallback, path confinement) + two-tier handle_GET integration + concurrency/disk tests — SUMMARY: 01-03-SUMMARY.md (71/71 tests pass)

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

**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md — DS detection + DsProxyTileLayer subclass + pure helpers in `src/ds-tile-proxy-helpers.js` — SUMMARY: 02-01-SUMMARY.md (6 edits, all 6 verify checks pass)
- [x] 02-02-PLAN.md — Jest harness (20/20 tests pass) + visualization.js rebuild (+0.05%) + 02-UAT.md 34-row matrix — SUMMARY: 02-02-SUMMARY.md

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

### Phase 3: DS Parent-Frame Auth Bridge

**Goal:** Unblock Dashboard Studio tile rendering by bridging the null-origin `about:srcdoc` iframe through the top-level Splunk Web window. The browser withholds Splunk's `SameSite=Lax` session cookie on cross-site subresource requests from origin `null`, so tiles fetched by Leaflet `<img src>` inside DS arrive cookieless and Splunkweb redirects every request to login. A parent-window shim loaded in the Splunk Web top frame performs the authenticated fetch (same-origin, cookie present) on behalf of the iframe, over a narrow `postMessage` RPC with a single frozen message type, bidirectional origin validation, a one-URL-shape allow-list, and no token or search-data flow. Phase 1's server-side SSRF defense remains the trust boundary for outbound fetches; the bridge only closes the authentication gap the browser enforces.

**Requirements:** DS-AUTH-01 through DS-AUTH-06
**Depends on:** Phase 2 (client-side DS detection, `DsProxyTileLayer`, proxy URL construction)
**Plans:** 2 plans anticipated

Plans:
- [ ] 03-01-PLAN.md — Parent-window shim (`parent-auth-bridge.js`) + Splunk Web load wiring. Determine and wire the correct load point (`app.conf` `application_namespace` static JS vs. nav XML vs. `web.conf` `custom_javascript_url`) by testing which fires on pages that host DS dashboards. Shim: origin-validated postMessage listener, one message type (`maps-plus:fetch-tile`), URL-shape allow-list of one (`/<restRoot>/maps_plus/tile/proxy?url=…&z=…&x=…&y=…`), per-iframe rate limit (~500/s), authenticated `fetch` with `credentials: 'same-origin'`, response returned as base64 bytes + content-type. Zero server-side changes.
- [ ] 03-02-PLAN.md — Iframe-side `DsProxyTileLayer.createTile` override + Jest cross-window RPC harness + UAT re-run. Override `createTile` (not just `getTileUrl`) so the iframe sends a `postMessage` request and assigns the returned bytes as a `blob:` URL to `img.src`. Feature-detect parent shim presence with a ping handshake; on absence log once and fall through to blank tiles (no retry storm). Jest harness uses `new MessageEvent(...)` with faked `origin`/`source` to exercise both ends of the protocol (origin-validation positive/negative, URL-shape allow-list, rate-limit, ping handshake, blob reconstruction). Manual re-run of UAT-2 through UAT-7 against DS dashboards in `splunk-10-dev`.

**Security properties to preserve across both plans:**
- Bidirectional exact-origin validation (no substring matches, no wildcards)
- One message type only — any extension is a new phase with its own threat model
- No tokens, session IDs, search data, or user identifiers in postMessage payloads
- Tile bytes flow iframe-ward only; iframe cannot steer the parent to arbitrary URLs
- Phase 1 SSRF allow-list remains authoritative for outbound tile fetches
- Bridge absence → graceful blank-tile fallback, no crash, no retry storm

**Explicitly out of scope:**
- Extending the RPC surface beyond `maps-plus:fetch-tile` (future need = new phase)
- Changing Splunk's session cookie to `SameSite=None; Secure` (not shippable from an app)
- Cross-browser auth-bridge variants (stick to Chrome/Firefox/Safari/Edge last 2 per CLAUDE.md)
- Vector tiles / KML / Bing — remain deferred to Milestone 2 as before

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

*This roadmap will be updated at the end of Milestone 1 based on testing results and discovered edge cases.*
