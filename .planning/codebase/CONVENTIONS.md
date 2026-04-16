# Code Conventions — Maps+ for Splunk

> Auto-generated from analysis of `appserver/static/visualizations/maps-plus/src/maps-plus.js` (3,564 lines) and associated build artifacts. Last verified: 2026-04-16.

---

## 1. Code Style

### General conventions

| Aspect              | Convention                                          |
| ------------------- | --------------------------------------------------- |
| **Indentation**     | 4 spaces (no tabs). Nested blocks increase indent consistently. |
| **Line length**     | No enforced limit; lines commonly extend to 120–160 characters in the `onConfigChange` method where config values are extracted via chained ternaries. |
| **Semicolons**      | Omitted at end of statements (no semicolons). The codebase relies on ASI (Automatic Semicolon Insertion). Exceptions exist inside object literals and some inline expressions. |
| **Quotes**          | Single quotes (`'`) used exclusively for strings. Double quotes appear only in CSS rule strings that contain single-quote substitutions (e.g., the `_darkModeInit` method builds `.leaflet-contextmenu{display:none;...}` as raw string literals). |
| **Strict mode**     | No `"use strict"` directive anywhere in `maps-plus.js`. The code runs in sloppy mode. |
| **Case style**      | camelCase for all local variables, function parameters, and method names (both public and private). Class property names from Splunk's API (`maxResults`, `paneZIndex`) are camelCase. Configuration keys use the full dotted namespace format: `'display.visualizations.custom.leaflet_maps_app.maps-plus.cluster'`. |
| **Braces**          | K&R style — opening brace on the same line as the function/conditional/block declaration. |
| **Commas**          | Trailing commas are absent from object and array literals (ES5-style). |

### Notable patterns

- **Chained ternary for config extraction**: Nearly every config property is extracted in `onConfigChange` using this repeating pattern:
  ```js
  foo = this._propertyExists('foo', configChanges)
    ? this._getEscapedProperty('foo', configChanges)
    : this._getEscapedProperty('foo', previousConfig)
  ```
  This was later extracted into a helper `_getConfigValue(name, changes, prev, transform?)` (line ~888).

- **Underscore utility**: The codebase heavily uses `_.has()`, `_.each()`, `_.chain()`, `_.map()`, `_.filter()` from Underscore.js instead of native array/object methods. This is pervasive in data processing (`render` method, lines ~3400–3564).

- **jQuery usage**: Extensive use of `$()` for DOM manipulation, event binding, deferred objects (`$.Deferred()`), and Ajax. The global `$` and `jQuery` are aliased to the same jQuery module instance.

---

## 2. Module Pattern

### AMD `define()` wrapper

The entire source file is wrapped in a single AMD `define()` call:

```js
define([
    'jquery',        // $
    'underscore',    // _
    'leaflet',       // L
    '@mapbox/togeojson',
    '@turf/turf',
    'jszip',
    'jszip-utils',
    'milsymbol',     // ms
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils',
    'load-google-maps-api',
    'moment',
    '../contrib/js/Modal',
    '../contrib/js/theme-utils',
    // ... ~35 more dependencies
],
function(
    $,
    _,
    L,
    toGeoJSON,
    turf,
    JSZip,
    JSZipUtils,
    ms,
    SplunkVisualizationBase,
    SplunkVisualizationUtils,
    loadGoogleMapsAPI,
    moment,
    Modal,
    themeUtils
) {

return SplunkVisualizationBase.extend({
    // ... object literal with all methods and properties
})
})
```

Key observations:

- **Dependency array has ~40 entries** (including local contrib files). Each entry maps 1:1 to a parameter in the function signature.
- **`define()` is externalized for Splunk APIs**: `api/SplunkVisualizationBase` and `api/SplunkVisualizationUtils` are listed as Webpack externals, meaning they are provided at runtime by Splunk's RequireJS environment.
- **No named AMD module ID** — this produces an anonymous module. The webpack.config.js handles AMD transformation via Babel (`modules: false` in preset-env). Several contrib modules (leaflet-spin, HeatLayer) require imports-loader configuration to prevent "Mismatched anonymous define" errors at runtime when RequireJS loads them.
- **Single export**: The module returns the result of `SplunkVisualizationBase.extend(...)`, which is the standard Splunk custom visualization API pattern.

### Anonymous function exports inside the body

Within the returned object literal, all methods are defined as anonymous functions:

```js
initialize: function() { ... },
render: function(data, options) { ... },
```

No arrow functions are used for method definitions — consistent ES5 style throughout.

---

## 3. Configuration Conventions

### Field name declaration (`validFields`)

The `validFields` array at lines ~78–145 declares **69 known SPL field names** that the visualization recognizes from search results. Fields not in this list are treated as "extra" and captured for drilldown payloads:

```js
validFields: ['latitude', 'longitude', 'title', 'tooltip', 'description',
    'icon', 'customIcon', 'customIconShadow', 'markerType', 'markerColor',
    'markerPriority', 'markerSize', 'markerAnchor', 'markerVisibility',
    'iconColor', 'shadowAnchor', 'shadowSize', 'prefix', 'extraClasses',
    'layerDescription', 'layerVisibility', 'pathLayer', 'pathWeight',
    // ... continues with path*, layer*, heatmap*, circle*, feature*,
    // antPath*, playback*, ms* (milsymbol), _time fields
],
```

The `validateFields` method (line ~834) iterates incoming data rows and returns a subset of only the unrecognized fields — used to populate drilldown payloads:

```js
validateFields: function(obj) {
    var invalidFields = {}
    $.each(obj, function(key, value) {
        if($.inArray(key, this.validFields) === -1) {
            invalidFields[key] = value
        }
    }.bind(this))
    return(invalidFields)
}
```

### Default configuration (`defaultConfig`)

The `defaultConfig` object (lines ~147–212) declares **~80 default settings** as full Splunk property-namespace keys. Each entry uses the pattern:

```js
'display.visualizations.custom.leaflet_maps_app.maps-plus.<property>': <value>,
```

Values are a mix of integers (`0`/`1` for booleans), strings (URLs, color hex values, preset names), and JSON-encoded objects (e.g., `'heatmapColorGradient'` stores `'{"0.4":"blue","0.6":"cyan",...}'`).

### savedsearches.conf as secondary defaults

The `default/savedsearches.conf` file mirrors the same ~80 settings as Splunk macro-level defaults. The config merge strategy is:

1. **`savedsearches.conf`** (app-level default) — read by Splunk framework
2. **`defaultConfig` in code** — fallback if framework does not supply a value
3. **User format menu overrides** — runtime changes captured via `onConfigChange(configChanges, previousConfig)`
4. **Per-dashboard `<option>` elements** — Simple XML dashboard options override app-level defaults

The `_propertyExists`, `_getEscapedProperty`, `_getSafeUrlProperty` helper chain implements this merge at each config update cycle.

### Format menu schema (`savedsearches.conf`)

All format menu items are declared in `[default]` stanza of `default/savedsearches.conf`. The key convention is:

```
display.visualizations.custom.leaflet_maps_app.maps-plus.<setting_name> = <default_value>
```

This matches the property namespace used throughout `maps-plus.js`. There are **80+ entries**, covering markers, layers, clustering, heatmaps, paths, playback, measure tool, map tiles (OpenStreetMap, CartoDB, ESRI, Bing), i18n, Google Places, Antarctic projection, gibs satellite imagery, milsymbol settings, and lasso selection.

---

## 4. Error Handling

### Console-based error reporting

The codebase uses `console.error`, `console.warn` as the primary error handling mechanism. Patterns observed:

```js
// Warning with prefix label for filtering
console.warn('Maps+: invalid cluster color "' + str + '", ignoring')

// Error with context in Ajax failure handler
console.error("Failed to get API key for user: " + options.user + ", realm: " + options.realm)

// Promise rejection catch
.catch(function(err) {
    console.error('Maps+: Error processing KMZ overlay from ' + url, err)
})

// Conditional warning during data processing
console.warn("Feature detected - not adding to heatmap")
```

### Try/catch usage

**No `try/catch` blocks are present in the main source file.** Error recovery relies on:

- **Graceful degradation for optional features**: Tile layer providers (OSM, CartoDB, ESRI, Bing, MapLibre, Antarctic) are all optional. If one fails to load, the map still initializes with a fallback tile layer or an empty map.
- **Conditional existence checks**: `_.isUndefined()`, `_.has()`, and `this._propertyExists()` guard access to configuration values and data fields before use.
- **Promise `.catch()` handlers** for async operations (KML/KMZ loading, Google Places API initialization).

### No linter or static analysis

There is no ESLint, JSHint, JSLint, or any other linting tool configured. The `package.json` contains only Webpack-related build scripts with no `lint` command. This means dead code, unused variables, and potential type errors are not caught automatically.

---

## 5. Naming Conventions

### Method naming

| Category              | Convention         | Examples                                          |
| --------------------- | ------------------ | ------------------------------------------------- |
| **Private methods**   | `_` prefix + camelCase | `_darkModeInit()`, `_darkModeUpdate()`, `_drilldown()`, `_getProperty()`, `_getEscapedProperty()`, `_getSafeUrlProperty()`, `_getMaplibreStyleUrl()`, `_propertyExists()`, `_getConfigValue()` |
| **Public methods**    | camelCase (no prefix)  | `initialize()`, `render()`, `reflow()`, `onConfigChange()`, `validateFields()`, `convertHex()`, `hexToRgb()`, `parseColor()`, `isArgTrue()`, `getInitialDataParams()` |
| **Splunk API methods**| camelCase (inherited)  | SplunkVisualizationBase provides these; mapped directly on the extended object |

### Property naming

Class properties use a **mixed convention**:

- **camelCase** for most properties: `tileLayer`, `measureDialogOpen`, `parentEl`, `viewMode`, `paneZIndex`
- **snake_case** appears only in Splunk search output field names (not in JS code): the visualization reads fields like `marker_type`, `layer_group` from Splunk data rows and maps them to internal processing.

### Field name conventions for Splunk search output

The 69 valid fields split into named groups:

| Group           | Prefix/Topic        | Example fields                                |
| --------------- | ------------------- | --------------------------------------------- |
| Location        | Basic coordinates   | `latitude`, `longitude`                       |
| Marker display  | Icon/appearance     | `markerType`, `markerColor`, `markerSize`, `icon`, `customIcon` |
| Cluster         | Marker clustering   | `clusterGroup`, `layerPriority`               |
| Path/trace      | Line rendering      | `pathLayer`, `pathWeight`, `pathOpacity`, `pathColor` |
| Heatmap         | Density overlay     | `heatmapInclude`, `heatmapRadius`, `heatmapBlur`, `heatmapColorGradient` |
| Circle marker   | Circle symbols      | `circleStroke`, `circleRadius`, `circleFillColor` |
| Feature/polygon | Drawn geometries    | `feature`, `featureLayer`, `featureColor`, `featureFillOpacity` |
| Animation       | Ant path/playback   | `antPath`, `antPathDelay`, `playback`         |
| MilSymbol       | Military symbols    | `msStrokeWidth`, `msIconColor`, `msColorMode` |

### Config key naming

Config property namespace uses dot-separated kebab-like segments:

```
display.visualizations.custom.leaflet_maps_app.maps-plus.<kebabName>
```

Individual settings use camelCase after the prefix: `mapTile`, `maxClusterRadius`, `heatmapColorGradient`.

---

## 6. CSS Organization

### Structure

The main entry point is `visualization.css` at the root of the maps-plus visualization directory. It uses **17 `@import` statements** to pull in all contrib/CSS files:

```css
@import url('./contrib/css/leaflet.css');
@import url('./contrib/css/MarkerCluster.Default.css');
@import url('./contrib/css/MarkerCluster.css');
@import url('./contrib/css/fontawesome-all.min.css');
@import url('./contrib/css/glyphicon.css');
@import url('./contrib/css/leaflet.awesome-markers.css');
@import url('./contrib/css/ionicons.min.css');
@import url('./contrib/css/leaflet-legend.css');
@import url('./contrib/css/leaflet-measure.css');
@import url('./contrib/css/leaflet.contextmenu.min.css');
@import url('./contrib/css/Leaflet.Dialog.css');
@import url('./contrib/css/leaflet-vector-markers.css');
@import url('./contrib/css/leaflet-gplaces-autocomplete.css');
@import url('./contrib/css/leaflet-dark.css');
@import url('./contrib/css/leaflet-geoman.css');
@import url('./contrib/css/maplibre-gl.css');
```

### Contrib CSS categories

The 20 CSS files in `contrib/css/` fall into these categories:

| Category | Files | Purpose |
| --- | --- | --- |
| **Core Leaflet** | `leaflet.css`, `MarkerCluster.css`, `MarkerCluster.Default.css` | Base map and marker clustering styles |
| **Icons/Fonts** | `fontawesome-all.min.css`, `fontawesome-v4-shims.min.css`, `glyphicon.css`, `ionicons.min.css` | Icon library styles used in marker labels and UI controls |
| **Plugin-specific** | `leaflet.awesome-markers.css`, `leaflet-legend.css`, `leaflet-measure.css`, `leaflet.contextmenu.min.css`, `Leaflet.Dialog.css`, `leaflet-vector-markers.css`, `leaflet-gplaces-autocomplete.css`, `leaflet-dark.css`, `leaflet-geoman.css` | Third-party Leaflet plugin styling |
| **MapLibre GL** | `maplibre-gl.css` | Vector tile layer rendering (bundled via CopyPlugin) |
| **Leaflet Draw** | `leaflet-draw.css`, `screen.css`, `markers.css` | Feature drawing and lasso selection tools |

### Application-specific CSS

The main `visualization.css` only defines two custom rulesets beyond imports:

```css
.maps-plus-click-marker { background: transparent; border: none; }
.maps-plus-click-marker i { font-size: 20px; color: #e74c3c; text-shadow: ...; }
```

These style the red click marker shown when `clickLatLngToken=1`. Most dynamic theming (dark mode, cluster color ranges) is done at runtime via JavaScript-generated `<style>` elements appended to `<head>`.

### Build-time CSS bundling

Webpack's CopyPlugin copies two CSS files from node_modules during build:
- `node_modules/@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css` → `contrib/css/leaflet-geoman.css`
- `node_modules/maplibre-gl/dist/maplibre-gl.css` → `contrib/css/maplibre-gl.css`

---

## 7. Documentation in Code

### JSDoc usage

**Virtually absent**. The only multi-line block comment found is a single section header:

```js
/********* BEGIN PROCESSING DATA **********/
```

There are no `@param`, `@returns`, `@typedef`, or `@module` annotations anywhere in the codebase.

### Inline comments

Inline comments (`//`) are used sparingly but serve specific purposes:

1. **Section headers**: Dividing major logical blocks in the `onConfigChange` method:
   ```js
   // Update tile layer
   // Handle map tile override
   // Handle OpenFreeMap style changes
   // Handle scroll wheel zoom
   // Handle center zoom change
   // Cluster Background Range 1
   // Cluster Foreground Range 1
   ```

2. **Explanation of non-obvious logic**:
   ```js
   // Find the contextmenu @import sub-stylesheet inside visualization.css by
   // walking cssRules and identifying it by content (.leaflet-contextmenu selector),
   // rather than relying on a hardcoded index or taking the first @import found.
   ```

3. **TODO/FIXME markers**: Very rare — only one TODO and one HACK observed:
   ```js
   //TODO Maybe: childMarkers order by distance to center
   // Otherwise circles look wrong => hack for standard blue icon, renders differently for other icons.
   ```

4. **Webpack configuration comments**: The `webpack.config.js` has extensive inline comments explaining the two patterns used to handle contrib module dependencies:
   - **Pattern A**: `imports-loader` with `additionalCode` for globals
   - **Pattern B**: `define = false` to disable AMD define in conflicting modules

### File-level documentation

No file-level header comments or author blocks exist. The project metadata (name, version, author, license) is found only in:
- `package.json` (build directory)
- `appserver/metadata/app.conf` (deployed app)
- `README.md` (repository root)
