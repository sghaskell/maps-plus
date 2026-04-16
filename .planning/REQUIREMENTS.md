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
