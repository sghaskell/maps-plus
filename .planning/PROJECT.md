# Maps+ for Splunk — Dashboard Studio Compatibility Project

## What This Is

Maps+ is a Splunk custom visualization app (v4.6.0) providing an interactive Leaflet-based map plugin. It currently works in Classic Splunk dashboards but tiles fail to load in **Dashboard Studio** due to the iframe's stricter Content Security Policy, which blocks cross-domain tile requests from providers like CartoDB, OSM, Esri, etc.

This project fixes that by implementing a **same-origin REST tile proxy** with optional disk caching — routing external tile loads through Splunk's own `services/rest/` endpoint so CSP never sees a cross-domain request.

## Core Value

Make Maps+ fully functional inside Dashboard Studio's sandboxed iframe without requiring users to modify Splunk system configuration, bypass AppCert standards, or give up existing tile provider flexibility (CartoDB, OSM, Esri, GBIF, GIBS, custom overrides).

## Requirements

### Validated

- ✓ Leaflet-based map rendering with 6+ marker types (png, svg, circle, icon, milsymbol, custom)
- ✓ 24 example dashboards demonstrating all features in Classic Splunk
- ✓ Tile provider selection via format menu (CartoDB, OSM, Esri, HOTOSM, OpenTopoMap, GBIF, GIBS, MapLibre styles)
- ✓ Marker clustering, heatmaps, path tracing, KML/KMZ overlays, lasso selection
- ✓ Works in Splunk Classic dashboards (Simple XML MVC framework)

### Active

- [ ] REQ-DS-01: Detect Dashboard Studio runtime vs Classic Splunk via `window.__SPLUNK_DASHBOARD_STUDIO__` flag
- [ ] REQ-DS-02: Expose same-origin REST endpoint `/services/rest/maps_plus/tile/proxy` that forwards tile requests to external providers, caches, and streams responses
- [ ] REQ-DS-03: Intercept Leaflet's `createTile` method in DS mode to route tile URL templates through the proxy instead of direct external URLs
- [ ] REQ-DS-04: Implement in-memory LRU cache (256 tiles) for all deployments + optional on-disk LRU cache (configurable 500MB cap, auto-prune on write) for Enterprise/CMP/BYOL
- [ ] REQ-DS-05: Support all OOTB raster tile providers — OSM, CartoDB Light/Dark, Esri World Imagery, GBIF Geyser, GBIF OSM Bright, NASA GIBS, HOTOSM, OpenTopoMap, and custom user overrides
- [ ] REQ-DS-06: Provide Splunk configuration toggle (`local/settings.conf` or `local/settings.json`) to enable DS proxy mode, set cache size limits, and configure allowed tile domains whitelist
- [ ] REQ-DS-07: No system-level config modifications (`web.conf`, `authentication.conf`, etc.) — fully app-scoped, safe uninstall with zero residual state

### Out of Scope

- MapLibre GL JS vector tile proxying (style JSON + MVT tiles) — deferred to Phase 2
- External KML/KMZ file loading through proxy — deferred to Phase 2
- Offline/air-gapped pre-bundled tile packs (file size prohibitive, impractical for offline use)
- Google Street View compatibility fixes in DS

## Context

### Brownfield Project

- Maps+ v4.6.0, ~3,500 line single AMD module (`src/maps-plus.js`) compiled via Webpack 5 + Babel 7 → `visualization.js` (2.8MB bundle)
- Existing codebase map in `.planning/codebase/` — full architecture, stack, conventions, and concerns documented
- Target Splunk version: **9.0+** (`BaseRestHandler` confirmed available on 9.x/10.x)
- No automated tests or linter currently exist

### Key Technical Constraints

- Dashboards in DS use sandboxed iframes with strict CSP — `blocked:csp` errors when Leaflet fetches tiles from external origins
- Classic Splunk dashboards continue to work unchanged (no feature flag needed for existing deployments)
- Tile URL patterns vary by provider: OSM/CartoDB use `{z}/{x}/{y}`, Esri uses `{z}/{y}/{x}`, GIBS has extra params (`{gibsLayerId}`, `{gibsTime}`, `{gibsFormat}`), GBIF uses `{r}` pixel ratio

## Constraints

- Must be Splunk AppCert compliant — no global config overrides, no file system writes outside app scope
- REST handler uses Python's `urllib.request` only (no external pip dependencies)
- Must work inside Splunk Cloud (no disk cache write access — graceful fallback to in-memory only)
- Existing Classic Splunk dashboards must continue to work without any changes
- Tile proxy response must match tile provider requirements: correct headers (`Cache-Control`, `Content-Type`), handle 403 rate-limits gracefully, timeout on unreachable providers

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single universal proxy endpoint vs per-provider routing | Generic URL template substitution handles all provider patterns (including user custom overrides) without hardcoded mappings | Universal endpoint: `/services/rest/maps_plus/tile/proxy?url=<template>&z=&x=&y=` |
| In-memory LRU + disk LRU cache (not TTL-based) | Tile requests are spatially clustered — nearby tiles requested on pan/zoom benefit from spatial locality; TTL doesn't reflect actual usage patterns | 256 tile LRU in memory per-process, optional 500MB disk LRU with auto-prune on write |
| Raster tiles only for Phase 1 (defer MapLibre + KML) | Vector tile proxying and external KML loading are significantly more complex; reported issue is exclusively raster tile `blocked:csp` | Maps+ GL JS vector tiles deferred to Phase 2 |
| Runtime detection via `window.__SPLUNK_DASHBOARD_STUDIO__` | Splunk's documented feature-detection flag; no config toggle needed for automatic DS mode switching | Automatic proxy activation when in DS iframe |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 after initialization*
