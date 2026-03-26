# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maps+ is a Splunk custom visualization app (v4.6.0) providing an interactive Leaflet-based mapping plugin. It is packaged as a standard Splunk app and deployed to a Splunk instance.

## Build Commands

All build commands run from the maps-plus visualization directory:

```bash
cd appserver/static/visualizations/maps-plus

# Install dependencies (use --ignore-scripts to avoid node-sass failure from leaflet-measure fork)
npm install --ignore-scripts

# Production build
npm run build

# Build and deploy to running Splunk Docker container
npm run deploy

# Auto-rebuild on save (deploy manually when ready to test)
npm run watch
```

The build produces:
- `visualization.js` — AMD module bundle (Webpack 5 + Babel 7 + TerserPlugin)
- `contrib/css/leaflet-geoman.css` — copied from node_modules

There are no tests and no linter configured.

## Architecture

### Splunk App Structure

```
appserver/static/visualizations/
  maps-plus/              # Main visualization plugin
    src/maps-plus.js      # Single source file (~3,300 lines), AMD module
    visualization.js      # Compiled output bundle (2.8MB, committed to repo)
    visualization.css     # Compiled stylesheet
    contrib/              # Bundled third-party assets (CSS, fonts, images, JS)
  google-street-view/     # Street View drilldown sub-plugin
default/
  app.conf                # App metadata (id: leaflet_maps_app, version)
  visualizations.conf     # Declares the two custom visualizations
  data/ui/views/          # 16 example/demo dashboards (Splunk XML)
```

### How the Plugin Works

`src/maps-plus.js` is a single monolithic AMD module that extends `SplunkVisualizationBase`. Splunk loads it via RequireJS. The module:

1. Receives search results as rows of SPL fields (`latitude`, `longitude`, plus 50+ optional fields)
2. Renders a Leaflet map with markers, heatmaps, feature layers, or path lines depending on field values
3. Communicates back to Splunk dashboards via drilldown tokens (e.g., `$clickedLatLng$`)

Key field-driven behaviors in the source:
- **Marker type** determined by `markerType` field (png, svg, icon, circle, milsymbol, wkt)
- **Layers** controlled by `layerGroup`, `pathLayer`, `heatmapLayer`, `featureLayer` fields
- **Clustering** via `leaflet.markercluster`
- **Drawing tools** via `@geoman-io/leaflet-geoman-free` (replaced leaflet-draw in v4.4.0)

### Build Pipeline

Webpack 5 bundles `src/maps-plus.js` into an AMD `visualization.js` output. Babel targets modern browsers (Chrome, Firefox, Safari, Edge — last 2 versions; IE11 dropped in v4.4.0). TerserPlugin minifies with `ecma: 2017`.

The compiled `visualization.js` is committed to the repository and must be rebuilt after source changes.

### Splunk API Integration

External Splunk modules (e.g., `splunkjs/mvc/...`) are declared as webpack `externals` and not bundled — they are provided by the Splunk runtime via RequireJS.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `leaflet@^1.9.4` | Core map rendering |
| `leaflet.markercluster` | Marker clustering |
| `@geoman-io/leaflet-geoman-free` | Drawing/editing tools |
| `@turf/turf` | Geospatial analysis (lasso selection, etc.) |
| `milsymbol` | Military symbology markers |
| `leaflet-ant-path` | Animated path lines |
| `proj4leaflet` | Custom map projections |
| `@mapbox/togeojson` | KML/GPX → GeoJSON conversion |

## Release Checklist

Follow these steps in order when cutting a release:

1. **Bump version** in `default/app.conf` (both `[id]` and `[launcher]` sections)
2. **Write changelog entry** in `CHANGELOG.md` — read the actual source code for each fix before writing descriptions, never infer from commit messages alone
3. **Commit** version bump + changelog to `develop`
4. **Merge `develop` → `master`** with `--no-ff`, tag `vX.Y.Z` on master
5. **Build package** from the maps-plus viz dir: `bash scripts/deploy.sh`
6. **Verify package contents**: `tar -tzf maps-plus-for-splunk_XYZ.tgz | head -40` — confirm `leaflet_maps_app/appserver`, `leaflet_maps_app/default`, `leaflet_maps_app/static`, `leaflet_maps_app/README` are all present before uploading
7. **Review open GitHub issues** against the changelog — close resolved issues with a comment explaining what was fixed and in which version; use `GITHUB_TOKEN` env var for API access
8. **Write Splunkbase release notes** in `docs/release-notes-X.Y.Z.md` — user-facing language, no implementation detail

## Development Notes

- The `visualization.js` bundle is large (2.8MB) and committed to the repo — rebuild it whenever `src/maps-plus.js` changes.
- `google-street-view/` uses a legacy Webpack 1 config and has its own separate `package.json`.
- Example dashboards in `default/data/ui/views/` are Splunk XML and demonstrate every major feature.
- The app ID is `leaflet_maps_app` (used in Splunk's app directory and URLs).
