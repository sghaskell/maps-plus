# Design: Fix Stale Markers on Panel Refresh (Issue #10)

## Problem

When a Maps+ panel has an auto-refresh interval set in Simple XML, tooltips and marker content freeze at their initial values and never update. The underlying search re-runs and returns fresh data, but the map continues showing stale content.

**Root cause:** `updateView` is called with fresh data on every refresh, but `this.layerFilter` and `this.clusterGroups` are only initialized inside the `if (!this.isInitializedDom)` block — which only runs once. On every subsequent call, the per-row loop pushes new markers into the same layer groups that already contain the old markers. Old markers accumulate under new ones; the tooltip the user sees is from the stale first-render marker.

**Why HTML dashboard mode works:** Splunk destroys and recreates the visualization component on refresh, resetting `isInitializedDom = false` and running the full init path. Simple XML keeps the instance alive and only calls `updateView` again.

**Note:** `this.pathLineLayers`, `this.heatLayers`, and `this.featureLayers` are already reset to `{}` on every render (lines 2753–2759, outside the `isInitializedDom` block) — no change needed there.

## Approach: Clear-in-place

Keep the same `L.featureGroup()` objects but empty their markers before each render cycle. Do **not** reset `this.layerFilter` to `{}`.

Resetting `this.layerFilter = {}` (as originally proposed) would cause the per-row loop to create new featureGroup objects each refresh, orphaning the old ones on the map and losing any layer control visibility state the user had set.

## Design

### Section 1 — The change

Add a clear-in-place block to `updateView` in `src/maps-plus.js`, just before the per-row data processing loop (after config is read, after the `isInitializedDom` guard):

```js
if (this.isInitializedDom && this.layerFilter && !this._markersCleared) {
    _.each(this.layerFilter, function(lf) {
        if (lf.group) { lf.group.clearLayers() }
        if (lf.markerList) { lf.markerList = [] }
        if (lf.clusterGroup) {
            _.each(lf.clusterGroup, function(cg) {
                cg.cg.clearLayers()
                cg.markerList = []
            })
        }
    })
    this._markersCleared = true
}
```

Reset `this._markersCleared = false` alongside the other per-cycle state resets (`allDataProcessed`, `offset`) near line 2764, so chunked data loads only trigger one clear per render cycle.

`this.clusterGroups` itself does not need to be reset — cluster group objects are referenced from within `layerFilter` entries and are cleared in place via `cg.cg.clearLayers()`. The `_.isUndefined(this.clusterGroups[clusterGroup])` guard in the per-row loop will correctly skip re-creating them.

### Section 2 — State preserved vs. cleared

**Preserved:**
- Map zoom level and center position — `L.Map` object is never recreated
- Layer control visibility toggles — same `L.featureGroup()` objects are reused
- Tile layer — untouched
- Geoman drawing tools and drawn shapes — on a separate `selectingMarkersLayer`, unaffected
- Measure tool — separate control, unaffected
- KML overlays — managed by their own `_loadedKmlOverlay` change-detection guard

**Cleared:**
- Markers in all layer groups — old markers removed, new markers built from fresh search results
- `markerList` arrays on each layer group and cluster group — rebuilt each render
- Cluster group marker lists — cleared so clusters recompute correctly with new markers

### Section 3 — Chunked data edge case

`updateView` is called multiple times per search cycle when results arrive in chunks. The clear must only fire once per cycle — at the start of the first chunk — not on every chunk call.

The `_markersCleared` flag gates the clear block. It is set to `true` immediately after clearing, and reset to `false` at the start of each new render cycle alongside `allDataProcessed = false` and `offset = 0`.

## Verification

Manual only (no automated tests in this project):

1. Build and deploy: `npm run build` → `npm run deploy`
2. Open a Simple XML dashboard with a Maps+ panel set to a 1-minute refresh interval
3. Set the `tooltip` SPL field to a time-based value (e.g., `now()` formatted as a string)
4. Wait for one refresh cycle — confirm the tooltip updates to the new value
5. Toggle a layer group off in the layer control, wait for refresh — confirm it stays hidden
6. Confirm no duplicate markers appear after multiple refresh cycles

## Branching

Create a feature branch off `develop` for this work:

```bash
git checkout develop && git checkout -b feature/fix-stale-markers-refresh
```

Merge back to `develop` via PR when complete. This is not a hotfix — no need to branch off `master`.

## Out of Scope

- **Geoman token freshness on refresh:** If a user draws a shape that selects markers within a region, the associated Splunk tokens do not auto-update when data refreshes. This is pre-existing behavior and a separate concern.
- **Chunked data loading simplification:** The `offset`/`chunk` multi-call pattern may be vestigial in modern Splunk. Worth a separate investigation and potential refactor after this fix lands.
