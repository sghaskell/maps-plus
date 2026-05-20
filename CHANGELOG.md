Maps+ for Splunk Changelog
==========================

## [4.6.6] - 2026-05-20

### Fixed
- **Duplicate or stale markers after transforming-search preview updates**: Maps+ could render an intermediate preview result set as the final map state for SPL searches that use transforming commands such as `stats`. Splunk can update preview rows while the search is still running, so early paged preview chunks are not always identical to the completed result set. Maps+ now treats Splunk's post-completion offset-reset payload as the authoritative replacement: it clears preview-based markers, renders the completed row set, and avoids issuing another pagination request for that replacement. This prevents visible duplicate pins and missing final rows while preserving progressive rendering for multi-chunk searches.

## [4.6.5] - 2026-05-19

### Fixed
- **Intermittent duplicate markers after time-range change** (#59): On a fast time-range change (or any user action that causes Splunk to cancel an in-flight search before its trailing zero-results "done" packet is delivered), markers from the previous render cycle could remain on the map and the new cycle's markers were drawn on top, producing duplicate pins (e.g. 10 pins instead of 5). The stale-marker cleanup added in v4.6.2 used a `_markersCleared` flag reset only when the prior cycle's `_cycleComplete` packet arrived — that signal isn't guaranteed across cancelled searches. `formatData` now resets `_markersCleared` at cycle start (when `offset === 0`) as a fallback, ensuring the clear-in-place block in `updateView` runs exactly once per render cycle regardless of whether the prior cycle's tail packet was delivered. The reset is gated on `offset === 0` so multi-chunk searches (>50k rows) are unaffected — chunk N+1 still cannot wipe chunk N's markers (issue #10 fix preserved). Diagnosed and patch direction proposed by Ben Liew (#59).

## [4.6.4] - 2026-04-30

### Fixed
- **Format Visualization panel crash when Splunk panel ID contains `(`** (#55): The jQuery/Sizzle selectors in `_setFullScreenMode` and `_setDefaultHeight` constructed attribute selector strings by concatenating `data-cid` values without quoting the value — e.g. `div[data-cid=foo(bar)]`. Sizzle treats `(` as a pseudo-class argument delimiter and throws a parse error, which propagated as an uncaught exception and prevented the Format panel from opening. Fixed by quoting the attribute value in all three selector sites: `div[data-cid='foo(bar)']`.

## [4.6.3] - 2026-04-21

### Fixed
- **Per-row `markerColor` ignored — all markers in a layer group rendered with the first row's color** (#53): An icon caching optimization introduced in v4.1.1 stored the first-built marker icon per `layerGroup` and reused it for all subsequent rows, overriding per-row `markerColor`, `iconColor`, and `icon` values. This caused every marker within the same layer group to display the color of the first row processed. Affects `png`, `svg`, `icon`, and `custom` marker types. Fixed by removing the `cachedIcon` pattern entirely — each row now builds a fresh icon, correctly honoring per-row marker fields. The stale-markers cleanup block also clears any residual cached icon between render cycles.

## [4.6.2] - 2026-03-26

### Fixed
- **Stale markers and frozen tooltips on panel auto-refresh** (#10): On Simple XML panels with a `<refresh>` interval, markers accumulated across refresh cycles and tooltips showed values from the initial render. Two root causes: (1) `updateDataParams` was not reset after the first render cycle — Splunk reused the previous chunk offset (e.g. 3 for a 3-row result), so every subsequent refresh fetched 0 rows and `updateView` returned early without updating the map; (2) `clusterColorMap` was declared with `var` inside the `!isInitializedDom` block — on every render after the first, the init block is skipped and the variable was `undefined`, causing a `TypeError` crash in the cluster color resolution logic. Fixed by resetting `offset=0` in `formatData`'s zero-results path and moving `clusterColorMap` outside the init block so it is computed on every render.

## [4.6.1] - 2026-03-26

### Security
- **lodash** upgraded from 4.17.21 to 4.17.23 via npm `overrides` (precautionary patch update)
- **serialize-javascript** upgraded from 6.0.2 to 7.0.5 via npm `overrides` (addresses CVE-2020-7660 — RegExp/Date serialization in webpack build pipeline; build-time only, does not affect the shipped bundle)

## [4.6.0] - 2026-03-25

### Added
- **Per-cluster-group colors** (#39): New `clusterBgColor` and `clusterFgColor` SPL fields set the outer ring and inner circle colors of cluster icons on a per-row basis. If only `clusterBgColor` is provided, `clusterFgColor` mirrors it. Takes priority over the **Cluster Group Colors** formatter option. Colors are normalized via a new `parseColor` utility that handles hex, `rgba()`, and named CSS colors. Cluster CSS is injected per group using `createMarkerStyleFromColor` — each group gets a unique generated class name to avoid cross-group bleed.
- **Colored dots in layer control for cluster groups**: Cluster groups with assigned `clusterBgColor` now display a matching SVG circle dot next to the group name in the layer control legend, consistent with circle marker representation.
- **KML/KMZ overlay with layer control toggle** (#41): KML and KMZ files loaded via the `kmlOverlay` option now register as independently toggleable entries in the layer control widget. Each file's layer name is derived from the full filename to avoid stem collisions across multiple overlays. The `fetchKmlAndMap` function has been refactored to extract shared callbacks and add proper KMZ error handling. The layer control is mounted once at initialization to prevent duplicate DOM nodes across `updateView` cycles. URL-referenced KML files are now fully supported (previously only paths were handled).
- **Demo dashboard `kml_overlay.xml`**: Five-panel demo covering polygon overlays, multi-file KML, layer toggle interaction, URL-loaded KML, and tile regression.
- **Demo dashboard `cluster_colors.xml`**: Demonstrates `clusterBgColor`/`clusterFgColor` per cluster group with layer control integration.
- **`cluster_colors` formatter option**: A new **Cluster Group Colors** formatter panel option provides a default color map for cluster groups without per-row SPL fields.

### Changed
- **FontAwesome upgraded from 5.8.2 to 7.2.0**: Updated woff2 font files (`fa-solid-900`, `fa-regular-400`, `fa-brands-400`) and CSS. FA7 drops eot/svg/ttf/woff formats — only woff2 is shipped. Font path corrected from `../webfonts/` to `../fonts/` in both `fontawesome-all.min.css` and `fontawesome-v4-shims.min.css`. The v4 compatibility shim (`fa-v4compatibility.woff2`) is included for legacy icon names. `fa` (solid) and `fab` (brands) prefixes are available free; `far` (regular) requires a Font Awesome Pro license.
- **Awesome-markers icon positioning adjusted for FA7**: `margin-top` increased from 10px to 14px and `font-size: 14px` restored to keep icons vertically centred inside marker pins with FA7's updated glyph metrics.
- **Demo dashboards updated**: `circle_markers.xml` and `custom_icons.xml` tile URLs updated to CartoDB Light; `google_streetview_drilldown.xml` updated to OpenFreeMap Liberty vector tiles.
- **Deploy script refactored** (`scripts/deploy.sh`): Now stages files to a sibling temp directory and uses `tar` from that staging dir, matching the user-facing install flow via Splunk UI upload. Eliminates silent mis-packaging caused by the previous `tar` pipe approach on Windows/Git Bash.

### Fixed
- **Dark mode contextmenu stylesheet detection**: `_darkModeInit` now identifies the contextmenu sub-stylesheet by scanning `cssRules` for a `.leaflet-contextmenu` selector rather than taking the first `@import` found — prevents breakage when stylesheet load order changes.
- **Crash guard on empty results** (#27): `updateView` no longer throws when `formatData` returns the viz object instead of a data payload for empty searches. `dataRows` now falls back to `[]` and field validation is skipped, preventing a white div or JS error. Note: Splunk's framework displays its own "No results found" overlay before `updateView` is called on empty searches — a blank map tile is not rendered in this case.
- **Unnamed KML features and URL support for `kmlOverlay`** (#36, #38): KML features without a `<name>` element no longer throw on layer registration. The `kmlOverlay` option now accepts HTTP/HTTPS URLs in addition to relative paths.
- **OSM tile rate-limiting warning** (#47): A visible warning is shown in the formatter and README when OpenStreetMap is selected as the tile provider, explaining the Splunk iframe `Referer` issue and recommending CartoDB or a self-hosted proxy.
- **Layer visibility state restored for clustered groups**: `layerVisibility` is now correctly preserved across `updateView` cycles for clustered layer groups, fixing a regression where toggled-off cluster layers would reappear on data refresh.

## [4.5.0] - 2026-03-23

### Added
- **OpenFreeMap vector tile support**: New tile backend powered by MapLibre GL JS via `@maplibre/maplibre-gl-leaflet`. Enable via **Map → OpenFreeMap Vector Tiles → Enabled**. Four built-in styles: Liberty (default), Bright, Positron, and Fiord. Vector tiles render sharper than raster at all zoom levels with richer cartography.
- **MapLibre Style URL override**: A free-text field accepting any MapLibre-compatible style JSON URL, overriding the built-in style preset. Compatible with OpenFreeMap, Stadia Maps, MapTiler, Protomaps, and any self-hosted MapLibre style server. Stadia Maps styles (e.g. `https://tiles.stadiamaps.com/styles/alidade_smooth.json`) work without an API key for development use.
- **Viewport culling for marker clusters**: `removeOutsideVisibleBounds` enabled on all marker cluster groups. Markers outside the visible viewport are removed from the DOM and re-added as they enter, dramatically reducing DOM node count at high zoom levels with large datasets (tested with 25k+ markers). The Antarctic projection path explicitly preserves the previous behavior.

### Changed
- Build pipeline updated: Webpack 5, Babel 7, TerserPlugin replacing UglifyJS, IE11 support dropped. Bundle targets modern evergreen browsers (Chrome, Firefox, Safari, Edge — last 2 versions).
- Deploy script (`scripts/deploy.sh`) now syncs `formatter.html`, `visualization.css`, and `contrib/css/maplibre-gl.css` in addition to `visualization.js`.

### Dependencies
- Added `maplibre-gl` (v4.x) and `@maplibre/maplibre-gl-leaflet` for vector tile rendering.

## [4.4.0] - 2026-03-20

### Added
- Replace abandoned leaflet-draw with Leaflet-Geoman (`@geoman-io/leaflet-geoman-free@2.11.4`) for marker selection — actively maintained successor with improved polygon and rectangle drawing
- `$clickedLatLng$` token support — clicking anywhere on the map sets `$clickedLat$`, `$clickedLng$`, and `$clickedLatLng$` tokens for use in SPL drilldown and proximity queries
- `showClickMarker` option — displays a crosshair marker at the last clicked map location
- `clickLatLngPrecision` option — configurable decimal precision for coordinate tokens (default: 4)
- Demo dashboard `clicked_latlng_demo.xml` showcasing coordinate tokens and haversine proximity query

### Changed
- Babel transpilation target updated from IE11 to modern evergreen browsers (Chrome, Firefox, Safari, Edge) — reduces bundle size

### Fixed
- UglifyJS `ecma` option corrected to integer `8` for Webpack 3 schema compliance

### Removed
- IE11 as a supported transpilation target
- `leaflet-draw` dependency (replaced by Leaflet-Geoman)

## [4.3.0] - 2026-03-17

### Added
- **Marker selection via lasso polygon**: Users can now draw a freehand polygon on the map to select a group of markers and write them to the Splunk dashboard token `$mapmarkers$`. Enable via **Format → Markers → Allow Selecting Markers**. A drawing toolbar appears in the top-left corner of the map when enabled. Drawing, editing, or deleting a selection shape updates the token immediately. The token value is a JSON array containing the complete SPL row for each selected marker — all fields present in the search result are included, not just coordinates. All marker types participate in selection (PNG, SVG, icon, circle, milsymbol, custom). Implemented using [leaflet-draw](https://github.com/Leaflet/Leaflet.draw) for polygon drawing and [Turf.js](https://turfjs.org/) `pointsWithinPolygon` for point-in-polygon evaluation.

### Technical Notes
- New dependencies: `leaflet-draw@1.0.4`, `@turf/turf` pinned to `7.3.4`. The PR specified `@turf/turf@^5.1.6` but `turf.within` was removed in Turf v6 — updated to `turf.pointsWithinPolygon` (identical signature and return shape) and pinned to the tested version `7.3.4`
- New config key: `display.visualizations.custom.leaflet_maps_app.maps-plus.selectingMarkers` (int, default `0`)
- `allDataPoints` GeoJSON FeatureCollection is built during the `_.each(dataRows)` pass when `selectingMarkers` is enabled; each feature stores `properties.row` as the original `dataRows` index for O(1) token payload assembly after polygon evaluation
- The draw toolbar is initialized once inside the `isInitializedDom` gate and tracked on `selectingMarkersToolbar` to prevent duplicate control registration across `updateView` cycles
- `$mapmarkers$` token payload includes all SPL fields per row — dashboards with large `description` or `tooltip` HTML fields may produce large token values; this is documented in the README with mitigation guidance
- Contribution credit: feature authored by [ChrisYounger](https://github.com/ChrisYounger) via PR #24; forward-ported to 4.3.0 codebase via cherry-pick with conflict resolution and Turf API update
- New contrib assets: `leaflet-draw.css`, draw toolbar spritesheets (`spritesheet.png`, `spritesheet-2x.png`, `spritesheet.svg`)
- Bundle rebuild required — `leaflet-draw` and `@turf/turf` are webpack bundle dependencies

## [4.2.0] - 2026-03-17

### Added
- **Dark theme auto-tile selection**: When Splunk's dark theme is active and the user has not explicitly chosen a map tile in the Format panel, the visualization now automatically selects CartoDB Dark instead of CartoDB Light. An explicit tile selection always takes precedence — this only applies when `mapTile` is still at its default value. CartoDB Dark attribution resolves through the existing `ATTRIBUTIONS` pipeline with no additional configuration required.
- **GeoJSON feature polyline support**: Multi-point `feature` layer coordinates now render as a `L.polyline` when `featureFill=false` is set on the SPL row. Previously, all multi-point features rendered as `L.polygon` regardless of fill setting, producing a closed shape with no fill rather than an open line. Single-point features (circle markers) and polygon features where `featureFill` is unset or true are unaffected.

### Changed
- **Default map tile provider changed from OpenStreetMap to CartoDB Light**: The OpenStreetMap tile servers are a community-funded resource governed by a strict usage policy. Splunk's iframe sandboxing prevents the `Referer` header from being sent with tile requests, which violates OSM's identification requirements and causes tile blocking without notice. CartoDB Light is a drop-in visual replacement — same zoom levels, same coverage, no API key required — with terms of service compatible with embedded visualization use. OpenStreetMap remains available as a selectable option in the Map Tile dropdown for users who self-host or proxy OSM tiles in a compliant configuration.

### Removed
- **`refreshInterval` config option removed**: The Dashboard Refresh Interval Format panel option and its underlying implementation have been removed. The feature forced a full `location.reload()` of the entire browser window rather than refreshing the individual visualization panel, making it destructive to any other panels on the same dashboard. Splunk's native `<refresh>` tag on the panel search element is the correct replacement — it re-runs the search and calls `updateView()` on the visualization only, with no impact on other panels. Existing dashboards with `refreshInterval` set will silently ignore the stored value after upgrading; add `<refresh>30s</refresh>` (or your desired interval) inside the panel's `<search>` block to restore per-panel refresh behavior.

### Fixed
- **Path layer control shows raw identifier when `layerDescription` is unset**: When path rows did not include a `layerDescription` field, the layer control legend fell back to the raw `pathIdentifier` field value (typically an IP address, hostname, or ID string). The fallback now renders as `Path: <identifier>` for improved readability in the layer control.
- **Coordinate dialog inputs unreadable in dark theme**: The `dialog:opened` event handler in `_darkModeInit()` set the dialog container background to black but did not style the `<input type="text">` fields inside the coordinate dialog. Input text was black-on-black. Fields now render with a dark background (`#1a1a1a`), white text, and a visible border.

### Technical Notes
- Default tile change: existing dashboards with an explicitly saved `mapTile` value are unaffected; the new default applies only to fresh installs and configurations where `mapTile` has never been set
- Dark theme tile auto-selection compares `mapTile` against the value stored in `defaultConfig` at runtime — not a hardcoded string comparison, so future default tile changes are handled correctly without revisiting this logic
- Feature polyline branch passes `featureColor`, `featureWeight`, and `featureOpacity` to `L.polyline`; `featureStroke`, `featureFill`, `featureFillColor`, and `featureFillOpacity` are intentionally excluded as they are not meaningful for open polylines
- CartoDB Light and CartoDB Dark attributions were already present in the `ATTRIBUTIONS` lookup table — no attribution pipeline changes required
- `refreshInterval` removal touches `maps-plus.js` (defaultConfig, updateView variable declaration, setTimeout block), `formatter.html` (control removed), and `README/savedsearches.conf.spec` (key entry should be removed)
- Changes span `maps-plus.js` and `formatter.html`; no webpack bundle rebuild required for either file
- No changes to SPL field names or existing Format panel options beyond those documented above
- `featureFill` field was already in `validFields` — no drilldown impact

## [4.1.1] - 2026-03-13

### Fixed
- **Implicit global variable leaks in `updateView()`**: Three variables (`pathSplits`, `renderer`, `pathSplitInterval`) were declared without `var`, leaking as window-level globals. In dashboards with multiple Maps+ visualizations on the same page, these values would bleed across viz instances — most critically, `renderer=canvas` set by one viz could silently override the default SVG renderer in a second viz on the same page.
- **Broken `var` chain in `updateView()` row iterator**: A missing comma after `layerDescription` in the `_.each(dataRows)` variable declaration chain caused `layerVisibility` and ten subsequent per-row variables (`description`, `featureDescription`, `featureTooltip`, `featureColor`, `featureWeight`, `featureOpacity`, `featureStroke`, `featureFill`, `featureFillColor`, `featureFillOpacity`, `featureRadius`) to leak as implicit globals. The last processed row's values would overwrite all previous rows, causing incorrect layer visibility, feature colors, and fill behavior across multi-layer datasets.
- **Implicit global `layerIconSize` in `addLayerToControl()`**: A missing comma after `styleColor` in the `let` declaration caused `layerIconSize` to leak as a global. This would cause a `TypeError` (`Cannot read properties of undefined`) when building layer control legend entries for custom image icon markers, silently dropping those entries from the layer control.
- **Implicit globals `fgRgb` and `fgRgba` in `onConfigChange()`**: Both variables were used in the cluster foreground color handlers but never declared in the `let` block at the top of the function, leaking as window globals on every Format panel interaction.
- **Unbounded `<style>` tag accumulation**: `onConfigChange()` and `createMarkerStyle()` appended a new `<style>` element to `<head>` on every cluster color change with no deduplication. Repeated Format panel interactions would accumulate stale style tags indefinitely. Both functions now use an idempotent update-or-create pattern, reusing the existing element via `.html()` on subsequent calls.
- **`eval()` on milsymbol direction field**: `parseInt(eval(userData["msDirection"]))` replaced with `parseFloat()`, eliminating an unnecessary `eval` call on user-supplied SPL field data.
- **`console.err` typo in Google Places error handler**: `console.err(...)` is not a valid method — Google Places initialization failures were completely silent. Corrected to `console.error()` and the caught error object is now passed through.
- **Stylesheet DOM node queried repeatedly in `_darkModeInit()`**: The `$('link[rel="stylesheet"]...')` selector was re-evaluated on every iteration of both the delete and insert loops. The reference is now cached once before the loops.
- **`validFields` array rebuilt on every `validateFields()` call**: The array literal was redeclared inside the function body, allocating a new array on every drilldown event. Promoted to a module-level property alongside `validMarkerTypes`.

### Added
- `_getConfigValue(name, configChanges, previousConfig, transform)` helper method on the visualization object. Encapsulates the repeated `_propertyExists` ternary pattern used throughout `onConfigChange()` for future use when refactoring that function.

### Technical Notes
- All fixes are internal — no changes to SPL field names, formatter options, or visualization behavior
- No bundle size impact
- Verified against 4.1.0 test dashboards: multi-viz global leak, mixed `layerVisibility`, cluster color accumulation, and `layerIconSize` legend rendering

## [4.1.0] - 2026-03-12

### Added
- **Antarctic Projection Support**: EPSG:3031 polar projection for Antarctic mapping use cases
  - Integrated proj4leaflet library for coordinate system transformations
  - GBIF Geyser and OSM Bright tile layers for Antarctic region
  - NASA GIBS (Global Imagery Browse Services) tile layer support with configurable parameters
  - Comprehensive formatter controls for GIBS layer configuration (layer ID, format, tile matrix, temporal settings)
- Updated build toolchain to support ES6 dependencies
  - Configured Babel to transpile proj4leaflet module
  - Upgraded uglifyjs-webpack-plugin to v1.3.0 for ES6 compatibility
  - Removed conflicting webpack `-p` flag to prevent double-minification

#### Military Symbol (Milsymbol) Marker Support
- New `markerType` value `milsymbol` renders NATO APP-6 / MIL-STD-2525D compliant tactical symbols directly on the map using the [milsymbol](https://github.com/spatialillusions/milsymbol) library
- Symbol rendering is driven entirely through SPL fields — no format menu configuration required for symbol appearance
- **`sidc`** — Symbol Identification Code (15-character SIDC) that defines the symbol's identity, affiliation, battle dimension, and function. Required when `markerType` is `milsymbol`.
- **`msSize`** — Base pixel size of the rendered milsymbol at the reference zoom level (integer). Controls symbol scale and defaults to a sensible size when omitted.
- **`infoSize`** — Controls the size of text modifiers (unit designation, higher formation, etc.) rendered around the symbol frame. Passed directly to the milsymbol `infoSize` option.
- **`colorMode`** — Milsymbol color scheme. Accepts `Light`, `Medium`, or `Dark`. Controls the fill palette used for affiliation colors (friend/hostile/neutral/unknown).
- **`msTooltip`** — Tooltip text displayed on symbol hover. Distinct from the standard `tooltip` field to allow independent tooltip content for milsymbol markers alongside other marker types in the same panel.

#### Zoom-Responsive Symbol Scaling
- Milsymbol markers scale automatically with map zoom using a `BASE_ZOOM` reference level and a `SCALE_FACTOR` multiplier
- At zoom levels above the base, symbols grow proportionally; at lower zoom levels they shrink, maintaining tactical readability across zoom ranges
- Scaling uses `Math.ceil()` rounding to prevent sub-pixel rendering artifacts

#### Layer Control Integration for Milsymbol Markers
- Milsymbol markers fully participate in the existing layer control system via the `layerGroup`, `layerDescription`, `layerIcon`, `layerIconColor`, and `layerIconPrefix` fields
- Fixed a scoping bug in `addLayerToControl()` where the function referenced an `icon` variable from the outer `updateView()` scope, causing a `ReferenceError` when milsymbol markers (which define `layerGroup.layerIcon` independently) attempted to render their layer control entry. The fix simplifies the conditional to test `options.layerGroup.layerIcon` truthiness directly.
- Layer control entries for milsymbol groups correctly display the configured Font Awesome icon and description label side by side

#### Demo Dashboard — Combined Arms Task Force COP
- Added `milsymbol_cop_demo.xml` — a comprehensive Common Operating Picture (COP) demonstration dashboard depicting a Combined Arms Task Force (CATF) scenario
- Scenario includes friendly maneuver units (infantry, armor, mechanized, cavalry), aviation (attack, medevac), fire support (artillery, mortar), sustainment (supply, maintenance), and hostile/unknown contacts
- Demonstrates multi-echelon symbol rendering (brigade, battalion, company, platoon), color modes, info modifiers, and layer group filtering by unit type and affiliation
- Dashboard includes token-driven controls for symbol color mode, symbol size, and frame visibility, illustrating how milsymbol parameters can be driven from Splunk dashboard inputs

### Fixed
- `addLayerToControl()`: Removed cross-scope reference to the `icon` variable from `updateView()`. The function now evaluates `options.layerGroup.layerIcon` in isolation, preventing a `ReferenceError` on any marker type that sets `layerIcon` without going through the standard PNG/SVG/icon marker path. This bug would have manifested as a silent rendering failure for the milsymbol layer control entries.

### Dependencies
- Added `milsymbol` npm package to `package.json`
- Milsymbol is bundled into `visualization.js` via the existing Webpack pipeline with no additional Babel or UglifyJS configuration required (the library is ES5-compatible)

### Changed
- Updated ATTRIBUTIONS object with HTTPS URLs for all tile providers
  - Removed deprecated Stamen tile attributions (Toner, Terrain, Watercolor)
  - Added proper attributions for OpenTopoMap, Humanitarian OSM, and Esri World Imagery
  - All tile provider URLs and attribution links now use HTTPS
- Modified webpack configuration to allow transpilation of specific node_modules (proj4leaflet, leaflet-ant-path)

### Fixed
- Antarctic projection formatter default now correctly set to disabled (0) instead of enabled (1)
  - Prevents unintended activation of Antarctic projection on existing visualizations
  - Ensures backward compatibility with existing dashboards
- Fixed potential NaN parsing issues in configuration handling

### Technical Notes
- proj4leaflet adds ~60KB to minified bundle size
- Antarctic projection optimized for data visualization in polar regions
- NASA GIBS integration supports daily satellite imagery with temporal controls

## [4.0.1] - 2026-02-18

### Fixed
- Added missing `[id]` section to app.conf (AppInspect requirement)
- Removed deprecated `leaflet_maps` visualization with vulnerable libraries
- Path playback functionality (jQuery 4.0 compatibility issue)

### Changed
- Excluded source files from release package to resolve AppInspect warnings

### Removed
- splunkjs mvc due to failing appinspect
- Splunk legacy splunk version check that is no longer needed and relied on splunkjs

## [4.0.0] - 2026-02-17

### Breaking Changes
- **Requires Splunk 10.0+** for HTTPS tile support
- **Build requirements**: Node.js 10+ and npm 6+ now required
- Removed Stamen tile options (Toner, Terrain, Watercolor) - replaced with free alternatives

### Added
- OpenTopoMap tile provider (topographic maps)
- Humanitarian OSM tile provider (clean detailed maps)
- Esri World Imagery tile provider (satellite imagery)
- Babel transpilation for modern JavaScript → ES5 compatibility

### Changed
- **Upgraded Webpack**: 1.15.0 → 3.12.0
- **Updated all map tiles to HTTPS** (Splunk 10 requirement)
- **Updated jQuery**: 3.6.0 → 4.0.0
- **Updated Underscore**: 1.13.2 → 1.13.7
- Updated build pipeline with Babel for ES6 support
- Updated imports-loader: 0.6.5 → 0.8.0
- Modernized webpack configuration for Webpack 3 compatibility

### Fixed
- Context menu "Show Details" error
- Map tile loading errors (401 Unauthorized from Stamen/Stadia)
- Measure tool auto-centering map when adding new points
- HTTPS compatibility issues with tile providers

### Removed
- Stamen Toner tiles (now requires paid API key)
- Stamen Terrain tiles (now requires paid API key)
- Stamen Watercolor tiles (now requires paid API key)

### Dependencies
**Build Tools:**
- webpack: 1.15.0 → 3.12.0
- imports-loader: 0.6.5 → 0.8.0
- babel-loader: ^7.1.5 (new)
- babel-core: ^6.26.3 (new)
- babel-preset-env: ^1.7.0 (new)

**Runtime:**
- jquery: 3.6.0 → 4.0.0
- underscore: 1.13.2 → 1.13.7

### Technical Notes
- Build time increased due to Babel transpilation (~55s vs ~3s)
- Output size reduced: 2.77 MB → 1.05 MB (minified)
- All JavaScript output is ES5-compatible for older browsers

# 3.0.0 (2019-05-09)
* Removed support for Splunk 6.x
* Added support for custom icons
* Added support for Icon only display
* Added support for Features (Polygon, Line or Point) using measure tool
    - Feature Definition displayed on measure completion
    - Draw features using feature Definition
* Added layerPriority field to stack vector layers (works with heatmaps, path lines, circle markers and features)
* Added layerDescription field to name layers in layer dialog (works with heatmaps, path lines, circle markers and features)
* Added layerIcon, layerIconSize, layerIconColor and layerIconPrefix to style groups in layer control
* Added pathLayer field to group paths
* Added Ant Path to visualize direction of path
* Dark Mode support
* Upgrade Leaflet to 1.5.1
* Upgrade leaflet.markercluster to 1.4.1
* Upgrade Font Awesome to v5.8.2 
* Upgrade Ionicons to v4.5.8
* Format menu changes now dynamically update map for 
    - Map Tile
    - Map Tile Override
    - Map Attribution Override
    - Scroll Wheel Zoom
    - Full Screen Mode
    - Context menu
    - Default Height
    - Map Zoom
    - Center lat
    - Center lon
    - Min Zoom
    - Max Zoom
    - Disable Clustering at Zoom
    - Cluster colors
    - Measure tool active and completed colors
    - Measure tool position