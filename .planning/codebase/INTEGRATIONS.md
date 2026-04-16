# Integrations — Maps+ for Splunk v4.6.x

## 1. Splunk Platform Integration

### Visualization API
The maps visualization is a custom Splunk visualization built by extending `SplunkVisualizationBase`:

```js
return SplunkVisualizationBase.extend({
    maxResults: 0,
    validMarkerTypes: ["custom", "png", "icon", "svg", "circle", "milsymbol"],
    validFields: ['latitude', 'longitude', 'title', ...],
    // ... ~50+ methods for rendering, drilldown, playback, heatmaps, etc.
});
```

**Externals** (not bundled — resolved at runtime by Splunk's RequireJS):
- `api/SplunkVisualizationBase` — base class with data binding, resize handling, and lifecycle hooks (`onResize`, `render`)
- `api/SplunkVisualizationUtils` — utility functions for data parsing and field validation

### Data Contract
The visualization expects tabular Splunk results with at minimum:
- **latitude** — Y coordinate (decimal degrees or projected)
- **longitude** — X coordinate (decimal degrees or projected)
- Optional: `title`, `description`, `category`, `time` fields for markers, popups, and playback

The `search_fragment` in `visualizations.conf` provides a default SPL template:
```spl
<base_search> latitude=* longitude=* | eval description = "<b>".description."</b>" | table latitude, longitude, description
```

### Configuration Registry (`savedsearches.conf`)
All visualization options are declared as custom `display.visualizations.custom.leaflet_maps_app.maps-plus.*` properties (~80+ settings), including:
- Tile layer URL and type (OpenStreetMap default)
- Marker clustering, spiderfy limits, max radius
- Map center/zoom defaults, min/max zoom bounds
- Context menu, measure tool, playback slider, heatmap controls
- Bing Maps API key fields (`bingMapsApiKeyUser`, `bingMapsApiKeyRealm`)
- Google Places autocomplete settings (API key user/realm, zoom level, position)
- MIL-STD symbol styling (frame color, info background, color mode)
- Heatmap gradient colors (range1→green, range2→yellow, range3→orange thresholds)
- Path animation colors and split intervals
- GI/BSD/GIBS satellite layer settings
- i18n language selection

### App Manifest (`app.conf`)
```ini
[id]
name = leaflet_maps_app
version = 4.6.1
[ui]
is_visible = true
label = Maps+ for Splunk
```

### Preview & Registration
- `visualization.png` provides the dashboard builder thumbnail in the visualization picker
- Declared under `[maps-plus]` and `[google-street-view]` sections in `visualizations.conf`

## 2. Mapping Service Integrations

### Default Tile Layer: OpenStreetMap
- URL template: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Configurable via `mapTile` setting and layer control UI

### Bing Maps (`leaflet-bing-layer`)
Three key fields in `savedsearches.conf`:
| Setting | Purpose |
|---------|---------|
| `bingMapsApiKeyUser` | Splunk secret key user for API key storage |
| `bingMapsApiKeyRealm` | Splunk secret key realm |
| `bingMapsTileLayer` | CanvasLight (default), RoadOnDemand, etc. |
| `bingMapsLabelLanguage` | e.g., `en-US` |

### MapLibre GL / Vector Tiles (`maplibre-gl` + `@maplibre/maplibre-gl-leaflet`)
- Renders vector tile sources with GL-style rendering (fill-extrusion, 3D buildings)
- CSS bundled separately at `contrib/css/maplibre-gl.css`
- Bridge via `@maplibre/maplibre-gl-leaflet` wraps a MapLibre GL map inside Leaflet's control system

### Google Maps Platform
Two distinct integrations:
1. **Google Places Autocomplete** (`leaflet-google-places-autocomplete`) — search bar on the map for POI geocoding; requires `googlePlacesApiKeyUser` and `googlePlacesApiKeyRealm` for Splunk secret key integration
2. **Google Street View** (secondary visualization) — standalone `google-street-view/` module uses `load-google-maps-api-2` to load the Google Maps JS API for Street View panorama embeds triggered by map drilldown

### Custom Tile Layers
- Arbitrary tile URL templates supported via Leaflet's `TileLayer`
- GIBS satellite imagery configured via: `gibsLayerId`, `gibsFormat`, `gibsTileMatrixSet`, `gibsLowerCorner`, `gibsUpperCorner`, `gibsTime`
- Antarctic projection support with custom tile server (`tile.gbif.org`) enabled via `antarcticProj` setting

### Coordinate Systems
- Standard WGS84 (EPSG:4326) — default
- PROJ.4 custom CRS via `proj4leaflet` — supports any proj4-defined coordinate reference system (e.g., UTM zones, State Plane)

## 3. External Data Formats

### KML / KMZ
| Format | Parser | Library |
|--------|--------|---------|
| KML | `togeojson` (XML → GeoJSON) | `@mapbox/togeojson` |
| KMZ | KML extracted from ZIP archive | `jszip` + `jszip-utils` |

KML folders, Placemarks, NetworkLinks, and TimeStamps are parsed. KMZ files are decompressed in-memory via JSZip before KML parsing.

### GPX
GPX tracks, routes, and waypoints converted to GeoJSON features via `@mapbox/togeojson`.

### WKT (Well-Known Text)
Custom parser in `maps-plus.js` for WKT feature definitions imported from Splunk results or configuration.

### CSV Lookups
CSV lookup tables in the `lookups/` directory can be used as Splunk data sources feeding the visualization via search commands (`| inputlookup`).

### GeoJSON
Native GeoJSON support — features are rendered directly as Leaflet layers with automatic geometry detection (Point → Marker, LineString → Polyline, Polygon → CircleMarker/Area).

## 4. Icon / Symbol Systems

| System | Version | Source | Integration |
|--------|---------|--------|-------------|
| **Font Awesome** | v7.2.0 (`@fortawesome/fontawesome-free`) | npm + copied to `contrib/css/` and `contrib/fonts/` | Primary icon font for UI elements (toolbar buttons, layer controls) |
| **FontAwesome V4 Shims** | compat layer | `fontawesome-v4-shims.min.css` + `fa-v4compatibility.woff2` | Backward compatibility for V4 glyph references in markers and tooltips |
| **Ionicons** | 2.x series | `ionicons.min.css` + fonts in `contrib/fonts/` | Additional icon glyphs used in the layer picker and popup content |
| **Glyphicons Halflings** | Bootstrap legacy | `glyphicon.css` + fonts in `contrib/fonts/` | Legacy icon references for older marker definitions and Splunk UI compatibility |
| **MIL-STD-2525B/C Symbols** | `milsymbol` v3.0.3 | npm dependency, rendered on canvas | Military symbology (S-102 format) — supports customizable frame color, info background, outline color, and color mode (Light/Dark) via config settings |
| **Custom Markers** | User-defined | PNG/SVG upload | `validMarkerTypes` includes `custom`, `png`, `svg` for user-uploaded marker images |
| **Circle Markers** | Built-in | Leaflet `circleMarker` | Color-coded circles sized by data values (heat/choropleth style) |

## 5. Third-Party Library Integrations

### JSZip (`jszip` + `jszip-utils`)
- Reads KMZ files (ZIP archives containing KML) from file input or network URLs
- Writes KMZ output for exported map layers
- Async file loading via `JSZipUtils.getBinaryContent()`

### moment.js (`moment`)
- Time parsing and formatting for playback controls
- Display of timestamps in popups and tooltips
- Time-based filtering for animated playback (tick-by-tick replay)

### jQuery.i18n (7 modules)
Full localization toolkit copied into `contrib/js/`:
| Module | Purpose |
|--------|---------|
| `jquery.i18n.js` | Main i18n plugin entry point |
| `jquery.i18n.parser.js` | Message format parser (i18next-style) |
| `jquery.i18n.messagestore.js` | Caches parsed message strings |
| `jquery.i18n.emitter.js` | Message emitter for interpolation |
| `jquery.i18n.emitter.bidi.js` | Bi-directional text support |
| `jquery.i18n.fallbacks.js` | Language fallback chain (e.g., `ja-JP` → `ja`) |
| `jquery.i18n.language.js` + `CLDRPluralRuleParser.js` | Plural rules per locale |

Language selection via `i18nLanguage` setting (`en` default, `ja` Japanese available). JSON translation files in `contrib/i18n/en.json` and `contrib/i18n/ja.json`.

### Turf.js (`@turf/turf`) v7.3.4
Geospatial analysis for interactive features:
- **Lasso selection**: polygon area calculation, point-in-polygon queries for selecting markers within drawn areas
- Distance calculations between map coordinates
- Bounding box computation for fit-to-data operations
- Feature geometry manipulation (simplify, buffer)

### Simpleheat (`simpleheat`)
SVG-based heatmap rendering — generates heat layer tiles from lat/lng coordinate arrays with configurable radius, blur, and color gradient. Used by the `HeatLayer.js` contrib module which extends Leaflet's layer system.

### Spin.js (`spin.js`)
Loading spinner injected during map tile loading, data fetches, and KML/KMZ parsing operations. Configurable via `showProgress` setting.

### Underscore.js (`underscore`)
Functional programming utilities used throughout the codebase: `_.forEach`, `_.map`, `_.filter`, `_.some`, `_.pluck` for data transformation in marker rendering and popup generation.
