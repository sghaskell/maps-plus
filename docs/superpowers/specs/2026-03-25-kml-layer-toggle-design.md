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
    var fg = L.featureGroup().addTo(this.map)
    if (this.isArgTrue(layerControl)) {
        this.control.addOverlay(fg, label)
    }
    this.fetchKmlAndMap(url, file, fg, this.paneZIndex)
    this.paneZIndex = this.paneZIndex - (i+1)
}, this)
```

### Change 2: `fetchKmlAndMap` signature

Replace the `map` parameter with `fg` (featureGroup). Change all `.addTo(map)` calls inside both the KMZ and KML code paths to `.addTo(fg)`. The pane/zIndex logic that currently calls `map.createPane` and `map.getPane` remains unchanged — those still reference `map` (passed separately or accessed via `fg._map` if needed; the current code passes `map` as a separate argument which stays available).

**Revised signature:** `fetchKmlAndMap(url, file, fg, paneZIndex)`

The internal `map` references for pane creation are resolved via `fg._map` or by keeping `map` as a closure variable — to be confirmed during implementation when reading the exact code.

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
| 3 | Network KMZ — stable public source | TBD during implementation |
| 4 | Mixed: local + two network files | `sample.kml, <kml-url>, <kmz-url>` |
| 5 | Scale: large KML dataset | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.kml` |

Each panel is paired with an HTML documentation panel describing what it tests and what to verify in the layer control.

---

## Bundled Sample KML (`contrib/kml/sample.kml`)

A minimal hand-crafted KML containing three named polygon features covering broad US regions (Northwest, Northeast, South). Used by Panel 1 and Panel 4 of the demo dashboard. Small and self-contained — no external dependency.

---

## Backwards Compatibility

- Existing dashboards without `layerControl` enabled are unaffected — the `addOverlay` call is gated on `this.isArgTrue(layerControl)`.
- Existing dashboards with `layerControl` enabled gain new toggleable entries for each KML file. This is additive behavior — visually a change but functionally an improvement, consistent with the stated purpose of the layer control.
- The `fetchKmlAndMap` signature change is internal — it is only called from one place in `updateView`.
