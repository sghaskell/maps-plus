# OpenFreeMap Vector Tile Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenFreeMap vector tile rendering to Maps+ via `@maplibre/maplibre-gl-leaflet`, using a dedicated `useOpenFreeMap` boolean property that routes around the existing raster tile pipeline (mirroring the Bing integration pattern).

**Architecture:** Static bundle — both `maplibre-gl` and `@maplibre/maplibre-gl-leaflet` are bundled into `visualization.js`. The AMD `define()` deps array gains one new side-effect entry. Three new config properties (`useOpenFreeMap`, `maplibreStylePreset`, `maplibreStyleOverride`) are added to `defaultConfig`, the `updateView` let-block, and the `onConfigChange` let-block. Two guards are added to existing `updateView` blocks that call `setUrl` and mutate tile options, and a new style-update handler is added to `onConfigChange`.

**Tech Stack:** Webpack 5, Babel 7, `maplibre-gl` v4.x, `@maplibre/maplibre-gl-leaflet` (latest), Leaflet 1.9.x, Splunk AMD visualization framework.

---

## File Map

| File | Change |
|------|--------|
| `appserver/static/visualizations/maps-plus/package.json` | Add 2 new dependencies |
| `appserver/static/visualizations/maps-plus/webpack.config.js` | Extend Babel exclusion regex; add CopyPlugin rule |
| `appserver/static/visualizations/maps-plus/visualization.css` | Add one `@import` line |
| `appserver/static/visualizations/maps-plus/src/maps-plus.js` | AMD deps, defaultConfig, helper method, updateView let-block + branch + guards, onConfigChange let-block + guards + handler |
| `appserver/static/visualizations/maps-plus/formatter.html` | Three new controls in Map section |

All build commands run from `appserver/static/visualizations/maps-plus/`.

---

## Task 1: Install npm packages

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/package.json`

- [ ] **Step 1: Add packages to `package.json` dependencies**

In `package.json`, add two entries to the `"dependencies"` object. Add them after the `"moment"` line:

```json
"maplibre-gl": "^4.7.1",
"@maplibre/maplibre-gl-leaflet": "^0.0.22",
```

The full `dependencies` block tail should look like:
```json
    "moment": "^2.20.1",
    "maplibre-gl": "^4.7.1",
    "@maplibre/maplibre-gl-leaflet": "^0.0.22"
  }
```

- [ ] **Step 2: Install**

From `appserver/static/visualizations/maps-plus/`:
```bash
npm install --ignore-scripts
```

The `--ignore-scripts` flag is required — without it, `leaflet-measure`'s `node-sass` postinstall script fails on Node 24.

Expected: installs cleanly, no errors.

- [ ] **Step 3: Verify packages exist**

```bash
ls node_modules/maplibre-gl/dist/maplibre-gl.css
ls node_modules/@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js
```

Expected: both files exist.

- [ ] **Step 4: Commit**

```bash
cd appserver/static/visualizations/maps-plus
git add package.json package-lock.json
git commit -m "feat: add maplibre-gl and maplibre-gl-leaflet dependencies"
```

---

## Task 2: Configure Webpack (Babel exclusion + CSS copy)

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/webpack.config.js`
- Modify: `appserver/static/visualizations/maps-plus/visualization.css`

There are no automated tests — verification is a successful build that produces `contrib/css/maplibre-gl.css`.

- [ ] **Step 1: Extend the Babel exclusion regex**

In `webpack.config.js`, the Babel rule's `exclude` is at line 32. Change it from:

```js
exclude: /node_modules\/(?!(leaflet-ant-path|proj4leaflet|@geoman-io\/leaflet-geoman-free)\/).*/,
```

to:

```js
exclude: /node_modules\/(?!(leaflet-ant-path|proj4leaflet|@geoman-io\/leaflet-geoman-free|maplibre-gl|@maplibre\/maplibre-gl-leaflet)\/).*/,
```

Both new packages ship pre-compiled — excluding them from Babel prevents transpilation errors.

- [ ] **Step 2: Add CopyPlugin rule for MapLibre CSS**

In `webpack.config.js`, the `CopyPlugin` patterns array is at lines 145–150. Add a second pattern:

```js
plugins: [
    new CopyPlugin({
        patterns: [
            {
                from: 'node_modules/@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css',
                to: 'contrib/css/leaflet-geoman.css'
            },
            {
                from: 'node_modules/maplibre-gl/dist/maplibre-gl.css',
                to: 'contrib/css/maplibre-gl.css'
            }
        ]
    })
],
```

- [ ] **Step 3: Add CSS import to `visualization.css`**

In `visualization.css`, add one line after the existing `leaflet-geoman.css` import (line 16):

```css
@import url('./contrib/css/leaflet-geoman.css');
@import url('./contrib/css/maplibre-gl.css');
```

The `./` prefix is required — matches every other import in this file.

- [ ] **Step 4: Build and verify CSS output**

```bash
npm run build
```

Expected output:
- Build succeeds (no errors)
- `contrib/css/maplibre-gl.css` exists and is non-empty:

```bash
ls -la contrib/css/maplibre-gl.css
```

Expected: file ~90KB.

- [ ] **Step 5: Commit**

```bash
git add webpack.config.js visualization.css
git commit -m "feat: configure webpack for maplibre-gl CSS copy and Babel exclusion"
```

---

## Task 3: Add AMD import, config defaults, and style URL helper

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js`

- [ ] **Step 1: Add `@maplibre/maplibre-gl-leaflet` to the AMD deps array**

In `maps-plus.js`, the AMD `define` deps array starts at line 1. The last entry is `'@geoman-io/leaflet-geoman-free'` at line 40. Add the new side-effect dep after it (it doesn't need a corresponding factory parameter — like `leaflet-contextmenu` and other side-effect-only deps):

```js
            '@geoman-io/leaflet-geoman-free',
            '@maplibre/maplibre-gl-leaflet'

        ],
        function(
```

This causes webpack to bundle `@maplibre/maplibre-gl-leaflet` (which pulls in `maplibre-gl` transitively) and register `L.maplibreGL()` as a side effect on the Leaflet namespace.

- [ ] **Step 2: Add three new entries to `defaultConfig`**

In `maps-plus.js`, `defaultConfig` ends at line 243 with:
```js
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showClickMarker': 1,
},
```

Change the last line so the new entries appear before the closing `},`:

```js
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showClickMarker': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.useOpenFreeMap': '0',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.maplibreStylePreset': 'liberty',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.maplibreStyleOverride': '',
},
```

- [ ] **Step 3: Add `_getMaplibreStyleUrl` private method**

Find where other private helper methods are defined (search for `_getSafeUrlProperty` or `_propertyExists` — these are at lines ~800–820). Add the new helper in the same area, as a method on the visualization object:

```js
_getMaplibreStyleUrl: function({ maplibreStylePreset, maplibreStyleOverride }) {
    if (maplibreStyleOverride) {
        return maplibreStyleOverride;
    }
    return 'https://tiles.openfreemap.org/styles/' + (maplibreStylePreset || 'liberty');
},
```

- [ ] **Step 4: Build and verify no new errors**

```bash
npm run build
```

Expected: build succeeds. Bundle will be larger (~4.3 MB vs ~2.8 MB) — this is expected.

- [ ] **Step 5: Commit**

```bash
git add src/maps-plus.js
git commit -m "feat: add maplibre AMD dep, config defaults, and style URL helper"
```

---

## Task 4: Implement `updateView` — let-block, tile layer branch, and guards

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js` (lines ~1982, ~2354, ~2701, ~2709)

- [ ] **Step 1: Add three variables to the `updateView` let-block**

In `maps-plus.js`, the `updateView` let-block has `bingMaps` at line 1982:
```js
        bingMaps = parseInt(this._getEscapedProperty('bingMaps', config)),
```

Add three new variables immediately after it, using the identical `parseInt`/`_getEscapedProperty` pattern:

```js
        bingMaps = parseInt(this._getEscapedProperty('bingMaps', config)),
        useOpenFreeMap = parseInt(this._getEscapedProperty('useOpenFreeMap', config)),
        maplibreStylePreset = this._getEscapedProperty('maplibreStylePreset', config),
        maplibreStyleOverride = this._getSafeUrlProperty('maplibreStyleOverride', config),
```

- [ ] **Step 2: Add OpenFreeMap tile layer branch before the Bing branch**

In `maps-plus.js`, the Bing branch starts at line 2354:
```js
        // Create Bing Map
        if(this.isArgTrue(bingMaps)) {
```

Add the OpenFreeMap branch **immediately before** this comment+if block:

```js
        // Create OpenFreeMap vector tile layer (MapLibre GL)
        if(this.isArgTrue(useOpenFreeMap)) {
            if(this.tileLayer) {
                this.tileLayer.remove()
                this.tileLayer = null
            }
            var _maplibreAttribution = this._getEscapedProperty('mapAttributionOverride', config)
                || '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> '
                + '&copy; <a href="https://openmaptiles.org">OpenMapTiles</a> '
                + '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            this.tileLayer = L.maplibreGL({
                style: this._getMaplibreStyleUrl({ maplibreStylePreset: maplibreStylePreset, maplibreStyleOverride: maplibreStyleOverride }),
                attribution: _maplibreAttribution
            }).addTo(this.map)
        } else if(this.isArgTrue(bingMaps)) {
```

The `else if` connects OpenFreeMap → Bing → raster into the existing if/else chain. Remove the existing `// Create Bing Map` comment line (it is now inside the `else if` branch, so move it inside or delete it). The raster `else` block at line 2383 is unchanged.

- [ ] **Step 3: Add `useOpenFreeMap` guard to the setUrl block at line 2701**

In `maps-plus.js` at line 2701:
```js
    if(!this.isArgTrue(bingMaps)) {
        // Reset Tile If Changed
        if(this.tileLayer._url != this.activeTile) {
            this.tileLayer.setUrl(this.activeTile)
        }
    }
```

Change to:
```js
    if(!this.isArgTrue(bingMaps) && !this.isArgTrue(useOpenFreeMap)) {
        // Reset Tile If Changed
        if(this.tileLayer._url != this.activeTile) {
            this.tileLayer.setUrl(this.activeTile)
        }
    }
```

`L.maplibreGL()` has no `_url` property or `setUrl` method — this guard prevents a crash on every data refresh when OpenFreeMap is active.

- [ ] **Step 4: Add `useOpenFreeMap` guard to the zoom options block at line 2709**

In `maps-plus.js` at line 2709:
```js
    if(!_.isNull(this.tileLayer)) {
        if (this.tileLayer.options.maxZoom != maxZoom) {
            this.tileLayer.options.maxZoom = maxZoom
        }

        if (this.tileLayer.options.minZoom != minZoom) {
            this.tileLayer.options.minZoom = minZoom
        }
    }
```

Change to:
```js
    if(!_.isNull(this.tileLayer) && !this.isArgTrue(useOpenFreeMap)) {
        if (this.tileLayer.options.maxZoom != maxZoom) {
            this.tileLayer.options.maxZoom = maxZoom
        }

        if (this.tileLayer.options.minZoom != minZoom) {
            this.tileLayer.options.minZoom = minZoom
        }
    }
```

`L.maplibreGL()` layers don't use `options.maxZoom`/`options.minZoom` in the same way as `L.TileLayer`.

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: build succeeds, no errors.

- [ ] **Step 6: Deploy to Splunk Docker container and smoke-test**

```bash
npm run deploy
```

Open a Splunk dashboard with Maps+. The map should load normally with the default raster tile (CartoDB Light). No console errors.

- [ ] **Step 7: Commit**

```bash
git add src/maps-plus.js
git commit -m "feat: add updateView OpenFreeMap branch and guards"
```

---

## Task 5: Implement `onConfigChange` — let-block, setUrl guard, style update handler

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js` (lines ~357–414)

- [ ] **Step 1: Add three variables to the `onConfigChange` let-block**

In `maps-plus.js`, the `onConfigChange` let-block runs from line 357 to 399. It ends with:
```js
        tileSize = this._propertyExists('tileSize', configChanges) ? this._getEscapedProperty('tileSize', configChanges):this._getEscapedProperty('tileSize', previousConfig)
```

Add three new entries at the end of the `let` block using the same `_propertyExists`/fallback pattern. Note that `tileSize` currently has no trailing comma — add one and then add the new entries:

```js
        tileSize = this._propertyExists('tileSize', configChanges) ? this._getEscapedProperty('tileSize', configChanges):this._getEscapedProperty('tileSize', previousConfig),
        useOpenFreeMap = this._propertyExists('useOpenFreeMap', configChanges) ? this.isArgTrue(parseInt(this._getEscapedProperty('useOpenFreeMap', configChanges))):this.isArgTrue(parseInt(this._getEscapedProperty('useOpenFreeMap', previousConfig))),
        maplibreStylePreset = this._propertyExists('maplibreStylePreset', configChanges) ? this._getEscapedProperty('maplibreStylePreset', configChanges):this._getEscapedProperty('maplibreStylePreset', previousConfig),
        maplibreStyleOverride = this._propertyExists('maplibreStyleOverride', configChanges) ? this._getSafeUrlProperty('maplibreStyleOverride', configChanges):this._getSafeUrlProperty('maplibreStyleOverride', previousConfig)
```

(No trailing comma on `maplibreStyleOverride` — it is now the last entry.)

- [ ] **Step 2: Guard the two `setUrl` blocks**

In `maps-plus.js` at lines 402–414:
```js
    // Update tile layer
    if(this._propertyExists('mapTile', configChanges) && (_.isUndefined(mapTileOverride) ||  mapTileOverride == "")) {
        this.tileLayer.setUrl(mapTile)
    }

    // Handle map tile override
    if(this._propertyExists('mapTileOverride', configChanges)) {
        if(mapTileOverride == "") {
            this.tileLayer.setUrl(mapTile)
        } else {
            this.tileLayer.setUrl(mapTileOverride)
        }
    }
```

Wrap both blocks in a single `if (!useOpenFreeMap)` guard:

```js
    if(!useOpenFreeMap) {
        // Update tile layer
        if(this._propertyExists('mapTile', configChanges) && (_.isUndefined(mapTileOverride) ||  mapTileOverride == "")) {
            this.tileLayer.setUrl(mapTile)
        }

        // Handle map tile override
        if(this._propertyExists('mapTileOverride', configChanges)) {
            if(mapTileOverride == "") {
                this.tileLayer.setUrl(mapTile)
            } else {
                this.tileLayer.setUrl(mapTileOverride)
            }
        }
    }
```

- [ ] **Step 3: Add style update handler after the setUrl block**

Immediately after the `if(!useOpenFreeMap) { ... }` block just added, add:

```js
    // Handle OpenFreeMap style changes
    if(useOpenFreeMap && (
        this._propertyExists('useOpenFreeMap', configChanges) ||
        this._propertyExists('maplibreStylePreset', configChanges) ||
        this._propertyExists('maplibreStyleOverride', configChanges) ||
        this._propertyExists('mapAttributionOverride', configChanges)
    )) {
        if(this.tileLayer) {
            this.tileLayer.remove()
            this.tileLayer = null
        }
        var _maplibreAttribution = mapAttributionOverride
            || '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> '
            + '&copy; <a href="https://openmaptiles.org">OpenMapTiles</a> '
            + '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        this.tileLayer = L.maplibreGL({
            style: this._getMaplibreStyleUrl({ maplibreStylePreset: maplibreStylePreset, maplibreStyleOverride: maplibreStyleOverride }),
            attribution: _maplibreAttribution
        }).addTo(this.map)
    }
```

Note: `mapAttributionOverride` is already declared in the `onConfigChange` let-block at line 368 — no need to re-read it.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: build succeeds, no errors.

- [ ] **Step 5: Deploy and verify config-change behavior**

```bash
npm run deploy
```

In Splunk, open a Maps+ dashboard and:
1. Enable OpenFreeMap (in Edit → Format) — map should switch to vector tiles.
2. Change the OpenFreeMap Style preset — map should update without page reload.
3. Disable OpenFreeMap — raster tiles should restore.
4. Verify no console errors throughout.

- [ ] **Step 6: Commit**

```bash
git add src/maps-plus.js
git commit -m "feat: add onConfigChange guards and OpenFreeMap style update handler"
```

---

## Task 6: Add formatter controls

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/formatter.html`

- [ ] **Step 1: Add three new controls to the Map section**

In `formatter.html`, the Map section (`<form class="splunk-formatter-section" section-label="Map">`) ends at line 63 with `</form>`. Insert the three new controls **before** that closing tag, after the existing `Default Height` control (line 62):

```html
        <splunk-control-group label="OpenFreeMap Vector Tiles" help="Enable OpenFreeMap vector tiles. When enabled, replaces the raster Map Tile setting above.">
            <splunk-select name="{{VIZ_NAMESPACE}}.useOpenFreeMap" value="0">
                <option value="0">Disabled</option>
                <option value="1">Enabled</option>
            </splunk-select>
        </splunk-control-group>
        <splunk-control-group label="OpenFreeMap Style" help="Built-in OpenFreeMap style preset. Ignored if MapLibre Style URL is set.">
            <splunk-select name="{{VIZ_NAMESPACE}}.maplibreStylePreset" value="liberty">
                <option value="liberty">Liberty (general purpose)</option>
                <option value="bright">Bright (high contrast)</option>
                <option value="positron">Positron (light/minimal)</option>
                <option value="fiord">Fiord (dark)</option>
            </splunk-select>
        </splunk-control-group>
        <splunk-control-group label="MapLibre Style URL" help="Override with any MapLibre-compatible style JSON URL. Overrides the preset above. Leave blank to use preset.">
            <splunk-text-input name="{{VIZ_NAMESPACE}}.maplibreStyleOverride"></splunk-text-input>
        </splunk-control-group>
    </form>
```

Replace the existing `    </form>` closing tag at line 63 with this block (the `</form>` is included at the end of the snippet above).

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Deploy and run full manual test suite**

```bash
npm run deploy
```

Open a Splunk dashboard with Maps+. Go to Edit → Format → Map section. Verify all 9 test scenarios from the spec:

1. Set **OpenFreeMap Vector Tiles** to Enabled → vector tile map renders, replacing raster tiles.
2. Switch between Liberty, Bright, Positron, Fiord presets → style updates correctly each time.
3. Enter a custom style URL in **MapLibre Style URL** → overrides the preset.
4. Set **OpenFreeMap Vector Tiles** back to Disabled → raster tile provider restores, no JS errors.
5. Verify attribution credit appears in map corner.
6. Set **Map Attribution Override** → overrides the default OpenFreeMap attribution.
7. Verify existing features work normally after switching to/from OpenFreeMap: clustering, heatmap, geoman drawing tools, drilldown tokens.
8. Verify Bing tile mode still works (Bing toggle coexists with OpenFreeMap guards).
9. Run `build_release.sh` from the repo root and verify `contrib/css/maplibre-gl.css` is included in the tarball:
   ```bash
   cd /c/Users/scott/Documents/maps-plus
   bash build_release.sh
   tar -tzf leaflet_maps_app_*.tar.gz | grep maplibre
   ```
   Expected: `leaflet_maps_app/appserver/static/visualizations/maps-plus/contrib/css/maplibre-gl.css` appears in the listing.

- [ ] **Step 4: Commit**

```bash
git add formatter.html
git commit -m "feat: add OpenFreeMap formatter controls"
```
