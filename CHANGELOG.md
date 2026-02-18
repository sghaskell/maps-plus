Maps+ for Splunk Changelog
==========================

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