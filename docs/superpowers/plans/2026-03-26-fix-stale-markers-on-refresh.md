# Fix: Stale Markers on Panel Refresh (Issue #10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear stale markers from layer groups before each new render cycle so tooltip content (and all marker data) updates correctly when a Simple XML panel auto-refreshes.

**Architecture:** Two small edits to `src/maps-plus.js`. (1) `formatData` detects the start of a new render cycle and resets a `_markersCleared` flag. (2) `updateView` checks that flag and, if not yet cleared, empties all layer groups and marker lists in place before the per-row loop runs — keeping the same `L.featureGroup()` objects so layer control visibility state is preserved.

**Tech Stack:** Leaflet, `leaflet.markercluster`, Underscore.js, Webpack 5 + Babel 7 (build only)

---

## Scope note

The design spec stated that `this.heatLayers`, `this.pathLineLayers`, and `this.featureLayers` are reset on every render (outside `isInitializedDom`). Code reading shows they are actually inside the `isInitializedDom` block and therefore also accumulate on refresh — but that is a separate bug not reported in issue #10. This plan addresses only `layerFilter` / `clusterGroups` (the source of the tooltip regression).

---

## Files

| File | Change |
|------|--------|
| `appserver/static/visualizations/maps-plus/src/maps-plus.js` | Modify `formatData` (~line 2122) and `updateView` (~line 2970) |
| `appserver/static/visualizations/maps-plus/visualization.js` | Rebuilt by `npm run build` — commit the new bundle |

---

## Task 1: Create the feature branch

**Files:** none

- [ ] **Step 1: Create and check out branch**

```bash
cd C:/Users/scott/Documents/maps-plus
git checkout develop
git checkout -b feature/fix-stale-markers-refresh
```

Expected: `Switched to a new branch 'feature/fix-stale-markers-refresh'`

---

## Task 2: Add `_markersCleared` reset to `formatData`

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js` (~line 2112)

`formatData` is called by the Splunk base before each `updateView` call. It already manages `allDataProcessed`. We use the transition from `allDataProcessed = true` (previous search finished) to receiving new data as the signal that a new render cycle is starting — and reset `_markersCleared` so the clear block in `updateView` fires once for the new cycle.

- [ ] **Step 1: Open the file and locate `formatData`**

It starts at approximately line 2112. The full current function is:

```js
formatData: function(data) {
    if(data.results.length == 0 && data.fields.length >= 1 && data.meta.done){
        this.allDataProcessed = true
        return this
    }

    if(data.results.length == 0)  {
        return this
    }

    this.allDataProcessed = false
    return data
},
```

- [ ] **Step 2: Replace the function body**

Replace the `this.allDataProcessed = false` line so it reads:

```js
formatData: function(data) {
    if(data.results.length == 0 && data.fields.length >= 1 && data.meta.done){
        this.allDataProcessed = true
        return this
    }

    if(data.results.length == 0)  {
        return this
    }

    // If the previous render cycle completed, reset the clear flag so the
    // clear-in-place block in updateView fires once at the start of this cycle.
    if (this.allDataProcessed) {
        this._markersCleared = false
    }
    this.allDataProcessed = false
    return data
},
```

**Why this works:**
- After the first render completes: `allDataProcessed = true`
- Next search, first chunk: `allDataProcessed` is `true` → set `_markersCleared = false`, then set `allDataProcessed = false`
- `updateView` fires: sees `!_markersCleared`, clears groups, sets `_markersCleared = true`
- Second chunk of same search: `allDataProcessed` is now `false` → `_markersCleared` is NOT reset → clear block is skipped ✓
- First render ever: `allDataProcessed` is `undefined` (falsy) → `_markersCleared` is not set → clear block does not fire (because `isInitializedDom` is also `false`) ✓

- [ ] **Step 3: Commit**

```bash
cd C:/Users/scott/Documents/maps-plus
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git commit -m "fix: reset _markersCleared flag in formatData on new render cycle"
```

---

## Task 3: Add clear-in-place block to `updateView`

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js` (~line 2970)

The insertion point is in `updateView`, just before the `BEGIN PROCESSING DATA` comment and the `_.each(dataRows, ...)` per-row loop. The surrounding context looks like:

```js
    this.allDataPoints = {
        "type": "FeatureCollection",
        "features": []
    };



    /********* BEGIN PROCESSING DATA **********/

    // Iterate through each row creating layer groups per icon type
    _.each(dataRows, function(userData, i) {
```

- [ ] **Step 1: Insert the clear-in-place block**

Add the following block between `this.allDataPoints = {...}` and the `BEGIN PROCESSING DATA` comment:

```js
    this.allDataPoints = {
        "type": "FeatureCollection",
        "features": []
    };

    // Clear stale markers from all layer groups before re-populating.
    // Fires once per render cycle (gated by _markersCleared, reset in formatData).
    // Keeps the same L.featureGroup() objects so layer control visibility is preserved.
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



    /********* BEGIN PROCESSING DATA **********/

    // Iterate through each row creating layer groups per icon type
    _.each(dataRows, function(userData, i) {
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/scott/Documents/maps-plus
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git commit -m "fix: clear stale markers before each render cycle in updateView (issue #10)"
```

---

## Task 4: Build and verify

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/visualization.js` (rebuilt artifact)

- [ ] **Step 1: Install dependencies (if needed)**

```bash
cd C:/Users/scott/Documents/maps-plus/appserver/static/visualizations/maps-plus
npm install --ignore-scripts
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: build completes with no errors. `visualization.js` is updated.

- [ ] **Step 3: Deploy to Splunk**

```bash
npm run deploy
```

- [ ] **Step 4: Manual verification — tooltip updates**

1. Open a Simple XML dashboard with a Maps+ panel
2. Set panel refresh interval to 1 minute
3. Include `now()` (or any time-based value) as the `tooltip` SPL field
4. Note the tooltip value on first load
5. Wait for one refresh cycle
6. Hover a marker — confirm the tooltip shows the updated value

- [ ] **Step 5: Manual verification — layer visibility preserved**

1. On the same dashboard, toggle a layer group off in the layer control
2. Wait for one refresh cycle
3. Confirm the layer remains hidden after refresh

- [ ] **Step 6: Manual verification — no duplicate markers**

1. After 2–3 refresh cycles, confirm marker counts look correct (no visual pile-up)
2. Open browser devtools → check there are no obvious JS errors in the console

- [ ] **Step 7: Commit the rebuilt bundle**

```bash
cd C:/Users/scott/Documents/maps-plus
git add appserver/static/visualizations/maps-plus/visualization.js
git commit -m "chore: rebuild visualization bundle for stale markers fix"
```

---

## Task 5: Open pull request

- [ ] **Step 1: Push branch**

```bash
cd C:/Users/scott/Documents/maps-plus
git push -u origin feature/fix-stale-markers-refresh
```

- [ ] **Step 2: Open PR targeting `develop`**

Title: `fix: clear stale markers on panel refresh (issue #10)`

Body:
```
Fixes #10 — tooltip content (and all marker data) was frozen at
initial values when a Simple XML panel auto-refreshed.

Root cause: `layerFilter` and `clusterGroups` were only initialized
inside the `!isInitializedDom` block (first render only). On subsequent
`updateView` calls, new markers were pushed into existing layer groups
that still held old markers, so stale markers accumulated under fresh
ones.

Fix: clear-in-place before the per-row loop on each new render cycle.
The same `L.featureGroup()` objects are reused so layer control
visibility state is preserved across refreshes.
```
