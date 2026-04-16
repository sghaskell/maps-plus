# Testing — Maps+ for Splunk

> Last verified: 2026-04-16. This document reflects the current state of test infrastructure and recommends a testing strategy going forward.

---

## 1. Current State

**There are no automated tests.** The Maps+ project has zero test coverage:

| Aspect                  | Status                    |
| ----------------------- | ------------------------- |
| **Test framework**      | Not installed (no Jest, Jasmine, Mocha, Karma, etc.) |
| **Linting**             | None configured (no ESLint, JSHint, JSLint) |
| **CI pipeline**         | No GitHub Actions, Jenkins, or CI configuration exists |
| **Build verification**  | Manual — `npm run build` in `appserver/static/visualizations/maps-plus/` |
| **Deployment testing**  | Manual — upload `.tgz` via Splunk UI or use deploy script |

The project is a **single ~3,500-line AMD module** (`maps-plus.js`) compiled through Webpack 5 + Babel 7 into one 2.8 MB bundle (`visualization.js`). The module depends on:
- 2 external APIs: `api/SplunkVisualizationBase`, `api/SplunkVisualizationUtils` (provided by Splunk runtime)
- ~38 NPM dependencies (Leaflet, jQuery, Underscore, turf.js, milsymbol, maplibre-gl, etc.)

Testing the module requires a running Splunk instance because:
1. The Splunk visualization API classes are **not available in Node.js** — they are browser globals injected by Splunk's UI framework.
2. Leaflet and most plugins require a DOM context (`document`, `window`).
3. Tile layer loading, KML/KMZ HTTP requests, and Google Places API calls need real network access.

---

## 2. Verification Method: Example Dashboards

The project ships with **24 example dashboard views** in `default/data/ui/views/` that serve as de facto integration tests. Each covers one or more feature areas:

| Dashboard file                | Feature(s) tested                                                  |
| ----------------------------- | ------------------------------------------------------------------ |
| `png_markers.xml`             | PNG custom markers, light theme                                    |
| `png_markers_dark.xml`        | PNG custom markers, dark theme                                     |
| `svg_markers.xml`             | SVG inline markers                                                 |
| `custom_icons.xml`            | FontAwesome icon markers (markerType=icon)                         |
| `custom_icon_images.xml`      | Custom image URL markers                                           |
| `circle_markers.xml`          | Circle marker type (turf.js circle geometry)                       |
| `milsymbol.xml`               | MilStd-2525C military symbols (milsymbol library)                  |
| `cluster_colors.xml`          | Cluster color ranges (green/yellow/red thresholds)                 |
| `multicluster_groups.xml`     | Multiple named cluster groups with independent settings            |
| `heatmap.xml`                 | SimpleHeat-based heatmap layer                                     |
| `path_lines.xml`              | Path/tracing line rendering                                        |
| `playback.xml`                | Playback animation control on paths                                |
| `features.xml`                | Feature drawing (polygon, measure tool WKT output, lasso with turf.js) |
| `drilldown.xml`               | Drilldown token emission on marker click/double-click              |
| `google_streetview_drilldown.xml` | Google Street View integration + drilldown                   |
| `kml_overlay.xml`             | KML/KMZ file overlay import                                        |
| `ant_path.xml`                | Ant path animation (animated dashed line)                          |
| `antarctic_projection.xml`    | Antarctic polar stereographic projection (proj4leaflet)            |
| `multilayer_groups.xml`       | Multiple named layer groups (layerGroup config)                    |
| `selecting_markers.xml`       | Lasso selection tool with turf.js, token emission                  |
| `clicked_latlng_demo.xml`     | Click-to-get-latlng, marker at cursor position                     |
| `stale_markers_validation.xml`| Marker validation/staleness                                        |
| `help.xml`                    | Application help and documentation                                 |

Each dashboard contains:
- A `<search>` with a Splunk search pipeline that produces the required fields (latitude, longitude, etc.)
- 80+ `<option name="leaflet_maps_app.maps-plus.*">` elements setting configuration values
- In some cases, `<drilldown>` blocks defining post-click actions

These dashboards are the primary validation mechanism: if a feature breaks, users or QA open the relevant dashboard and observe whether the map renders correctly.

---

## 3. Feature Surface to Test

Based on analysis of the codebase and dashboard coverage, the following major feature areas would need test coverage:

### 3.1 Marker Types (6 types)

| Type          | Code area                            | Key config fields                          |
| ------------- | ------------------------------------ | ------------------------------------------ |
| **PNG**       | `_createMarkerImage` branch for png  | `markerType=png`, `customIcon`, `customIconShadow` |
| **SVG**       | SVG string rendering                 | `markerType=svg`, inline SVG content       |
| **Icon**      | FontAwesome marker rendering         | `markerType=icon`, `icon`, `prefix`, `iconColor` |
| **Circle**    | turf.js circle geometry generation   | `markerType=circle`, `circleRadius`, `circleColor`, `circleFillOpacity` |
| **MilSymbol** | milsymbol library API                | `markerType=milsymbol`, `msIconColor`, `msFrameColor`, `msInfoColor`, `msOutlineColor` |
| **Custom**    | Generic custom image                 | `markerType=custom`, `customIcon`          |

### 3.2 Layer Management

| Layer Type        | Code area                                  | Key config fields                    |
| ----------------- | ------------------------------------------ | ------------------------------------ |
| **layerGroup**    | Named group management, addLayerToControl  | `layerGroup`, `layerDescription`, `layerVisibility` |
| **pathLayer**     | Path line rendering, drawPath              | `pathLayer`, `pathColor`, `pathWeight`, `pathOpacity` |
| **heatmapLayer**  | SimpleHeat integration, HeatLayer.js       | `heatmapEnable`, `heatmapRadius`, `heatmapBlur`, `heatmapMinOpacity` |
| **featureLayer**  | Leaflet Draw plugin integration            | `featureLayer`, `featureColor`, `featureStroke`, `featureFill` |

### 3.3 Clustering Behavior

- MarkerClusterGroup initialization (chunked loading, max cluster radius)
- Cluster color threshold ranges (green/yellow/red at warningThreshold/criticalThreshold)
- Spiderfy distance multiplier and maxSpiderfySize
- Single marker mode toggle
- Disable clustering at zoom level
- Multiple named cluster groups with independent settings

### 3.4 KML/GPX Import and Export

- KMZ loading via JSZip (unzip + extract KML)
- KML loading via jQuery Ajax (XML parsing fallback)
- SVG/KML icon mapping for placemarks
- NetworkLink support in KMZ
- GPX track rendering

### 3.5 Path Tracing with Playback Animation

- Path grouping by identifier field (`pathIdentifier`)
- Ant path animation (`antPath=true`) with configurable pulse color, delay, dash array
- Playback controls (slider, date, play/pause) via LeafletPlayback plugin
- Path splitting at time intervals (`pathSplits`, `pathSplitInterval`)
- Multiple paths with independent colors from `pathColorList`

### 3.6 Heatmap Rendering

- SimpleHeat data point ingestion
- Point intensity normalization (`heatmapMaxPointIntensity`)
- Radius and blur parameters
- Color gradient mapping (JSON string → simpleheat color array)
- Minimum opacity setting
- Heatmap-only mode (no markers, only heatmap layer)

### 3.7 Feature Drawing (Measure Tool WKT Output)

- Leaflet Draw / Geoman toolbar activation
- Polygon drawing for lasso selection
- Measure tool integration (length/area with configurable units)
- WKT output format for measure results
- Feature stroke/fill color and weight customization

### 3.8 Lasso Selection with turf.js

- Polygon/rectangle creation via PM controls
- `turf.pointsWithinPolygon` spatial query
- Token emission (`mapmarkers` token set in default/submitted token models)
- Dynamic re-query on polygon edit/delete

### 3.9 Drilldown Token Emission

- Marker click/double-click event handling
- Drilldown field extraction (non-standard fields from `validateFields`)
- Action types: contextual drilldown vs. link navigation
- Configuration: `drilldown=1`, `drilldownAction=click|dblclick`
- Click-latlng token emission (`clickLatLngToken=1`)

### 3.10 MapLibre GL vs Leaflet Tile Layer Switching

- Standard tile layer (OSM, CartoDB, ESRI) via `L.tileLayer`
- MapLibre GL integration via `@maplibre/maplibre-gl-leaflet` wrapper
- Preset styles (`liberty`, `osm-bright`, etc.) from OpenFreeMap
- Style URL override support
- Dynamic switch on config change (`useOpenFreeMap` toggle)

### 3.11 Antarctic Projection Mode

- proj4leaflet custom CRS setup
- GBIF Antarctic tile server
- Custom tile size (512 vs default 256)
- Google Earth Imagery for Antarctica (GIBS layer)

### 3.12 Google Street View Integration

- `load-google-maps-api` wrapper
- Street View panorama initialization at marker location
- Google Places autocomplete plugin integration
- API key retrieval from Splunk `storage/passwords` REST endpoint

### 3.13 Internationalization (en/ja)

- jquery.i18n.js plugin chain (7 sub-modules)
- Locale switching via `i18nLanguage` config (`en`, `ja`)
- JSON locale files in `contrib/i18n/en.json` and `contrib/i18n/ja.json`
- Plural rule parsing (CLDRPluralRuleParser.js)

### 3.14 Additional Features

- **Bing Maps tile layer** — API key auth via Splunk credentials store
- **Google Places search** — autocomplete control on map
- **Context menu** — right-click per-layer customization with add/remove/playback options
- **Dark mode** — dynamic CSS class toggling, popup/tooltip/bg recoloring at runtime
- **Full-screen mode** — parent element height manipulation
- **Measure tool** — length/area with configurable primary and secondary units

---

## 4. Build Verification

### Build process

```bash
cd appserver/static/visualizations/maps-plus
npm install
npm run build        # runs: webpack
```

Webpack output:
- **File**: `visualization.js` (~2.8 MB production minified)
- **Format**: AMD bundle (compatible with RequireJS/Splunk UI)
- **Plugins**: TerserPlugin (ECMA 2017), CopyPlugin (CSS extraction)

### What build verification catches

| Check                      | Pass criteria                          |
| -------------------------- | -------------------------------------- |
| `npm run build` exits 0    | No Webpack compilation errors          |
| Bundle size                | ~2.8 MB target (monitor for regressions)|
| No "Mismatched anonymous define" | Correct imports-loader configuration for contrib modules |
| External APIs resolved     | `api/SplunkVisualizationBase` and `api/SplunkVisualizationUtils` are externals, not bundled |

### Deployment verification

The deploy script (`appserver/static/visualizations/maps-plus/scripts/deploy.sh`) performs:

1. Runs `npm run build` (implicit — must be run first)
2. Stages files to a temp directory
3. Strips dev artifacts (`src/`, `node_modules/`, `webpack.config.js`, `package.json`)
4. Creates `maps-plus-for-splunk_<version>.tgz` at the repo root
5. Output is uploaded via Splunk UI: **Apps > Manage Apps > Install app from file**

There is no automated deployment or smoke test after upload — verification requires manual interaction with Splunk.

---

## 5. Recommended Testing Strategy

Given the browser-based nature of this Splunk plugin and the inability to run tests in Node.js (due to Splunk API dependencies and Leaflet DOM requirements), a multi-layered approach is recommended:

### Layer 1: Unit Tests — Karma + Jasmine (or Jest with jsdom)

**Goal**: Test pure utility functions and logic that do not require Splunk runtime.

| Testable unit | Why it works in test runner |
| --- | --- |
| `validateFields(obj)` | Pure function — no DOM, no API dependency |
| `_stringToJSON(value)` | String parsing only |
| `convertHex(value)` | Regex matching |
| `hexToRgb(hex)` | String regex + parseInt |
| `parseColor(str)` | Partially testable (needs `document.createElement('canvas')`; jsdom can provide this) |
| `isArgTrue(arg)` | Pure boolean logic |
| `deriveClusterColors(normalizedColor)` | Color transformation only |
| `_getProperty`, `_getEscapedProperty` mocks | Can mock the namespace info lookup |

**Suggested setup**:

```json
// package.json devDependencies additions
{
  "jest": "^29.0.0",
  "jsdom": "^24.0.0",
  "@testing-library/jest-dom": "^6.0.0"
}
```

Create `__tests__/maps-plus-utils.test.js` for the testable utility functions. Mock `SplunkVisualizationBase`, `SplunkVisualizationUtils`, and all Leaflet dependencies using Jest `__mocks__/` directory:

```js
// __mocks__/leaflet.js
module.exports = {
    tileLayer: jest.fn(() => ({ setUrl: jest.fn(), addTo: jest.fn() })),
    MarkerClusterGroup: jest.fn(() => ({ addLayer: jest.fn() })),
    latLng: jest.fn((lat, lng) => [lat, lng]),
    divIcon: jest.fn(() => ({})),
    featureGroup: jest.fn(() => ({})),
    map: jest.fn(() => ({
        addLayer: jest.fn(),
        setZoom: jest.fn(),
        panTo: jest.fn(),
        getCenter: jest.fn(),
        getSize: jest.fn(() => ({ x: 800, y: 600 })),
        on: jest.fn(),
        invalidateSize: jest.fn(),
    }))
};
```

### Layer 2: Component Tests — Karma + PhantomJS/ChromeHeadless

**Goal**: Test Leaflet initialization and layer creation with a real browser environment but mocked Splunk API.

- Set up Karma with `karma-chrome-launcher` and `karma-jasmine`.
- Use `sinon` for spy/mock of Splunk API methods (`drilldown()`, `_getSafeUrlProperty()`).
- Verify that:
  - `L.map()` is called with correct options (center, zoom, controls)
  - Tile layer URL matches config value
  - MarkerClusterGroup has correct parameters
  - Layer control is added/removed based on `layerControl` setting

### Layer 3: E2E Tests — Playwright or Cypress

**Goal**: Full integration against a running Splunk dev instance.

```
┌──────────────────┐    ┌──────────────┐
│  Playwright/Cypress │→│  Splunk Dev   │
│  (browser automation)│  Docker/Local   │
└──────────────────┘    └──────────────┘
```

**Setup**: Run a Splunk instance in Docker (`splunk/splunk:latest`) with the Maps+ app installed, then automate dashboard navigation.

**Test scenarios per dashboard file**:

```js
// Example Playwright test structure
describe('Marker Types', () => {
  it('renders PNG markers from png_markers.xml dashboard', async ({ page }) => {
    await page.goto('/app/leaflet_maps_app/png_markers');
    const mapExists = await page.locator('.leaflet-tile-pane').count();
    expect(mapExists).toBeGreaterThan(0);
    // Verify at least one marker icon is visible
    const markers = await page.locator('.custom-marker').all();
    expect(markers.length).toBeGreaterThan(0);
  });

  it('renders milsymbol icons from milsymbol.xml dashboard', async ({ page }) => {
    await page.goto('/app/leaflet_maps_app/milsymbol');
    // Milsymbol renders SVG-based military symbols
    const msSymbols = await page.locator('.ms-symbol').count();
    expect(msSymbols).toBeGreaterThan(0);
  });

  it('drilldown emits token on marker click', async ({ page }) => {
    await page.goto('/app/leaflet_maps_app/drilldown');
    // Click a marker, verify drilldown link opens or context panel updates
    const marker = page.locator('.custom-marker').first();
    await marker.dblclick();
    // Verify a new tab or panel opened with expected URL containing drilldown params
  });

  it('heatmap renders points from heatmap.xml dashboard', async ({ page }) => {
    await page.goto('/app/leaflet_maps_app/heatmap');
    const heatmapCanvas = await page.locator('.leaflet-heatmap-layer canvas').count();
    expect(heatmapCanvas).toBeGreaterThanOrEqual(1);
  });

  it('playback controls appear on path_lines.xml when enabled', async ({ page }) => {
    await page.goto('/app/leaflet_maps_app/playback');
    const playbackControl = await page.locator('.leaflet-playback-control').first();
    expect(playbackControl).toBeTruthy();
  });

  it('feature drawing toolbar activates from features.xml', async ({ page }) => {
    await page.goto('/app/leaflet_maps_app/features');
    const drawToolbar = await page.locator('.leaflet-draw-toolbar').count();
    expect(drawToolbar).toBeGreaterThan(0);
  });

  it('Antarctic projection renders from antarctic_projection.xml', async ({ page }) => {
    await page.goto('/app/leaflet_maps_app/antarctic_projection');
    // Verify map is centered on Antarctic region (different tile provider)
    const tiles = await page.locator('.leaflet-tile').first();
    expect(tiles.getAttribute('src')).toContain('gbif.org');
  });

  it('Google Places search control renders from google_streetview_drilldown.xml', async ({ page }) => {
    await page.goto('/app/leaflet_maps_app/google_streetview_drilldown');
    const placesSearch = await page.locator('.gplaces-autocomplete').count();
    // Should appear at topleft position per config
    expect(placesSearch).toBeGreaterThanOrEqual(1);
  });

  it('KML overlay loads from kml_overlay.xml', async ({ page }) => {
    // Upload a sample KMZ file, verify placemarks appear as markers
    // This requires file upload interaction
  });
});
```

### Layer 4: Manual Test Checklist (Per Feature Area)

Until automation is in place, maintain this checklist against the example dashboards:

**Every release should be validated against:**

1. [ ] `png_markers.xml` — Markers render at correct positions, custom icons load from URLs
2. [ ] `png_markers_dark.xml` — Same as above but with dark theme CSS applied
3. [ ] `svg_markers.xml` — SVG content renders correctly inside marker icons
4. [ ] `custom_icons.xml` — FontAwesome icons appear in markers, color customization works
5. [ ] `circle_markers.xml` — Circles (not point markers) render from turf.js geometry
6. [ ] `milsymbol.xml` — MilStd-2525C symbols render correctly, stroke/outline colors apply
7. [ ] `cluster_colors.xml` — Clusters show green (< warning), yellow (< critical), red (>= critical)
8. [ ] `multicluster_groups.xml` — Multiple cluster groups display with independent configs
9. [ ] `heatmap.xml` — Heatmap points render, color gradient applied correctly
10. [ ] `path_lines.xml` — Path lines connect coordinate sequences with correct colors
11. [ ] `playback.xml` — Playback slider advances path through time, controls toggle on/off
12. [ ] `features.xml` — Drawing tools activate, measure tool outputs WKT strings correctly
13. [ ] `drilldown.xml` — Click/double-click opens drilldown with correct token substitution
14. [ ] `google_streetview_drilldown.xml` — Street View panorama loads at marker location
15. [ ] `kml_overlay.xml` — KMZ/KML overlay displays placemarks and paths from uploaded file
16. [ ] `ant_path.xml` — Animated dashed path renders with pulsing effect
17. [ ] `antarctic_projection.xml` — Map uses Antarctic CRS, tiles load from GBIF
18. [ ] `multilayer_groups.xml` — Layer control shows/hides groups independently
19. [ ] `selecting_markers.xml` — Lasso tool selects markers, emits `mapmarkers` token
20. [ ] `clicked_latlng_demo.xml` — Click produces marker at cursor position, lat/lng displayed

### Recommended Priority for Automation Investment

| Priority | Layer | Effort | Rationale |
| --- | --- | --- | --- |
| **1** | Unit tests (Jest + jsdom) | Low-Medium | Tests pure utility functions that have no DOM or Splunk API dependency; quick ROI |
| **2** | Manual checklist automation via script | Medium | Script to validate all 24 dashboards render without JS errors (headless Chrome, parse console) |
| **3** | E2E tests (Playwright) | High | Requires Splunk dev environment setup and maintenance; highest value but most complex |
| **4** | Build CI pipeline | Low | Add GitHub Actions to run `npm run build` on every PR as a gate |

---

## Appendix: File Locations Reference

| Artifact | Path |
| --- | --- |
| Source module | `appserver/static/visualizations/maps-plus/src/maps-plus.js` (3,564 lines) |
| Compiled bundle | `appserver/static/visualizations/maps-plus/visualization.js` (~2.8 MB) |
| Build config | `appserver/static/visualizations/maps-plus/webpack.config.js` |
| Package manifest | `appserver/static/visualizations/maps-plus/package.json` |
| CSS entry point | `appserver/static/visualizations/maps-plus/visualization.css` |
| Contrib CSS | `appserver/static/visualizations/maps-plus/contrib/css/` (20 files) |
| Default settings | `default/savedsearches.conf` (~80 setting entries) |
| Dashboard examples | `default/data/ui/views/*.xml` (24 files) |
| i18n files | `appserver/static/visualizations/maps-plus/contrib/i18n/en.json`, `ja.json` |
| Deploy script | `appserver/static/visualizations/maps-plus/scripts/deploy.sh` |
