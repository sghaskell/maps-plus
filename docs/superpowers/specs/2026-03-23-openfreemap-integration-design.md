# OpenFreeMap Vector Tile Integration — Design Spec

## Goal

Add OpenFreeMap vector tile rendering to Maps+ as a new tile provider option, using MapLibre GL JS bridged to Leaflet via `@maplibre/maplibre-gl-leaflet`. Extend the existing tile provider system — no existing functionality removed or altered.

## Background

Maps+ currently supports raster tile providers (CartoDB, OSM, OpenTopoMap, HOT, Esri, Bing) via `L.tileLayer()`. OpenFreeMap provides free vector tile styles rendered by MapLibre GL JS. Vector tiles offer sharper rendering at all zoom levels and richer cartography than raster tiles.

The `@maplibre/maplibre-gl-leaflet` binding bridges MapLibre GL to Leaflet by creating a `L.maplibreGL()` layer that implements the standard Leaflet `ILayer` interface, allowing it to integrate with the existing tile layer lifecycle.

### Architectural note: why OpenFreeMap is NOT in the Map Tile dropdown

The existing `mapTile` config property passes through `_getSafeUrlProperty` / `SplunkVisualizationUtils.makeSafeUrl` throughout the codebase (in `updateView`, `onConfigChange`, the `ATTRIBUTIONS` map, and `this.tileLayer.setUrl()` calls). These paths all assume `mapTile` is a URL string. The Bing integration follows the same precedent: Bing is enabled via a separate `bingMaps` boolean property and is NOT in the `mapTile` dropdown. OpenFreeMap follows the identical pattern — a dedicated `useOpenFreeMap` boolean property that routes around the raster tile pipeline entirely.

## Out of Scope

- Splunk `storage/passwords` credential integration (separable follow-on feature)
- Theme-aware auto-switching to Fiord style on Splunk dark theme
- Code splitting / lazy loading (static bundle chosen for simplicity)
- Any changes to the `google-street-view` sub-plugin

---

## Section 1: User-Facing Controls (`formatter.html`)

Three new controls added to the existing **Map** formatter section. The existing Map Tile dropdown and its Override/Attribution fields are unchanged.

### 1a. OpenFreeMap Vector Tiles toggle (new control)
A new `<splunk-select>` labeled **OpenFreeMap Vector Tiles** with two options:

| Label | Value |
|-------|-------|
| Disabled (default) | `0` |
| Enabled | `1` |

Config property name: `useOpenFreeMap`. Default: `'0'`.

When enabled, the OpenFreeMap MapLibre layer replaces the raster tile layer. The existing Map Tile dropdown is ignored while OpenFreeMap is active (same behavior as Bing — the Bing toggle overrides `mapTile`).

### 1b. OpenFreeMap Style dropdown (new control)
A new `<splunk-select>` labeled **OpenFreeMap Style** with four options corresponding to OpenFreeMap's built-in styles:

| Label | Value |
|-------|-------|
| Liberty (default, general purpose) | `liberty` |
| Bright (high contrast) | `bright` |
| Positron (light/minimal) | `positron` |
| Fiord (dark) | `fiord` |

Config property name: `maplibreStylePreset`. Default: `'liberty'`.

### 1c. MapLibre Style URL (new control)
A new `<splunk-text-input>` labeled **MapLibre Style URL**. If non-empty, overrides the style preset entirely. Accepts any MapLibre-compatible style JSON URL (OpenFreeMap, Maptiler, Stadia, self-hosted). API keys are embedded by the user directly in the URL.

Config property name: `maplibreStyleOverride`. Default: `''` (empty).

The existing **Attribution Override** control applies to OpenFreeMap as well — if set, it overrides the default OpenFreeMap attribution string.

---

## Section 2: Dependencies and Build

### New packages
```
maplibre-gl                      (latest v4.x)
@maplibre/maplibre-gl-leaflet    (latest)
```

Both are peer-dependent: `@maplibre/maplibre-gl-leaflet` treats `maplibre-gl` as a peer dependency, so both must be installed explicitly.

### Babel exclusion
Both packages added to the existing `exclude` regex in `webpack.config.js` — they ship pre-compiled and must not be transpiled:
```
/node_modules\/(?!(leaflet-ant-path|proj4leaflet|@geoman-io\/leaflet-geoman-free|maplibre-gl|@maplibre\/maplibre-gl-leaflet)\/).*/
```

### CSS handling
A new `CopyPlugin` pattern copies MapLibre's CSS, consistent with the existing `leaflet-geoman.css` approach:
```
from: 'node_modules/maplibre-gl/dist/maplibre-gl.css'
to:   'contrib/css/maplibre-gl.css'
```

`visualization.css` gets one new line following the existing `./` relative path convention:
```css
@import url('./contrib/css/maplibre-gl.css');
```

### Static imports in `maps-plus.js`
Two imports added alongside existing plugin imports:
```js
import 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
```

The second import registers `L.maplibreGL()` as a side effect on the Leaflet namespace. No named export is used.

### Bundle size impact
`visualization.js` grows from ~2.8 MB to ~4.3 MB uncompressed. Gzip delta: ~500 KB. Splunk serves static assets with gzip compression.

---

## Section 3: Runtime Behavior (`maps-plus.js`)

### Config defaults
Three new properties added alongside existing defaults:

```js
useOpenFreeMap:        '0'
maplibreStylePreset:   'liberty'
maplibreStyleOverride: ''
```

### Style URL resolution
A private helper `_getMaplibreStyleUrl({ maplibreStylePreset, maplibreStyleOverride })` accepts pre-resolved string values (not a raw `configChanges` object) and returns the effective style URL:
1. If `maplibreStyleOverride` is a non-empty string, return it directly.
2. Otherwise, return `https://tiles.openfreemap.org/styles/${maplibreStylePreset || 'liberty'}`.

Both call sites (in `updateView` and `onConfigChange`) resolve `maplibreStylePreset` and `maplibreStyleOverride` from config before calling the helper.

### `updateView` let-block additions
Add alongside `bingMaps` (line 1982), using the same `parseInt(_getEscapedProperty(..., config))` pattern:

```js
bingMaps = parseInt(this._getEscapedProperty('bingMaps', config)),      // existing — shown for context
useOpenFreeMap = parseInt(this._getEscapedProperty('useOpenFreeMap', config)),
maplibreStylePreset = this._getEscapedProperty('maplibreStylePreset', config),
maplibreStyleOverride = this._getSafeUrlProperty('maplibreStyleOverride', config),
```

`useOpenFreeMap` is then used as `this.isArgTrue(useOpenFreeMap)` throughout `updateView`, identical to how `bingMaps` is used as `this.isArgTrue(bingMaps)`.

### Tile layer creation in `updateView`
The OpenFreeMap branch is checked **before** the raster tile pipeline runs — mirroring the Bing check. The `mapTile` URL pipeline (including `_getSafeUrlProperty`, `ATTRIBUTIONS` lookup, `setUrl`) is never reached when OpenFreeMap is active:

```js
if (this.isArgTrue(useOpenFreeMap)) {
    // Remove existing tile layer (raster or maplibre) if present
    if (this.tileLayer) {
        this.tileLayer.remove();
        this.tileLayer = null;
    }
    const styleUrl = this._getMaplibreStyleUrl({ maplibreStylePreset, maplibreStyleOverride });
    const attribution = this._getEscapedProperty('mapAttributionOverride', config)
        || '© <a href="https://openfreemap.org">OpenFreeMap</a> '
        + '© <a href="https://openmaptiles.org">OpenMapTiles</a> '
        + '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    this.tileLayer = L.maplibreGL({
        style: styleUrl,
        attribution: attribution
    }).addTo(this.map);
} else if (this.isArgTrue(bingMaps)) {
    // existing Bing branch — unchanged
} else {
    // existing L.tileLayer() branch — unchanged
    // This branch runs unconditionally when OpenFreeMap is disabled, creating a fresh
    // L.tileLayer() regardless of what this.tileLayer previously held. No null check
    // is needed — the raster branch always overwrites this.tileLayer.
}
```

### `onConfigChange` — new locals, guards, and style update handlers

**Add to the `let` block** (lines 357–399) using the same `_propertyExists`/fallback pattern as every other variable there:

```js
useOpenFreeMap = this._propertyExists('useOpenFreeMap', configChanges)
    ? this.isArgTrue(parseInt(this._getEscapedProperty('useOpenFreeMap', configChanges)))
    : this.isArgTrue(parseInt(this._getEscapedProperty('useOpenFreeMap', previousConfig))),
maplibreStylePreset = this._propertyExists('maplibreStylePreset', configChanges)
    ? this._getEscapedProperty('maplibreStylePreset', configChanges)
    : this._getEscapedProperty('maplibreStylePreset', previousConfig),
maplibreStyleOverride = this._propertyExists('maplibreStyleOverride', configChanges)
    ? this._getSafeUrlProperty('maplibreStyleOverride', configChanges)
    : this._getSafeUrlProperty('maplibreStyleOverride', previousConfig),
```

**Guard the two `setUrl` blocks** at lines 403–414. The existing code has no Bing guard here — OpenFreeMap simply adds its own guard wrapping both blocks:

```js
if (!useOpenFreeMap) {
    // Update tile layer
    if(this._propertyExists('mapTile', configChanges) && (_.isUndefined(mapTileOverride) || mapTileOverride == "")) {
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

**Style update handler** — add after the `setUrl` block. Fires when `useOpenFreeMap`, `maplibreStylePreset`, or `maplibreStyleOverride` changes while OpenFreeMap is active. Since `L.maplibreGL()` does not support in-place style URL changes, the layer is removed and recreated:

```js
if (useOpenFreeMap && (
    this._propertyExists('useOpenFreeMap', configChanges) ||
    this._propertyExists('maplibreStylePreset', configChanges) ||
    this._propertyExists('maplibreStyleOverride', configChanges) ||
    this._propertyExists('mapAttributionOverride', configChanges)
)) {
    if (this.tileLayer) {
        this.tileLayer.remove();
        this.tileLayer = null;
    }
    const styleUrl = this._getMaplibreStyleUrl({ maplibreStylePreset, maplibreStyleOverride });
    const attribution = mapAttributionOverride
        || '© <a href="https://openfreemap.org">OpenFreeMap</a> '
        + '© <a href="https://openmaptiles.org">OpenMapTiles</a> '
        + '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    this.tileLayer = L.maplibreGL({ style: styleUrl, attribution }).addTo(this.map);
}
```

`maplibreStylePreset` and `maplibreStyleOverride` are already-resolved local variables from the `let` block above, so `_getMaplibreStyleUrl` receives pre-resolved strings directly.

### `updateView` guards (two locations)

**Location 1 — lines 2701–2705** (`setUrl` and `_url` access). The existing Bing guard must also exclude OpenFreeMap since `L.maplibreGL()` has neither `_url` nor `setUrl`:

```js
if(!this.isArgTrue(bingMaps) && !useOpenFreeMap) {
    // Reset Tile If Changed
    if(this.tileLayer._url != this.activeTile) {
        this.tileLayer.setUrl(this.activeTile)
    }
}
```

**Location 2 — lines 2709–2717** (zoom options mutation). `L.maplibreGL()` does not use `options.maxZoom`/`options.minZoom` the same way `L.TileLayer` does; mutating these on a MapLibre layer is a no-op at best and confusing at worst. Skip this block when OpenFreeMap is active:

```js
if(!_.isNull(this.tileLayer) && !useOpenFreeMap) {
    if (this.tileLayer.options.maxZoom != maxZoom) {
        this.tileLayer.options.maxZoom = maxZoom
    }
    if (this.tileLayer.options.minZoom != minZoom) {
        this.tileLayer.options.minZoom = minZoom
    }
}
```

---

## Testing

Manual verification against the running Splunk Docker container (via `npm run deploy`):

1. Set **OpenFreeMap Vector Tiles** to Enabled — vector tile map renders, replacing raster tiles.
2. Switch between Liberty, Bright, Positron, Fiord presets — style updates correctly.
3. Enter a custom style URL in **MapLibre Style URL** — overrides the preset.
4. Set **OpenFreeMap Vector Tiles** back to Disabled — raster tile provider (MapTile dropdown selection) restores correctly, no JS errors.
5. Verify attribution shows OpenFreeMap credit in map corner.
6. Verify **Attribution Override** field overrides the default OpenFreeMap attribution.
7. Verify existing features (clustering, heatmap, geoman drawing, drilldown tokens) work normally after switching to/from OpenFreeMap.
8. Verify Bing tile mode still works (Bing + OpenFreeMap guards coexist correctly).
9. Build release package via `build_release.sh` — verify `contrib/css/maplibre-gl.css` is included in the tarball.
