Maps+ for Splunk Changelog
==========================

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