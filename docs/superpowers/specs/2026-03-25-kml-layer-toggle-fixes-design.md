# KML Layer Toggle — Bug Fixes & Dashboard Improvements

**Date:** 2026-03-25
**Branch:** `feature/kml-layer-toggle`
**Relates to:** `2026-03-25-kml-layer-toggle-design.md` (original feature spec)

---

## Overview

The KML layer toggle feature (issue #41) is implemented but has one outstanding bug: the layer control widget does not appear on first dashboard load. This spec covers the fix for that bug and improvements to the test dashboard.

---

## Bug Fix — Layer Control Not Visible on First Load

### Symptom

Fresh dashboard load: map renders, layer control is not visible. After clicking in the formatter panel, a layer control appears but is empty and blinks.

### Root Cause

`this.control.addTo(this.map)` at line 3246 runs on **every** `updateView` call. Each call to `addTo` appends a duplicate copy of the control's DOM node — it does not detect an already-mounted control. This creates duplicate controls on every search refresh. More critically, on first load Splunk sometimes delivers two rapid `updateView` calls — one with defaults and one with real config — and the accumulating duplicate nodes leave the control in an empty or invisible state.

### Fix

**Move `this.control.addTo(this.map)` inside the `!isInitializedDom` block.**

`this.control` is already created inside `!isInitializedDom` (at line 2561). Move the `addTo` call to immediately follow creation, gated on `layerControl` being enabled. This mounts the control exactly once during map initialization.

```javascript
// Inside !isInitializedDom, after this.control is created:
if (this.isArgTrue(layerControl)) {
    this.control.options.collapsed = this.isArgTrue(layerControlCollapsed)
    this.control.addTo(this.map)
    if (this.isDarkTheme) { this._darkModeUpdate() }
}
```

Remove the duplicate block at line 3246 (currently outside `!isInitializedDom`).

**Why subsequent `addOverlay` calls still work:**

When `addOverlay` is called on a control that is already mounted on a map, Leaflet automatically calls `_update()`, which rebuilds the checkbox list in place — no re-mount required. The kmlOverlay block (lines 2695–2721) calls `addOverlay` after init, so entries appear correctly on second and later `updateView` calls.

**`layerControl: false` on first load:**

If `layerControl` is false on the first `updateView` call, the `addTo` is correctly skipped at init and the control is never mounted. If the user later enables it via the formatter, the existing config-change handler at line 655 mounts the control at that point — this path is unaffected by the fix.

**Existing config-change handlers are unaffected:**

Lines 651–655 already handle `layerControl` being toggled via the formatter: `this.control.remove()` when disabled, `this.control.addTo(this.map)` when re-enabled. These are inside the `isInitializedDom` block and run only when the value changes. No changes needed there.

**Known limitation — `layerControlCollapsed` after init:**

`layerControlCollapsed` is applied via `this.control.options.collapsed` before `addTo` at init. The control reads this option during `onAdd`. Moving `addTo` inside `!isInitializedDom` means subsequent changes to `layerControlCollapsed` via the formatter will not re-apply the collapsed state. This is a pre-existing limitation in the collapsed-state config-change handler (lines 760–764) and is out of scope for this fix.

---

## Test Dashboard Improvements

### Current State

5 panels, all using `cartodb_light`. Panels 1–2 were verified. Panels 3–5 were untested at handoff.

### Changes

**Add Panel 6 — Default tile regression test**

A new panel with no `mapTile` option set. Verifies the visualization defaults to CartoDB Light tiles, not OpenStreetMap. Regression test for issue #47.

- Query: `| makeresults count=1 | eval latitude=39.5, longitude=-98.35`
- No `mapTile` option
- Description panel: "No `mapTile` option is set. Verify the map uses CartoDB Light tiles (not OpenStreetMap). Regression test for issue #47."

**No other panel changes.** Panels 1–5 are correct as-is. Panel 3 (local KMZ) is a priority verification target since it was untested at handoff.

### Final Panel Layout

| Panel | Scenario | Source | Key verification |
|---|---|---|---|
| 1 | Local KML | `sample.kml` | 3 polygons, toggle, popup |
| 2 | Network KML | NASA WorldWind | URL fetch, CORS, toggle |
| 3 | Local KMZ | `sample.kmz` | JSZip extraction, toggle |
| 4 | Mixed sources | KML + KML + KMZ | 3 independent entries |
| 5 | Backwards compat | NASA KML, `layerControl: false` | Features render, no widget |
| 6 | Default tile | No `mapTile` set | CartoDB Light (not OSM) |

---

## Files Changed

| File | Change |
|---|---|
| `src/maps-plus.js` | Move `this.control.addTo(this.map)` inside `!isInitializedDom`; remove duplicate at line 3246 |
| `default/data/ui/views/kml_overlay.xml` | Add Panel 6 |

---

## Verification Checklist

After implementing:

1. Fresh load of `kml_overlay` dashboard — layer control appears without clicking in formatter
2. Panel 1: 3 polygons visible, toggle works, popup works
3. Panel 2: NASA features visible, toggle works, no console errors
4. Panel 3: 3 polygons visible (from KMZ), toggle works, no console errors
5. Panel 4: 3 independent layer control entries, each toggles independently
6. Panel 5: KML features visible, no layer control widget present
7. Panel 6: Map uses CartoDB Light tiles, no OSM tile requests in network tab
8. Search refresh (wait for re-render): layer control entries persist, no blink
