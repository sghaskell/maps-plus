# Maps+ Backlog

Triaged list of open issues and feature gaps. Update as items are resolved.

Last updated: 2026-03-23

---

## P1 — Fix now

### #30 — Dark mode crash ✅ CLOSED
**Type:** Bug
**Source:** https://github.com/sghaskell/maps-plus/issues/30
`_darkModeInit` previously used a hardcoded `cssRules[10]` index to locate the contextmenu sub-stylesheet inside `visualization.css`. Fixed: now walks `cssRules` dynamically to find the first `@import` sub-stylesheet, with a null guard if none is found. Verified non-crashing in Splunk dark theme as of 2026-03-23.

### #47 — OSM 403 tile access blocked ✅ CLOSED
**Type:** Bug / Docs
**Source:** https://github.com/sghaskell/maps-plus/issues/47
OSM now blocks tile requests missing `Referer`/`User-Agent` headers. Leaflet loads tiles as `<img>` tags so custom headers aren't possible. Fixed via UI warnings and docs: renamed OSM dropdown options to flag rate-limiting, added help text to Map Tile control group, updated README Map Tile section. Default tile (CartoDB Light) was already non-OSM. Users pointed toward OpenFreeMap for best OSM-based experience.

---

## P2 — Next sprint

### #36 + #38 — KML: large file fix + URL support ✅ CLOSED
**Type:** Bug + Enhancement
**Source:** https://github.com/sghaskell/maps-plus/issues/36, https://github.com/sghaskell/maps-plus/issues/38
- **#36:** Root cause was `onEachFeature` calling `map.getPane(feature.properties.name)` when `name` is undefined (common in GPS track KML exports with unnamed features). `map.getPane(undefined)` returns undefined and `.style.zIndex` throws, stopping all features from rendering. Fixed with a null guard in both the KMZ and KML code paths. Added `.fail()` error handler to `$.ajax` so load failures surface in the console instead of silently disappearing.
- **#38:** Added URL detection (`/^https?:\/\//`) in the `kmlOverlay` loop — values starting with `http://` or `https://` are used directly, bypassing the app-relative `contrib/kml/` path. Splunk Cloud users can now reference externally-hosted KML/KMZ files. Close #38 as resolved-by.

### #27 — Empty state + marker limit
**Type:** Bug / UX
**Source:** https://github.com/sghaskell/maps-plus/issues/27
Two sub-issues:
- When search returns no results, the viz throws an error instead of rendering a blank map.
- Canvas circle markers hit a display limit (~139); users don't know about `disableRowLimit`. Document it and add a graceful empty-state render path.

### #39 — Cluster color by clusterGroup
**Type:** Enhancement
**Source:** https://github.com/sghaskell/maps-plus/issues/39
Configurable foreground/background color palettes per `clusterGroup` value. Design proposal in the issue thread. Has been on backlog — acknowledged by maintainer. Close **#32** as duplicate.

### Layer visibility UI
**Type:** Feature gap (no issue)
Expose `L.control.layers` so users can toggle individual layer groups on/off from the map UI without rewriting SPL. Resolves **#41** (KML overlay toggle) as a side effect — close #41 as resolved-by.

---

## P3 — Backlog

### Map state tokens
**Type:** Feature gap
Output `$mapCenter$` and `$mapZoom$` Splunk tokens on map pan/zoom. Enables linked dashboards and persistent map state between page loads.

### #43 — Drilldown from drawn features
**Type:** Enhancement
**Source:** https://github.com/sghaskell/maps-plus/issues/43
Add drilldown token from Geoman-drawn feature context menus. Contributor provided working prototype code. Token name should be user-configurable (currently hardcoded in prototype).

### Free geocoder (Nominatim)
**Type:** Feature gap
Add an optional search/geocode box powered by Nominatim (no API key required, uses OSM data). Complements existing Google Places Autocomplete (which requires a key).

### Canvas renderer for circle markers
**Type:** Feature gap
Add a `useCanvasRenderer` option that switches `markerType: circle` to `L.Canvas`. Significant performance gain for 50k+ circle datasets beyond what viewport culling provides.

### Legend control
**Type:** Feature gap
Field-driven visual key rendered as a `L.control` info box. Useful when multiple `layerGroup` values use different icons/colors and users need a reference.

### WKT feature click drilldown
**Type:** Feature gap
WKT geometry layers currently render but clicking them sets no tokens. Add consistent drilldown token output on WKT feature click, matching behavior of other layer types.

### #46 — CRS configuration
**Type:** Docs / Won't Fix
**Source:** https://github.com/sghaskell/maps-plus/issues/46
Antarctic polar projection (`antarcticProj`) already covers the main custom CRS use case. Document what's available and close as by-design.

### #44 — Per-point heatmap color gradient
**Type:** Enhancement
**Source:** https://github.com/sghaskell/maps-plus/issues/44
`simpleheat` only supports a global gradient — per-point color mapping requires replacing HeatLayer with a custom canvas renderer. Complex; park until there's clear demand.
