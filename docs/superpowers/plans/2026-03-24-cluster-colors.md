# Cluster Colors by clusterGroup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to assign distinct colors to each `clusterGroup` value via a formatter mapping and/or per-row SPL fields, with full fallback to existing threshold color behavior.

**Architecture:** A `parseColor` utility normalizes any CSS color string via canvas. A new `createMarkerStyleFromColor` injects per-group CSS classes verbatim (honoring user alpha). Color is resolved once per cluster group using a precedence chain: SPL fields → formatter named entry → formatter `default` → existing threshold behavior. The resolved color and sanitized class name are passed into `_createClusterGroup` which captures them in its `iconCreateFunction` closure.

**Tech Stack:** Leaflet, Underscore.js, jQuery, Webpack 5 / Babel 7 (build). No test framework — verify manually via browser dev tools and Splunk Docker.

**Spec:** `docs/superpowers/specs/2026-03-24-cluster-colors-design.md`

---

## File Map

| File | Change |
|---|---|
| `src/maps-plus.js` | Add `parseColor` (after line 912), add `createMarkerStyleFromColor` (after line 1030), add `parseClusterGroupColors` (after `createMarkerStyleFromColor`), update config defaults (~line 191), update config reading (~line 2054), update cluster group creation (~line 3153), update `_createClusterGroup` (~line 1531) |
| `formatter.html` | Add Cluster Colors control group with `clusterGroupColors` text input |
| `default/visualizations.conf` | Add `clusterGroupColors =` under `[maps-plus]` stanza |
| `appserver/static/visualizations/maps-plus/visualization.js` | Rebuilt artifact — commit after final build |

---

## Task 1: Add `parseColor` utility

**Files:**
- Modify: `src/maps-plus.js` — add after `hexToRgb` at line 912

- [ ] **Step 1: Add `parseColor` after `hexToRgb`**

Find the closing of `hexToRgb` (around line 920) and insert immediately after:

```javascript
// Normalize any CSS color string (hex, rgb, rgba, named) to the browser's
// canonical form ('#rrggbb' or 'rgba(r,g,b,a)'). Returns null for invalid input.
parseColor: function(str) {
    if (!str || !str.trim()) { return null }
    var ctx = document.createElement('canvas').getContext('2d')
    // Sentinel approach: invalid assignments leave fillStyle unchanged
    ctx.fillStyle = 'rgb(1,2,3)'
    var sentinel = ctx.fillStyle
    ctx.fillStyle = str.trim()
    if (ctx.fillStyle === sentinel && str.trim() !== 'rgb(1,2,3)') {
        console.warn('Maps+: invalid cluster color "' + str + '", ignoring')
        return null
    }
    return ctx.fillStyle
},
```

- [ ] **Step 2: Verify `parseColor` in browser console**

Build first (see Task 5 for build command). Then open Splunk, open the browser console, and run:

```javascript
// Access the visualization instance — adapt token to your dashboard
var viz = splunkjs.mvc.Components.getInstance('maps_plus_1')._viz
console.log(viz.parseColor('red'))           // expect: '#ff0000'
console.log(viz.parseColor('#E74C3C'))       // expect: '#e74c3c'
console.log(viz.parseColor('rgba(52,152,219,0.8)'))  // expect: 'rgba(52, 152, 219, 0.8)'
console.log(viz.parseColor('rgb(0,0,0)'))    // expect: '#000000' (valid black)
console.log(viz.parseColor('notacolor'))     // expect: null + console warning
```

- [ ] **Step 3: Commit**

```bash
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git commit -m "feat: add parseColor utility for CSS color normalization"
```

---

## Task 2: Add `createMarkerStyleFromColor` utility

**Files:**
- Modify: `src/maps-plus.js` — add after `createMarkerStyle` (~line 1030)

- [ ] **Step 1: Add `createMarkerStyleFromColor` after `createMarkerStyle`**

Find the closing of `createMarkerStyle` (the line after `this[cacheKey] = ...`) and insert immediately after:

```javascript
// Inject a per-group cluster CSS class using pre-normalized color strings from
// parseColor. Unlike createMarkerStyle, this does NOT call hexToRgb and does NOT
// override user-supplied alpha with 0.6.
createMarkerStyleFromColor: function(bgColor, fgColor, markerName) {
    var html = '.marker-cluster-' + markerName + ' { background-color: ' + bgColor + ';} ' +
               '.marker-cluster-' + markerName + ' div { background-color: ' + fgColor + ';}'
    var cacheKey = '_markerStyle_' + markerName
    if (this[cacheKey]) {
        this[cacheKey].html(html)
    } else {
        this[cacheKey] = $('<style>').prop('type', 'text/css').html(html).appendTo('head')
    }
},
```

- [ ] **Step 2: Commit**

```bash
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git commit -m "feat: add createMarkerStyleFromColor for per-group cluster CSS injection"
```

---

## Task 3: Add `parseClusterGroupColors` utility and formatter property

**Files:**
- Modify: `src/maps-plus.js` — add utility, add default, add config reading
- Modify: `formatter.html` — add Cluster Colors control group
- Modify: `default/visualizations.conf` — add property

- [ ] **Step 1: Add `parseClusterGroupColors` after `createMarkerStyleFromColor`**

```javascript
// Parse the clusterGroupColors formatter string into a color lookup map.
// Input format: "servers:#E74C3C, routers:rgba(52,152,219,0.8), default:red"
// Returns: { servers: '#e74c3c', routers: 'rgba(52, 152, 219, 0.8)', default: '#ff0000' }
// NOTE: Split on commas NOT inside parentheses so rgba(r,g,b,a) values are not broken.
parseClusterGroupColors: function(str) {
    var result = {}
    if (!str || !str.trim()) { return result }
    var self = this
    // Split on ',' only when not inside parentheses (handles rgba(r,g,b,a) values)
    str.split(/,(?![^(]*\))/).forEach(function(pair) {
        var idx = pair.indexOf(':')
        if (idx < 1) { return }
        var key = pair.substring(0, idx).trim()
        var val = pair.substring(idx + 1).trim()
        if (!key || !val) { return }
        var normalized = self.parseColor(val)
        if (normalized) { result[key] = normalized }
    })
    return result
},
```

- [ ] **Step 2: Add default value for `clusterGroupColors` in the defaults object**

Find the defaults object around line 191 (near `rangeOneBgColor`). Add:

```javascript
'display.visualizations.custom.leaflet_maps_app.maps-plus.clusterGroupColors': '',
```

- [ ] **Step 3: Add config reading in `updateView`**

Find the config reading block in `updateView` around line 2054 (near `rangeOneBgColor = ...`). Add:

```javascript
clusterGroupColors = this._getEscapedProperty('clusterGroupColors', config),
```

Then immediately after the `createMarkerStyle` calls around line 2205, add:

```javascript
// Parse per-group color mapping from formatter config.
// Declared here (before the per-row processing loop) so it is in scope at ~line 3153
// where cluster groups are created. JavaScript var hoisting ensures availability.
var clusterColorMap = this.parseClusterGroupColors(clusterGroupColors)
```

- [ ] **Step 4: Add `clusterGroupColors` to `formatter.html`**

Find the existing **Cluster** control group section in `formatter.html`. Add a new text input after the existing cluster color controls:

```html
<div class="controlgroup">
    <div class="controlgroup-title">Cluster Colors</div>
    <div class="controls">
        <div class="control">
            <label>Cluster Group Colors</label>
            <input type="text"
                   class="splunk-textinput"
                   data-name="clusterGroupColors"
                   data-default=""
                   placeholder="groupName:#hex, groupName:rgba(...), default:red" />
            <span class="help-block">Map clusterGroup values to colors. Use <code>default</code> as a fallback key.</span>
        </div>
    </div>
</div>
```

- [ ] **Step 5: Add property to `default/visualizations.conf`**

Find the `[maps-plus]` stanza. Add:

```ini
clusterGroupColors =
```

- [ ] **Step 6: Commit**

```bash
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git add formatter.html
git add default/visualizations.conf
git commit -m "feat: add clusterGroupColors formatter property and parser"
```

---

## Task 4: Resolve color at cluster group creation and update `_createClusterGroup`

**Files:**
- Modify: `src/maps-plus.js` — color resolution at ~line 3153, `_createClusterGroup` signature and body at ~line 1531

- [ ] **Step 1: Pass color context into `_createClusterGroup`**

Find the cluster group creation block around line 3153:

```javascript
if(_.isUndefined(this.clusterGroups[clusterGroup])) {
    var cg = this._createClusterGroup(disableClusteringAtZoom,
                                        disableClusteringAtZoomLevel,
                                        maxClusterRadius,
                                        maxSpiderfySize,
                                        ...
                                        antarcticProj,
                                        this)
```

Before this block, add color resolution:

```javascript
// Resolve per-group color: SPL fields > formatter named entry > formatter default > null
// If only one SPL field is provided, use it for both bg and fg.
var cgBgColor = null
var cgFgColor = null
if (_.has(userData, 'clusterBgColor') || _.has(userData, 'clusterFgColor')) {
    cgBgColor = _.has(userData, 'clusterBgColor') ? this.parseColor(userData['clusterBgColor']) : null
    cgFgColor = _.has(userData, 'clusterFgColor') ? this.parseColor(userData['clusterFgColor']) : null
    // Fall back: if one field is missing, use the other for both
    cgBgColor = cgBgColor || cgFgColor
    cgFgColor = cgFgColor || cgBgColor
} else if (clusterColorMap[clusterGroup]) {
    cgBgColor = clusterColorMap[clusterGroup]
    cgFgColor = clusterColorMap[clusterGroup]
} else if (clusterColorMap['default']) {
    cgBgColor = clusterColorMap['default']
    cgFgColor = clusterColorMap['default']
}

// Sanitize clusterGroup name for use as a CSS class suffix
var safeGroupName = clusterGroup.replace(/[^a-zA-Z0-9-_]/g, '-')
if (cgBgColor && (safeGroupName === 'one' || safeGroupName === 'two' || safeGroupName === 'three')) {
    console.warn('Maps+: clusterGroup name "' + clusterGroup + '" conflicts with reserved threshold class names. Colors may not apply correctly.')
}
```

Then add `cgBgColor`, `cgFgColor`, `safeGroupName` to the `_createClusterGroup` call:

```javascript
var cg = this._createClusterGroup(disableClusteringAtZoom,
                                    disableClusteringAtZoomLevel,
                                    maxClusterRadius,
                                    maxSpiderfySize,
                                    spiderfyDistanceMultiplier,
                                    singleMarkerMode,
                                    animate,
                                    warningThreshold,
                                    criticalThreshold,
                                    antarcticProj,
                                    cgBgColor,
                                    cgFgColor,
                                    safeGroupName,
                                    this)
```

- [ ] **Step 2: Update `_createClusterGroup` signature**

Find `_createClusterGroup: function(` around line 1531. Add the three new parameters at the end of the parameter list (before `context`):

```javascript
_createClusterGroup: function(disableClusteringAtZoom,
                              disableClusteringAtZoomLevel,
                              maxClusterRadius,
                              maxSpiderfySize,
                              spiderfyDistanceMultiplier,
                              singleMarkerMode,
                              animate,
                              warningThreshold,
                              criticalThreshold,
                              antarcticProj,
                              cgBgColor,
                              cgFgColor,
                              safeGroupName,
                              context) {
```

- [ ] **Step 3: Inject per-group CSS and update `iconCreateFunction`**

Inside `_createClusterGroup`, after the `L.MarkerCluster.include({...})` block and before `var mcg = new L.MarkerClusterGroup({`:

```javascript
// Inject per-group cluster CSS if colors are configured
if (cgBgColor && cgFgColor) {
    context.createMarkerStyleFromColor(cgBgColor, cgFgColor, safeGroupName)
}
```

Then update the `iconCreateFunction` inside `var mcg = new L.MarkerClusterGroup({`:

```javascript
iconCreateFunction: function(cluster) {
    var childCount = cluster.getChildCount()
    // Use per-group color class when configured; fall back to threshold classes
    if (cgBgColor) {
        return new L.DivIcon({
            html: '<div><span><b>' + childCount + '</span></div></b>',
            className: 'marker-cluster marker-cluster-' + safeGroupName,
            iconSize: new L.Point(40, 40)
        })
    }
    var c = ' marker-cluster-'
    if (childCount >= criticalThreshold) {
        c += 'three'
    } else if (childCount >= warningThreshold) {
        c += 'two'
    } else {
        c += 'one'
    }
    return new L.DivIcon({
        html: '<div><span><b>' + childCount + '</span></div></b>',
        className: 'marker-cluster' + c,
        iconSize: new L.Point(40, 40)
    })
}
```

- [ ] **Step 4: Commit**

```bash
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git commit -m "feat: resolve per-group cluster color and update _createClusterGroup"
```

---

## Task 5: Build, deploy, and verify end-to-end

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/visualization.js` — rebuilt artifact

- [ ] **Step 1: Build and commit artifacts**

Run from the repo/worktree root:

```bash
bash build_release.sh
```

This runs `webpack`, stages `visualization.js` and CSS artifacts, and commits them to the current branch. Also produces a `leaflet_maps_app_<version>.tar.gz` tarball — safe to ignore for testing.

- [ ] **Step 2: Deploy to Splunk Docker**

```bash
cd appserver/static/visualizations/maps-plus
bash scripts/deploy.sh
```

- [ ] **Step 3: Verify formatter field appears**

Open a Maps+ dashboard. Go to **Format → Cluster Colors**. Confirm the **Cluster Group Colors** text input is present.

- [ ] **Step 4: Verify formatter-driven colors**

Use a search with multiple `clusterGroup` values, e.g.:

```spl
| makeresults count=50
| eval latitude=random()%10+40, longitude=random()%10-80
| eval clusterGroup=if(random()%2=0,"servers","routers")
```

In **Format → Cluster Colors**, set:
```
servers:#E74C3C, routers:#3498DB
```

Expected: server clusters render red, router clusters render blue, both at all sizes uniformly.

- [ ] **Step 5: Verify SPL field override**

Add `clusterBgColor` and `clusterFgColor` to the search:

```spl
| makeresults count=50
| eval latitude=random()%10+40, longitude=random()%10-80
| eval clusterGroup="servers", clusterBgColor="#9B59B6", clusterFgColor="#8E44AD"
```

Expected: SPL color overrides any formatter setting — clusters render purple.

- [ ] **Step 6: Verify fallback to threshold behavior**

Remove `clusterGroupColors` from the formatter (set to empty). Confirm existing clusters still render with the `rangeOne/Two/Three` threshold colors.

- [ ] **Step 7: Verify `default` fallback key**

Set formatter to `default:#2ECC71`. Use a search with a `clusterGroup` value not listed in the mapping. Expected: that group's clusters render green.

- [ ] **Step 8: Verify rgba and named colors work**

Set formatter to `servers:rgba(231,76,60,0.4), routers:steelblue`. Expected: servers render with 0.4 alpha (visibly more transparent), routers render steelblue.

- [ ] **Step 9: Confirm artifacts committed**

`build_release.sh` (Step 1) already committed `visualization.js` and CSS artifacts to the branch. Verify with `git log --oneline -3` — you should see a `chore: build artifacts for v...` commit.

---

## Task 6: Update backlog and release notes

**Files:**
- Modify: `docs/backlog.md`
- Create: `docs/release-notes-4.5.1.md` (if not yet started)

- [ ] **Step 1: Mark #39 closed in backlog**

In `docs/backlog.md`, update the `#39` entry under P2 to add `✅ CLOSED` and a brief resolution note consistent with the other closed items.

- [ ] **Step 2: Draft release notes entry**

Create or update `docs/release-notes-4.5.1.md` with an entry for this feature. Follow the style of `docs/release-notes-4.5.0.md`:

```markdown
### Cluster Colors by clusterGroup

Clusters can now be colored per `clusterGroup` value. Configure colors in **Format → Cluster Colors** using a comma-separated mapping:

```
servers:#E74C3C, routers:#3498DB, default:#95A5A6
```

Per-row SPL fields `clusterBgColor` and `clusterFgColor` override the formatter setting for a specific group. All CSS color formats are accepted: hex, `rgb()`, `rgba()`, and CSS named colors. Dashboards without these fields continue to use the existing threshold-based color scheme unchanged.
```

- [ ] **Step 3: Commit**

```bash
git add docs/backlog.md docs/release-notes-4.5.1.md
git commit -m "docs: mark #39 closed, add cluster colors to 4.5.1 release notes"
```
