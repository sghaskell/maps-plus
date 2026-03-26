# KML/KMZ Layer Control Toggle — Design Spec

**Date:** 2026-03-25
**Issue:** #41
**Target release:** v4.5.1 (merged with cluster colors)

---

## Overview

KML and KMZ overlays loaded via the `kmlOverlay` formatter field are currently added directly to the map with no layer control entry. Users cannot toggle their visibility without removing them from the formatter. This change adds each KML/KMZ file as a named, toggleable entry in the layer control — consistent with how heatmap, path, and feature layers already behave.

---

## Root Cause

`fetchKmlAndMap` calls `L.geoJson(...).addTo(map)` inside an async callback, bypassing `addLayerToControl` entirely. The fix wraps each file's features in a `L.featureGroup`, registers it with the layer control synchronously (before the async fetch completes), then populates it inside the callback. Leaflet handles empty groups registered with the control; features added later are toggleable automatically.

---

## Label Extraction

Each layer control entry is labeled by the file's basename with extension stripped:

```javascript
var label = file.split('/').pop().replace(/\.[^.]+$/, '')
```

Works for both local filenames (`states.kml` → `states`) and full URLs (`https://example.com/path/regions.kmz` → `regions`). No user-configurable override — users manage the KML filename itself to control the label.

---

## Implementation

### Change 1: `kmlOverlay` loading loop in `updateView`

Replace the existing `_.each` loop body with a version that creates and registers a feature group per file before launching the async fetch:

```javascript
_.each(kmlFiles.reverse(), function(file, i) {
    var url = /^https?:\/\//.test(file) ? file : location.origin + this.contribUri + '/kml/' + file
    var label = file.split('/').pop().replace(/\.[^.]+$/, '')
    // Always add to map so KML renders even when layerControl is disabled
    var fg = L.featureGroup().addTo(this.map)
    if (this.isArgTrue(layerControl)) {
        this.control.addOverlay(fg, label)
    }
    this.fetchKmlAndMap(url, file, fg, this.paneZIndex)
    // Decrement matches existing behavior: each file gets a unique pane z-index
    this.paneZIndex = this.paneZIndex - (i+1)
}, this)
```

### Change 2: `fetchKmlAndMap` signature + pre-existing bug fixes

Replace the `map` parameter with `fg` (featureGroup). Change all `.addTo(map)` calls inside both the KMZ and KML code paths to `.addTo(fg)`. All other `map.*` references — `map.createPane`, `map.getPane`, and `.style.zIndex` — change to `this.map` (the visualization object's map property, always accessible inside any method on `this`).

**Revised signature:** `fetchKmlAndMap(url, file, fg, paneZIndex)`

**How `this.map` stays valid inside async callbacks:** The `L.featureGroup()` is added to `this.map` synchronously before `fetchKmlAndMap` is called. By the time any async callback (JSZip promise or jQuery AJAX `.done()`) fires, `this.map` is fully initialized and stable. No reliance on `fg._map` is needed.

While editing `fetchKmlAndMap`, also fix the following pre-existing bugs:

**Bug A — KMZ errors silently swallowed:** The `e` parameter from `JSZipUtils.getBinaryContent` is never checked, and the `.then()` chain has no `.catch()`. A network failure or malformed KMZ produces no console output. Fix: check `e` at the top of the callback and log + return early; add `.catch()` to the promise chain with a `console.error`.

**Bug B — No null guard on KML-inside-KMZ extraction:** `zip.file(/.*\.kml/)[0].async("string")` throws if the KMZ contains no `.kml` file. Fix: assign to a variable and throw a descriptive error if `undefined`, which the `.catch()` added in Bug A will surface.

**Bug C — Duplicate `style` / `onEachFeature` logic:** Both the KMZ and KML code paths contain identical `style` and `onEachFeature` callbacks (~20 lines each). Extract both into named local variables before the `if/else` block and reference them in both paths.

**Note — Pane name collision (no fix, add comment):** Features across different KML files that share the same `name` property will share a Leaflet pane, and the second file's `paneZIndex` will overwrite the first. This is an edge case; no fix is required, but add an inline comment so future maintainers understand the behavior.

---

## Files Changed

| File | Change |
|---|---|
| `src/maps-plus.js` | Update `kmlOverlay` loop and `fetchKmlAndMap` signature/body |
| `contrib/kml/sample.kml` | New bundled sample KML with 3 named US region polygons |
| `default/data/ui/views/kml_overlay.xml` | New demo dashboard (5 panels) |
| `appserver/static/visualizations/maps-plus/visualization.js` | Rebuilt artifact |

---

## Demo Dashboard (`kml_overlay.xml`)

Five panels, each centered on the continental US using `makeresults count=1 | eval latitude=39.5, longitude=-98.35`:

| Panel | Scenario | `kmlOverlay` value |
|---|---|---|
| 1 | Local KML from `contrib/kml/` | `sample.kml` |
| 2 | Network KML — USGS earthquake feed | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.kml` |
| 3 | Network KMZ — stable public source | Implementer to select at implementation time: candidate sources are NOAA National Weather Service products or US Census Bureau TIGER boundary data. Any stable publicly-accessible KMZ URL is acceptable. |
| 4 | Mixed: local + two network files | `sample.kml, <kml-url>, <kmz-url>` (use Panel 2 KML URL and Panel 3 KMZ URL) |
| 5 | Scale: large KML dataset | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.kml` |

Each panel is paired with an HTML documentation panel describing what it tests and what to verify in the layer control.

---

## Bundled Sample KML (`contrib/kml/sample.kml`)

A minimal hand-crafted KML containing three named polygon features covering broad US regions (Northwest, Northeast, South). Used by Panel 1 and Panel 4 of the demo dashboard. Small and self-contained — no external dependency.

---

## Backwards Compatibility

- Existing dashboards without `layerControl` enabled are unaffected — the `addOverlay` call is gated on `this.isArgTrue(layerControl)`. KML features still render because `fg.addTo(this.map)` is called unconditionally.
- Existing dashboards with `layerControl` enabled gain new toggleable entries for each KML file. This is additive behavior — visually a change but functionally an improvement, consistent with the stated purpose of the layer control.
- The `fetchKmlAndMap` signature change is internal — it is only called from one place in `updateView`.

## Known Gaps (Out of Scope)

- **Pane name collision:** Features from different KML files that share the same `name` property will share a Leaflet pane; the last file to process that name sets the z-index. Low probability in practice; documented with an inline comment in the code.
