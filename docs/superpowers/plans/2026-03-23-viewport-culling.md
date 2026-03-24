# Viewport Culling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable leaflet-markercluster's built-in viewport culling so markers outside the visible map area are removed from the DOM, fixing performance at high zoom levels with 25k+ markers.

**Architecture:** One-line change in `_createClusterGroup()` — flip `removeOutsideVisibleBounds` from `false` to `true`. The Antarctic projection override at lines 1578–1580 that sets it back to `false` must be left untouched. No new code, no new event handlers, no pipeline changes.

**Tech Stack:** Leaflet, leaflet-markercluster, Webpack 5, Splunk custom visualization AMD module

---

### Task 1: Create feature branch

**Files:**
- No file changes — git only

- [ ] **Step 1: Create and switch to feature branch**

```bash
cd C:/Users/scott/Documents/maps-plus
git checkout -b feature/viewport-culling
```

Expected: `Switched to a new branch 'feature/viewport-culling'`

---

### Task 2: Enable `removeOutsideVisibleBounds`

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js` (~line 1561)

- [ ] **Step 1: Find the exact line**

Search for `removeOutsideVisibleBounds: false` in `src/maps-plus.js`. There are two occurrences:
- ~line 1561: inside `_createClusterGroup()` — **this is the one to change**
- ~line 1579: inside an `if(this.isArgTrue(antarcticProj))` block — **do not touch this one**

- [ ] **Step 2: Make the change**

In `_createClusterGroup()`, change:
```js
removeOutsideVisibleBounds: false,
```
to:
```js
removeOutsideVisibleBounds: true,
```

Verify the antarcticProj override at lines 1578–1580 is still `false` and untouched:
```js
if(this.isArgTrue(antarcticProj)) {
    mcg.options.removeOutsideVisibleBounds = false
}
```

- [ ] **Step 3: Build**

```bash
cd appserver/static/visualizations/maps-plus
npm run build
```

Expected: `webpack compiled successfully`

- [ ] **Step 4: Commit**

```bash
cd C:/Users/scott/Documents/maps-plus
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git add appserver/static/visualizations/maps-plus/visualization.js*
git commit -m "perf: enable removeOutsideVisibleBounds on marker cluster groups"
```

---

### Task 3: Deploy and verify

**Files:**
- No code changes — deploy and manual test only

- [ ] **Step 1: Deploy to Splunk container**

```bash
cd appserver/static/visualizations/maps-plus
npm run deploy
```

Expected: `Done. Hard-refresh your browser (Ctrl+Shift+R) to pick up changes.`

- [ ] **Step 2: Hard-refresh browser** (`Ctrl+Shift+R`)

- [ ] **Step 3: Run manual verification**

Using a 25k+ marker dataset with clustering enabled and `disableClusteringAtZoom` set (e.g., zoom 16):

1. At zoom below the threshold (clusters visible): pan around. Clusters should render correctly. No markers should disappear unexpectedly.
2. Zoom to level 16+ (unclustered): markers should render. Open Chrome DevTools → Performance → record while panning. With 4x CPU throttle, panning should not produce sustained drops below 30fps.
3. Pan at zoom 16+: note whether performance is improved vs. before. Some pop-in as markers re-enter the viewport is expected and acceptable.
4. Zoom back out: clustering should resume correctly.
5. If Antarctic projection is available: enable it and verify markers remain visible (culling should not remove visible polar markers).
6. Change `disableClusteringAtZoom` level via the formatter while the map is displayed: cluster groups should re-render correctly.
7. Repeat on both raster tiles and OpenFreeMap vector tiles.

- [ ] **Step 4: Merge to develop**

If verification passes:

```bash
cd C:/Users/scott/Documents/maps-plus
git checkout develop
git merge feature/viewport-culling
git branch -d feature/viewport-culling
```
