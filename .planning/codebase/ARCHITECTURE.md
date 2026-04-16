# Maps+ for Splunk — Architecture

## 1. High-Level Architecture

Maps+ for Splunk is a **Splunk custom visualization plugin** that embeds an interactive Leaflet-based map inside Splunk dashboard panels. It follows Splunk's standard plugin model:

- The app (id: `leaflet_maps_app`) registers two custom visualizations via `visualizations.conf`:
  - `maps-plus` — the primary interactive mapping visualization
  - `google-street-view` — a secondary Street View panorama viewer
- Each visualization is delivered as a single compiled JavaScript bundle loaded by Splunk's RequireJS runtime at page load time.
- The visualizations extend `SplunkVisualizationBase`, which provides a lifecycle contract: data arrives via the `onData()` method, and the plugin renders into an HTML container provided by Splunk.

### Position in the Splunk Stack

```
Splunk Web (Angular/RequireJS)
    │
    ├── visualizations.conf  → declares custom viz types
    │       │
    │       └── requires → visualization.js (Webpack bundle)
    │                       │
    │                       └── extends SplunkVisualizationBase
    │                               │
    │                               └── creates Leaflet map
    │                                       │
    │                                       ├── tileLayer (OSM, CartoDB, etc.)
    │                                       ├── markers / paths / heatmaps
    │                                       └── layerGroup management
    │
    └── dashboard XML panels
            │
            └── uses type="Leaflet:Maps+|Google-Street-View"
                    │
                    └── search → Splunk Search API → CSV data → onData()
```

### Data Flow (High Level)

```
SPL search definition  →  Splunk Search API  →  JSON/CSV results
                                                              │
                                                              ▼
                                                    onData(options, data)
                                                              │
                                                              ▼
                                                    Field parsing & config merge
                                                              │
                                                              ▼
                                                    Render pipeline
                                                        (init/update)
                                                              │
                                                              ▼
                                                    Leaflet layers drawn/updated
                                                              │
                                              User interaction  ◄──┘
                                                  │
                                                  ▼
                                           Drilldown token update
                                      ($clickedLatLng$, $mapmarkers$)
```

## 2. Component Breakdown

### 2.1 Maps+ Core (`appserver/static/visualizations/maps-plus/src/maps-plus.js`)

~3,564-line single AMD module that is the entire visualization logic in one file. Key responsibilities:

- **Initialization**: Creates Leaflet `Map` instance inside the Splunk-provided container div
- **Tile Layer Management**: Supports multiple tile providers (OpenStreetMap, CartoDB variants, Mapbox, etc.) with dark mode support
- **Marker Rendering**: Handles 5 marker types:
  - `png` — image markers from URL or contrib/ directory
  - `svg` — inline SVG markers
  - `circle` — L.circle markers (radius in meters)
  - `milsymbol` — military symbology (APP-6 style)
  - `wkt` — Well-Known Text geometry parsing (Point, LineString, Polygon)
- **Layer Groups**: Manages named layer groups that can be toggled on/off via the layers menu
  - `layerGroup` — standard Leaflet layer groups
  - `pathLayer` — line/polygon overlays
  - `featureLayer` — GeoJSON feature collections
  - `heatmapLayer` — L.heat-layer for density visualization
  - Subgroups via `leaflet.featuregroup.subgroup` for multi-cluster support
- **Clustering**: Uses `leaflet.markercluster` with configurable options (spiderfy, maxClusterRadius, singleMarkerMode). Supports multiple named cluster groups.
- **Playback**: Time-based animation via custom `LeafletPlayback` module; advances markers layer by layer according to a time field and interval setting
- **Drawing Tools**: Integrates `leaflet-draw` for creating/editing geometries on the map
- **Menu System**: Custom format menu rendered as an HTML overlay, providing access to:
  - Marker type selector
  - Tile provider picker
  - Zoom controls
  - Layer toggle list
  - Playback controls (play/pause/step)
  - Measure tool (via `leaflet-measure`)
  - Legend display (via `leaflet-legend`)
- **Info Window / Popup**: Custom info window for displaying marker attributes on click
- **Selection & Drilldown**: On marker click, emits `$clickedLatLng$` and optionally `$mapmarkers$` tokens back to the Splunk dashboard for use in drilldown panels

### 2.2 Google Street View Sub-Plugin (`appserver/static/visualizations/google-street-view/src/google_street_view.js`)

Separate visualization using:
- Webpack 1 (vs. Maps+ which uses Webpack 5)
- Google Maps JavaScript API (Street View service)
- Its own `visualizations.conf` entry as `Google-Street-View`
- Simpler lifecycle: takes lat/lng or address input, displays Street View panorama

### 2.3 Shared Utilities (`appserver/static/visualizations/maps-plus/contrib/js/`)

- **`Modal.js`** — Lightweight modal dialog manager used for confirmations and overlays within the visualization UI
- **`theme-utils.js`** — Theme detection utilities (detects dark vs. light Splunk theme, switches tile providers accordingly)
- **`LeafletPlayback.js`** — Time-slider and playback engine; manages temporal data layers
- **`leaflet.markercluster-src.js`** — Marker clustering library (committed source)
- **`leaflet-measure.js`** / **`leaflet-legend.js`** — Measurement and legend plugins

## 3. Data Flow

### 3.1 Splunk Search → Visualization Pipeline

```
1. Dashboard XML declares panel with type="Leaflet:Maps+"
2. User runs search (or dashboard auto-runs)
3. Splunk Search API returns results as JSON/CSV
4. SplunkVisualizationBase.onData(options, data) is called:
   - options : format configuration object (markerType, zoom, center, etc.)
   - data    : array of { columns: [...], rows: [[val1, val2, ...]] }
5. Maps+ parses columns to map field names to positions
6. Based on field names and config, selects visualization mode:
   - lat/lon fields  → markers
   - wkt field       → geometry overlays
   - numeric + lat   → heatmap density
   - time field      → playback enabled
```

### 3.2 SplunkVisualizationBase Lifecycle

| Method | Trigger | Maps+ Action |
|--------|---------|-------------|
| `init()` | Panel first rendered | Create Leaflet map, tile layer, container elements, menu overlay |
| `onData(options, data)` | New search results arrive | Parse data, update or recreate layers, redraw map |
| `render(data)` | Data available after init | Convenience wrapper around onData parsing logic |
| `resize(width, height)` | Panel size changes | Call `map.invalidateSize()` to reflow |
| `destroy()` | Panel removed from DOM | Remove map event listeners, clear layers, call `map.remove()` |

### 3.3 User Interaction → Drilldown Tokens

- **Marker click** → Sets `$clickedLatLng$` token (format: `lat,lng`) and optionally `$mapmarkers$` with selected marker attributes
- **Drilldown panels** in Splunk dashboard can reference these tokens to show detailed information or trigger secondary searches
- Google Street View panel can receive `$clickedLatLng$` to center the Street View panorama

## 4. Render Pipeline

### 4.1 Visualization Type Selection

The visualization type is determined by the `markerType` format option and the presence of specific data fields:

| markerType | Rendering Strategy |
|-----------|-------------------|
| `png` | ImageMarker with URL from field value or default icon from contrib/images/ |
| `svg` | SVG icon rendered via inline markup |
| `circle` | L.circle with radius from configured field (in meters) |
| `milsymbol` | Military symbology using ms.js library, layer from field value |
| `wkt` | Geometry parsed from WKT string → Leaflet GeoJSON layers |

### 4.2 Layer Architecture

```
Map
 └── tileLayer (base layer, one active at a time)
     └── overlays (layerGroup tree):
         ├── _default_marker_group    (unclustered markers)
         ├── cluster_group_*          (named marker clusters)
         ├── path_layer               (polylines/polygons)
         ├── feature_layer            (GeoJSON features)
         ├── heatmap_layer            (density heatmaps)
         └── playback_group_*         (time-based layer slices)
```

- Named groups are created via the `group` field in data; markers with matching group names are placed in corresponding LayerGroups
- Multiple cluster groups can coexist (via `multicluster_groups` demo); each cluster group wraps a separate marker layer
- Layer visibility toggled via the layers menu checkbox list

### 4.3 Clustering Logic

- When clustering is enabled, all markers in a named group are added to an L.MarkerClusterGroup
- Configurable: `spiderfyOnMaxZoom`, `showCoverageOnHover`, `zoomToBoundsOnClick`, `maxClusterRadius`
- Cluster styling via custom CSS (MarkerCluster.Default.css)
- Single marker mode for circle-based clustering visual

### 4.4 Canvas vs SVG Rendering

- Leaflet auto-selects renderer (`SVG` or `Canvas`) based on browser capability and layer types
- GeoJSON features with many points may benefit from canvas mode; SVG mode is preferred for interactivity (hover events, click handlers)
- Heat layers use their own L.heat-layer implementation (canvas-based internally)

## 5. State Management

### 5.1 Internal Map State

Maps+ maintains all state in the component closure (no external state store):

| State Variable | Purpose |
|---------------|---------|
| `map` | Leaflet Map instance |
| `tileLayer` | Current base tile layer reference |
| `layerGroups` | Named L.layerGroup instances keyed by group name |
| `clusterGroups` | L.MarkerClusterGroup instances for each cluster zone |
| `playbackState` | Playback engine state: isPlaying, currentLayerIndex, timer ID |
| `markerData` | Parsed row data cached after onData() call |
| `formatSettings` | Current format configuration (merged from options + defaults) |
| `popup` / `infoWindow` | Currently displayed popup element |

### 5.2 Splunk Token Communication

Token output mechanism:

- **$clickedLatLng$**: Set via `splunkjs/ready!` callback using the token model API; format `"latitude,longitude"`
- **$mapmarkers$**: JSON stringified array of selected marker attributes
- Tokens are set using Splunk's token framework (requires `splunkjs/mvc` modules declared as webpack externals)

### 5.3 Format Menu Configuration

The format menu is a persistent settings object built from:
1. Default values baked into the source
2. Runtime overrides from dashboard panel `<format>` block in XML
3. User selections in the menu UI (persisted only for session duration)

Key configurable parameters:
- `markerType`, `iconField`, `radiusField`
- `tileProvider`, `darkMode`
- `zoom`, `centerLat`, `centerLon`
- `clusterEnabled`, `spiderfyOnMaxZoom`
- `playbackInterval`, `timeField`
- Layer toggle visibility

## 6. Plugin Lifecycle

### 6.1 Initialization Sequence

```
1. Splunk page loads (Angular JS bootstraps)
2. dashboard.html declares panel with type="Leaflet:Maps+"
3. Splunk's visualization framework requires the bundle:
     require(['visualization'], function(MapsPlusViz) { ... })
4. Webpack resolves externals:
     splunkjs/mvc, splunkjs/ready!, splunkjs/spl, splunkjs/visualizations
   → These are loaded from Splunk's own RequireJS shim at runtime
5. Maps+ module executes:
     define(['leaflet', 'splunkjs/...', ...], function(...) {
         return extend(SplunkVisualizationBase, { ... });
     });
6. Visualization framework instantiates the class
7. init(container) → Leaflet map created with default tile layer
8. onData(data) called synchronously or asynchronously (when search completes)
9. Map renders first frame; user sees interactive map
```

### 6.2 Webpack Configuration

Webpack 5 in `webpack.config.js` configures:
- **Entry**: `./src/maps-plus.js` (single AMD module)
- **Output**: `visualization.js` into `appserver/static/visualizations/maps-plus/`
- **Externals**: `splunkjs/*`, `leaflet` — not bundled, resolved from Splunk runtime / CDN at page load
- **Plugins**: banner for license headers, UglifyJS/Terser for minification
- **CSS extraction**: Styles compiled to `visualization.css` via css-loader + mini-css-extract-plugin

### 6.3 Runtime Dependencies

Bundled (included in webpack output):
- Leaflet 1.x core
- leaflet.markercluster, leaflet.draw, leaflet.spin, leaflet.textpath
- leaflet.awesome-markers, leaflet-vector-markers
- LeafletPlayback.js (custom)
- ms.js (milsymbol rendering)

External (loaded from CDN or Splunk):
- leaflet CSS + JS core (from cdnjs/jsdelivr CDN in most cases)
- splunkjs modules (from Splunk's own `static/` directory)
- Google Maps API (for street-view plugin only, loaded at runtime via script injection)
