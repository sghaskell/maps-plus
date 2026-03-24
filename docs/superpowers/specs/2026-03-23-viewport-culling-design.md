# Viewport Culling — Design Spec

## Goal

Reduce DOM node count at low zoom levels when 25k+ markers are unclustered, improving pan and zoom performance on both raster and vector tile backends.

## Background

`_createClusterGroup()` in `src/maps-plus.js` creates all leaflet-markercluster groups with `removeOutsideVisibleBounds: false`. This means all markers remain in the DOM regardless of whether they are visible in the current viewport. At zoom levels past `disableClusteringAtZoom`, all 25k+ markers render as individual DOM nodes, causing significant slowdown.

leaflet-markercluster has built-in support for viewport culling via `removeOutsideVisibleBounds: true`, which removes markers from the DOM as they leave the viewport (plus a 50px buffer) and re-adds them as they enter. This applies to both the clustered state and the fully-unclustered state past the zoom threshold.

## Change

**File:** `src/maps-plus.js`
**Function:** `_createClusterGroup()` (~line 1561)
**Change:** `removeOutsideVisibleBounds: false` → `removeOutsideVisibleBounds: true`

### Existing overrides to preserve

Lines 1578–1580 already override `removeOutsideVisibleBounds` back to `false` when `antarcticProj` is enabled:

```js
if(this.isArgTrue(antarcticProj)) {
    mcg.options.removeOutsideVisibleBounds = false
}
```

This override must be left in place. The Antarctic polar projection uses a custom CRS (`proj4leaflet`) and the viewport bounds geometry does not behave correctly with standard Leaflet bounds checking — culling would remove visible markers. This is a deliberate carve-out.

### Second MCG instantiation

Lines 2520–2540 create a separate `this.markers` MarkerClusterGroup (used for lasso/polygon selection) that already has `removeOutsideVisibleBounds: true`. This group is not in the main rendering pipeline and does not need to change.

### Config hot-reload path

When `disableClusteringAtZoom` changes at runtime (~lines 624–635), `clearLayers()` and `addLayers()` are called on the live cluster group. The `removeOutsideVisibleBounds` setting is on the instantiated options object and persists through this path correctly. `addLayers()` is `chunkedLoading`-aware, so re-adding large sets after a config change continues to work.

## Scope

This change affects `MarkerClusterGroup` instances only. The following layer types are unaffected:

- Explicitly non-clustered markers in `L.featureGroup` layers (`_addUnclustered` path)
- WKT feature layers
- Path layers
- Heatmap layers
- Feature (GeoJSON) layers

If non-clustered featureGroup markers become a performance issue, a separate feature branch is the right approach.

## Trade-offs

- **Pop-in effect:** Markers may visibly appear as you pan into a new area, particularly during rapid panning in a single direction where the 50px buffer is consumed before chunked re-add completes. Acceptable trade-off for 25k+ marker datasets.
- The `chunkedLoading: true` already set on cluster groups pairs correctly with viewport culling.

## Testing

1. Load a 25k+ marker dataset with clustering enabled and `disableClusteringAtZoom` set (e.g., zoom 16).
2. At a zoom level below the threshold (clustering active): pan across the map. Verify clusters render correctly and no markers disappear unexpectedly.
3. Zoom to level 16+ (unclustered state): verify markers render without visible frame drops. In Chrome DevTools Performance panel with 4x CPU throttle, panning should not produce sustained frame drops below 30fps.
4. Pan at zoom 16+: verify performance is improved vs. baseline. Note any pop-in.
5. Zoom back out: verify clustering resumes correctly.
6. Enable Antarctic projection: verify markers remain visible and culling does not incorrectly remove them.
7. Change `disableClusteringAtZoom` setting via formatter while map is displayed: verify cluster groups re-render correctly.
8. Repeat steps 2–5 on both raster and OpenFreeMap vector tile backends.
