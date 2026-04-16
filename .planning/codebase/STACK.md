# Technology Stack — Maps+ for Splunk v4.6.x

## 1. Languages & Frameworks

| Layer | Detail |
|-------|--------|
| **Primary language** | JavaScript (ES2017+) |
| **Module system** | AMD (`define([...], function(...)`) — compiled to a single UMD-compatible bundle loaded by RequireJS inside Splunk Web |
| **Base class** | `SplunkVisualizationBase` (injected at runtime via `api/SplunkVisualizationBase`) |
| **Runtime** | RequireJS + Splunk Web framework (`splunkjs/mvc` used at runtime for token/events) |
| **Secondary module** | `google-street-view/` — standalone visualization with its own AMD bundle |

The entire maps-plus codebase lives in a single file: `src/maps-plus.js` (~3,564 lines), which exports an object extending `SplunkVisualizationBase`. There are no sub-component files within the main source directory.

## 2. Core Dependencies

### Mapping Libraries (7)
| Package | Version | Purpose |
|---------|---------|---------|
| `leaflet` | ^1.9.4 | Core map rendering engine |
| `leaflet.markercluster` | ^1.5.3 | Marker clustering for large datasets |
| `leaflet-ant-path` | ^1.3.0 | Animated origin→destination paths |
| `proj4leaflet` | ^1.0.2 | Custom CRS / coordinate reprojection (PROJ.4) |
| `maplibre-gl` | ^4.7.1 | Vector tile rendering (GL-style maps) |
| `@maplibre/maplibre-gl-leaflet` | ^0.0.22 | Bridges MapLibre GL tiles into Leaflet's layer system |
| `@geoman-io/leaflet-geoman-free` | 2.11.4 | Draw/edit vector features (polygons, lines, lasso) |

### Tile Layer / Geospatial Plugins (5)
| Package | Version | Purpose |
|---------|---------|---------|
| `leaflet-bing-layer` | ^3.3.1 | Bing Maps tile layer integration |
| `leaflet-contextmenu` | ^1.4.0 | Right-click context menu on the map |
| `leaflet-dialog` | ^1.0.5 | Custom dialog plugin for Leaflet popups |
| `leaflet-google-places-autocomplete` | ^0.0.8 | Geocoding search bar with Google Places |
| `leaflet-measure` (sghaskell fork) | master branch | Measure distances/areas on map |

### Data Format & Spatial Analysis (3)
| Package | Version | Purpose |
|---------|---------|---------|
| `@mapbox/togeojson` | ^0.16.2 | KML/GPX → GeoJSON conversion |
| `@turf/turf` | 7.3.4 | Geospatial analysis (area, bbox, lasso) |
| `milsymbol` | ^3.0.3 | MIL-STD-2525B/C military symbology rendering |

### Utility Libraries (8)
| Package | Version | Purpose |
|---------|---------|---------|
| `jquery` | ^4.0.0 | DOM manipulation, AJAX, jQuery.i18n |
| `underscore` | ^1.13.7 | Functional utilities (`_.forEach`, `_.map`) |
| `moment` | ^2.20.1 | Date/time parsing and formatting |
| `jszip` | ^3.1.2 | ZIP/KMZ archive reading & writing |
| `jszip-utils` | 0.0.2 | Async file loading for JSZip |
| `spin.js` | ^2.3.2 | Loading spinner indicators |
| `simpleheat` | ^0.4.0 | SVG-based heatmap rendering (HeatLayer) |
| `load-google-maps-api` | ^1.0.0 | Dynamic loading of Google Maps JS API |

### Splunk Integrations (2)
| External Module | Resolution | Purpose |
|-----------------|------------|---------|
| `api/SplunkVisualizationBase` | RequireJS module at runtime | Base class for custom visualizations |
| `api/SplunkVisualizationUtils` | RequireJS module at runtime | Utility helpers (data parsing, field handling) |

### Dev Dependencies (6)
| Package | Version | Purpose |
|---------|---------|---------|
| `webpack` | ^5.99.0 | Module bundler |
| `webpack-cli` | ^6.0.0 | CLI for webpack |
| `@babel/core` | ^7.26.0 | Babel compiler core |
| `@babel/preset-env` | ^7.26.0 | Target-based transpilation presets |
| `babel-loader` | ^9.2.1 | Webpack + Babel integration |
| `copy-webpack-plugin` | ^12.0.0 | Copy assets during build |
| `imports-loader` | ^4.0.1 | Inject global variables into UMD modules at build time |

**Total npm dependencies: 30** (22 runtime + 8 dev). Google-street-view adds ~3 more (jquery ^3.6.0, underscore ^1.13.2, load-google-maps-api-2 ^1.0.2).

## 3. Build System

### Webpack 5 Configuration (`maps-plus/webpack.config.js`)

- **Entry**: `./src/maps-plus.js` (single AMD module)
- **Output**: `visualization.js` in the `maps-plus/` root directory, formatted as an AMD library
- **Target**: `web` (browser-only)
- **Mode**: `production`

#### Transpilation Pipeline
1. `babel-loader` processes all `.js` files **except** those in `node_modules/`, with targeted exclusions for:
   - `leaflet-ant-path`
   - `proj4leaflet`
   - `@geoman-io/leaflet-geoman-free`
   - `maplibre-gl`
   - `@maplibre/maplibre-gl-leaflet`
2. **Target browsers**: Last 2 versions of Chrome, Firefox, Safari, Edge (IE11 dropped in v4.4.0)
3. Output is ES5-compatible via `@babel/preset-env` with `modules: false`

#### UMD Module Compatibility
The build uses three patterns to handle legacy AMD/UMD modules from node_modules:

- **Pattern A** — `imports-loader` with `additionalCode`: Injects global variable assignments (e.g., `var L = require("leaflet")`) into specific files like `leaflet.spin.js`, `HeatLayer.js`, `leaflet.awesome-markers.js`, and all jQuery.i18n modules.
- **Pattern B** — `additionalCode: 'var define = false'`: Disables AMD `define` in `leaflet.featuregroup.subgroup-src.js`.
- **Pattern C** — Multiple jQuery aliases injected for CLDRPluralRuleParser and jquery.i18n submodules.

This approach preserves Webpack's ability to rewrite `define()` calls as AMD at build time, avoiding "Mismatched anonymous define" errors that would occur with ESM import syntax.

#### Code Splitting Strategy
**No code splitting** — all dependencies are bundled into a single 2.8MB `visualization.js`. The project uses:
- `TerserPlugin` with ECMA 2017 minification, mangle enabled, parallel processing
- `performance.hints: false` to suppress bundle-size warnings

#### External Modules
Two modules are excluded from bundling and expected to be provided by the Splunk runtime:
```js
externals: [
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
]
```

### Google Street View Build (Webpack 1)

A separate legacy build at `google-street-view/`:
- **Webpack version**: ^1.12.6 (very old)
- **Entry**: `./src/main.js`
- **Output**: `visualization.js` in the same directory
- **DevDependencies**: `imports-loader` ^0.6.5, webpack ^1.12.6
- Uses `-d` flag for source maps in dev mode

## 4. Asset Pipeline

### CSS (bundled separately)
| Source | Destination | Notes |
|--------|-------------|-------|
| `node_modules/maplibre-gl/dist/maplibre-gl.css` → `contrib/css/` | CopyPlugin at build time |
| `node_modules/@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css` → `contrib/css/` | CopyPlugin at build time |
| Manual copies in `contrib/css/` (~20 files) | Leaflet core, markercluster, draw, contextmenu, awesome-markers, geoman, gplaces-autocomplete, legend, measure, vector-markers, spin, playback, dark theme, fontawesome, ionicons, glyphicon, markers, screen |

### Fonts (in `contrib/fonts/`)
- **Font Awesome** v7.2.0 (`fa-brands-400`, `fa-regular-400`, `fa-solid-900` in .eot/.svg/.ttf/.woff/.woff2 + `fa-v4compatibility.woff2` for V4 shim)
- **Ionicons** (`ionicons.*` in .eot/.svg/.ttf/.woff/.woff2)
- **Glyphicons Halflings** (`glyphicons-halflings-regular.*`) — Bootstrap legacy icons

### Images (in `contrib/images/`)
- Leaflet default markers (icon, icon-2x, shadow, layers)
- Custom marker styles (matte, plain, shadow, soft variants at 1x and 2x)
- Measure tool icons (rulers, start, check, cancel, focus, trash)
- Geoman spritesheet (png, png-2x, svg)

### Localization (in `contrib/i18n/`)
- `en.json` — English translations
- `ja.json` — Japanese translations

## 5. Package Format

The app is distributed as a Splunk app tarball (`leaflet_maps_app.tgz` or `maps-plus-for-splunk_46X.tgz`).

### Directory structure (as unpacked into Splunk `$SPLUNK_HOME/etc/apps/`)
```
leaflet_maps_app/
├── appserver/
│   └── static/
│       └── visualizations/
│           ├── maps-plus/
│           │   ├── visualization.js     (2.8MB bundled output)
│           │   ├── visualization.png    (preview thumbnail)
│           │   ├── src/maps-plus.js     (source, ~3,564 lines)
│           │   ├── scripts/deploy.sh    (deploy helper)
│           │   └── contrib/
│           │       ├── css/             (~20 CSS files)
│           │       ├── fonts/           (Font Awesome + Ionicons + Glyphicons)
│           │       ├── images/          (markers, sprites, tool icons)
│           │       ├── i18n/            (en.json, ja.json)
│           │       └── js/              (~20 contrib JS files: HeatLayer, Modal, 
│           │                                leaflet-spawn plugins, jquery.i18n modules)
│           └── google-street-view/
│               ├── visualization.js     (separate bundle)
│               ├── visualization.png
│               ├── src/main.js          (source)
│               └── formatter.html       (preview page)
├── default/
│   ├── app.conf                 (app metadata: name=leaflet_maps_app, v4.6.1)
│   ├── visualizations.conf      (maps config for Splunk visualization picker)
│   └── savedsearches.conf       (default saved searches / macros)
├── lookups/                     (CSV lookup tables)
├── metadata/                    (Splunk app metadata)
└── README/                      (app documentation)
```

## 6. Development Workflow

```bash
# 1. Install dependencies
cd appserver/static/visualizations/maps-plus
npm install

# 2. Build (production bundle + asset copy)
npm run build          # webpack --mode=production
npm run watch          # webpack --watch for live reload during dev

# 3. Deploy to local Splunk instance
bash scripts/deploy.sh   # rsync/copy visualization.js + contrib/ to running Splunk web dir

# 4. Reload in Splunk Web
# Navigate to Maps+ app → Dashboard Studio or Simple XML dashboards (16 examples)
```

### Key scripts in `package.json`
| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `webpack` | Production build |
| `watch` | `webpack --watch` | File watcher for development |
| `deploy` | `npm run build && bash scripts/deploy.sh` | Full build + deploy pipeline |

### Build outputs summary
| Artifact | Size | Location |
|----------|------|----------|
| `visualization.js` | ~2.8MB (minified) | `maps-plus/visualization.js` |
| CSS assets | ~30 files | `maps-plus/contrib/css/` |
| Font files | ~40 files | `maps-plus/contrib/fonts/` |
| Image assets | ~35 files | `maps-plus/contrib/images/` |
