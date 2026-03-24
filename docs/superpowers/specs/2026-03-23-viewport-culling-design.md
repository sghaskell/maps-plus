# Viewport Culling — Design Spec

## Goal

Reduce DOM node count at low zoom levels when 25k+ markers are unclustered, improving pan and zoom performance on both raster and vector tile backends.

## Background

`_createClusterGroup()` in `src/maps-plus.js` creates all leaflet-markercluster groups with `removeOutsideVisibleBounds: false`. This means all markers remain in the DOM regardless of whether they are visible in the current viewport. At zoom levels past `disableClusteringAtZoom`, all 25k+ markers render as individual DOM nodes, causing significant slowdown.

leaflet-markercluster has built-in support for viewport culling via `removeOutsideVisibleBounds: true`, which removes markers from the DOM as they leave the viewport (plus a 50px buffer) and re-adds them as they enter. This applies to both the clustered state and the fully-unclustered state.

## Change

**File:** `src/maps-plus.js`
**Function:** `_createClusterGroup()` (~line 1561)
**Change:** `removeOutsideVisibleBounds: false` → `removeOutsideVisibleBounds: true`

No other changes required. No new event handlers, no caching, no pipeline changes. The existing `chunkedLoading: true` on cluster groups already handles initial render performance and pairs well with this change.

## Trade-offs

- **Pop-in effect:** Markers may visibly appear as you pan into a new area. The 50px buffer reduces this. Acceptable trade-off for 25k+ marker datasets.
- **Non-clustered featureGroup markers** (explicitly non-clustered via data field) are unaffected — they are in plain `L.featureGroup` layers, not cluster groups. If these become a performance issue, a separate feature branch is the right approach.

## Testing

1. Load a 25k+ marker dataset with clustering enabled and `disableClusteringAtZoom` set to zoom 16.
2. Zoom to level 16+ — verify markers render without lag.
3. Pan at zoom 16+ — verify performance is acceptable, note any pop-in.
4. Zoom back out — verify clustering resumes correctly.
5. Repeat on both raster and OpenFreeMap vector tile backends.
