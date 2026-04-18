# Dashboard Studio Compatibility — Requirements

## Phase 1: Raster Tile Proxy for Dashboard Studio

### Authentication & Access (deferred)
- No auth changes needed — REST proxy runs under existing Splunk user context. Tile provider responses don't require Splunk auth tokens.

### Tile Proxy Core (DS-TP)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| DS-TP-01 | `GET /services/rest/maps_plus/tile/proxy?url=<template>&z={z}&x={x}&y={y}` endpoint exposed via Splunk REST framework | Must | URL-encoded template with `{z}`, `{x}`, `{y}` placeholders substituted before fetching |
| DS-TP-02 | Response headers must include `Content-Type: image/png`, `Cache-Control` from upstream or default `public, max-age=3600` | Must | Preserve upstream `ETag` / `Last-Modified` for cache validation |
| DS-TP-03 | Handle upstream HTTP errors (403 rate-limited, 502 bad gateway, 504 timeout) gracefully — return appropriate error response without crashing the process | Must | Log errors to splunkd with module tag `maps_plus.tile_proxy` |
| DS-TP-04 | Support coordinate-order variants: `{z}/{x}/{y}` (standard) and `{z}/{y}/{x}` (Esri, GIBS) via query parameter or template hint | Must | Default is `{x}/{y}`; if URL contains `/ArcGIS/` or `gibs`, default to `{y}/{x}` |
| DS-TP-05 | Support extra URL template variables: `{r}` (pixel ratio for retina), `{s}` (subdomain like `a`, `b`, `c`) — substitute with sensible defaults (`1`, `a`) | Should | Substituted before request is made, no network call needed for these |

### Cache Layer (DS-CL)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| DS-CL-01 | In-memory LRU cache: max 256 entries, key = full resolved tile URL (after template substitution), value = binary tile data + metadata (URL, last-accessed) | Must | Per-process cache — survives within a single Python process lifetime |
| DS-CL-02 | Optional on-disk LRU cache: configurable size cap (default 500MB), path = `var/run/maps_plus/tile_cache/`, auto-prune oldest files when cap exceeded | Should | Only available on Enterprise/CMP/BYOL; Cloud fallback to memory-only is transparent |
| DS-CL-03 | Cache miss triggers upstream fetch with 10-second timeout; cache hit serves directly without network call | Must | Timeout protects against slow/unreachable tile providers blocking the request |

### Maps+ JavaScript Integration (DS-JS)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| DS-JS-01 | Detect Dashboard Studio runtime via `window.__SPLUNK_DASHBOARD_STUDIO__` flag at module initialization time | Must | Store as `_isDashboardStudio: true/false` on the main component object |
| DS-JS-02 | When in DS mode, override Leaflet's tile layer creation to intercept URL templates and redirect through proxy endpoint | Must | Use `createTile` hook on L.TileLayer (or custom tile layer subclass) rather than URL string replacement |
| DS-JS-03 | Preserve existing tile provider settings from format menu — don't hardcode which providers are proxied, instead wrap any external tile URL transparently | Must | The proxy accepts any `https://` URL template; no whitelist needed for basic operation |
| DS-JS-04 | When in Classic Splunk mode, behavior is identical to current implementation — zero changes to existing dashboards | Must | No feature flag, no config toggle required for backward compatibility |

### DS Parent-Frame Auth Bridge (DS-AUTH) — Phase 3

Discovered during Phase 02 UAT-2: the null-origin `about:srcdoc` iframe that
Splunk Dashboard Studio uses for custom visualizations causes the browser to
withhold Splunk's `SameSite=Lax` session cookie on cross-site subresource
requests, so tiles reach Splunkweb cookieless and are redirected to login.
The bridge provides the single narrow channel needed to close that gap.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| DS-AUTH-01 | Parent-window shim loaded in the Splunk Web top frame that handles tile-fetch postMessage requests from DS-hosted Maps+ iframes | Must | Load point (`app.conf` static JS vs. `web.conf` `custom_javascript_url` vs. nav XML) to be determined during Phase 3 planning by testing which fires on pages hosting DS dashboards; shim has the session cookie because it's same-origin with Splunk Web |
| DS-AUTH-02 | postMessage RPC protocol between iframe and parent uses exactly one request type (`maps-plus:fetch-tile`) and one response type (`maps-plus:tile-result`); optional ping/pong for feature detection; no generic RPC surface | Must | Allow-list of message types is frozen — extending it requires a new phase with its own threat model. Grep of `parent-auth-bridge.js` and iframe code shows only the pinned type literals. |
| DS-AUTH-03 | Bidirectional exact-origin validation — parent validates `event.origin` equals the Splunk Web origin it serves; iframe validates `event.origin` equals the top-frame origin derived from the existing `_detectSplunkOrigin` helper | Must | No substring matches, no wildcards. Jest harness asserts wrong-origin messages are dropped without side effects on both ends. |
| DS-AUTH-04 | URL-shape allow-list of one — parent only fetches URLs matching the Phase 02 proxy URL template `/<restRoot>/maps_plus/tile/proxy?url=…&z=…&x=…&y=…[&s=…][&r=…]`; all non-conforming URLs rejected before any fetch is dispatched | Must | Encoded as a single validated regex shared between iframe and parent (or pinned via Jest across both sides). Non-conforming URLs produce `{ ok: false, code: 'url_shape_rejected' }` with no outbound request. |
| DS-AUTH-05 | No tokens, session IDs, search data, or user identifiers in postMessage payloads in either direction; only tile coordinates, URL, and tile bytes flow | Must | Payload schemas: request `{ type, requestId, url, z, x, y, s?, r? }`; response `{ type, requestId, ok, blobBase64\|status\|code, contentType? }`. Enforced by code review + Jest structural assertion. |
| DS-AUTH-06 | Graceful fallback when parent shim is absent — iframe logs one-line `[maps-plus:ds-proxy]` warning and shows blank tiles; no retry storm, no exception bubbling to DS adapter | Must | Feature-detected via ping handshake or first-fetch timeout. Manual UAT: disable parent shim → DS dashboard loads without crash, exactly one console warning, Leaflet shows blank tiles. |

**Security properties (cross-cutting across DS-AUTH-01..06):**

- Phase 1 server-side SSRF allow-list remains authoritative for all outbound
  tile fetches — the bridge only performs authenticated same-origin `fetch`
  against the already-validated Phase 2 proxy URL.
- Tile bytes flow iframe-ward only. The iframe cannot steer the parent to
  arbitrary URLs; it can only request tiles that match the one pinned URL
  shape for the already-registered Phase 1 endpoint.
- Rate limit per iframe on the parent side (target ~500 requests/second,
  matching worst-case Leaflet pan/zoom fan-out) to prevent a compromised
  iframe from using the parent as an authenticated fan-out proxy.

### Configuration (DS-CFG)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| DS-CFG-01 | Runtime configuration via `local/settings.json` in app scope: `{ "ds_tile_proxy": { "enabled": true, "cache_max_memory": 256, "disk_cache_enabled": true, "disk_cache_max_mb": 500 } }` | Must | Defaults provided if file doesn't exist — no mandatory config change for users |
| DS-CFG-02 | Config changes read at proxy startup (Python module load time); no hot-reload required | Should | Splunk restart needed after config changes — acceptable for infrastructure-level config |

## Traceability

| Requirement | Implementation File(s) | Plan Entry |
|-------------|----------------------|------------|
| DS-TP-01 through DS-TP-05 | `bin/rest/maps_plus/tile_proxy.py` (handler), `restmap.conf` (routing) | Phase 1, Plan A |
| DS-CL-01 through DS-CL-03 | `bin/rest/maps_plus/tile_proxy.py` (cache module) | Phase 1, Plan A |
| DS-JS-01 through DS-JS-04 | `src/maps-plus.js` (DS detection, tile intercept), `webpack.config.js` (rebuild) | Phase 1, Plan B |
| DS-AUTH-01 through DS-AUTH-06 | `appserver/static/parent-auth-bridge.js` (new, parent-window shim), `src/maps-plus.js` (iframe-side `DsProxyTileLayer.createTile` override), Splunk Web load-point config (`app.conf` / `web.conf` / nav XML — TBD in Phase 3 planning) | Phase 3, Plans 03-01 + 03-02 |
| DS-CFG-01 through DS-CFG-02 | `default/settings.json`, local settings template | Phase 1, Plan A |

## Out of Scope (Phase 1)

| Exclusion | Reason |
|-----------|--------|
| MapLibre GL JS vector tile proxying (style JSON + MVT tiles) | Vector tiles use a fundamentally different fetch model; defer to Phase 2 with dedicated design |
| External KML/KMZ file loading through proxy | Currently loaded via `$.ajax` — would work if same-origin, but not the core reported issue. Defer to Phase 2. |
| Offline/air-gapped pre-bundled tile packs | File sizes are prohibitive (z=10 world coverage = ~50GB); impractical for offline use case |
| Google Street View compatibility in DS | Separate sub-plugin with its own Webpack build; not part of core map rendering |

## Requirement Lifecycle

- **Active** → Requirements written above. Will be validated during implementation and testing.
- **Validated** → No requirements shipped yet. Phase 1 deliverables will be tested against Dashboard Studio instances and moved to Validated upon confirmation.
- **Out of Scope** → As listed above. Can be re-evaluated for future milestones if demand increases.
