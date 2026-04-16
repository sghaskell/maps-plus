# Maps+ for Splunk — Project Structure

## Directory Tree

```
maps-plus/
├── appserver/static/visualizations/
│   ├── maps-plus/                          # Main visualization
│   │   ├── src/
│   │   │   └── maps-plus.js                # Single AMD module (~3,564 lines)
│   │   ├── contrib/
│   │   │   ├── css/                        # 20 files — Leaflet, FontAwesome, Ionicons, etc.
│   │   │   ├── fonts/                      # 27 files — FontAwesome, Glyphicons, Ionicons (EOT/SVG/TTF/WOFF)
│   │   │   ├── images/                     # ~31 files — marker icons, spritesheets, tool icons
│   │   │   ├── js/                         # ~19 files — Leaflet plugins, utilities
│   │   │   ├── i18n/                       # 2 files — en.json, ja.json
│   │   │   └── kml/                        # 3 files — sample.kml, sample.kmz, README.md
│   │   ├── scripts/
│   │   │   └── deploy.sh                   # Deployment helper script
│   │   ├── visualization.js                # Compiled Webpack bundle (~2.8 MB)
│   │   ├── visualization.css               # Compiled stylesheet
│   │   ├── visualization.js.LICENSE.txt    # Bundle license metadata
│   │   ├── formatter.html                  # Format menu preview/testing page
│   │   ├── preview.png                     # Dashboard preview thumbnail
│   │   ├── package.json                    # npm dependencies (Leaflet, Webpack, etc.)
│   │   └── package-lock.json               # Locked dependency tree
│   │
│   └── google-street-view/                 # Secondary plugin (Webpack 1)
│       ├── src/
│       │   └── google_street_view.js       # Street View visualization module
│       ├── visualization.js                # Compiled Webpack bundle
│       ├── visualization.css               # Compiled stylesheet
│       ├── package.json                    # npm dependencies
│       ├── webpack.config.js               # Webpack 1 build config
│       ├── formatter.html                  # Format menu preview page
│       └── preview.png                     # Preview thumbnail
│
├── default/
│   ├── app.conf                            # App metadata (id: leaflet_maps_app, version: 4.6.0)
│   ├── visualizations.conf                 # Declares "Leaflet:Maps+" and "Google-Street-View" viz types
│   ├── savedsearches.conf                  # Default map search definitions
│   └── data/ui/views/                      # 23 demo dashboards (Splunk XML)
│       ├── ant_path.xml
│       ├── antarctic_projection.xml
│       ├── circle_markers.xml
│       ├── clicked_latlng_demo.xml
│       ├── cluster_colors.xml
│       ├── custom_icon_images.xml
│       ├── custom_icons.xml
│       ├── drilldown.xml
│       ├── features.xml
│       ├── google_streetview_drilldown.xml
│       ├── heatmap.xml
│       ├── help.xml
│       ├── kml_overlay.xml
│       ├── milsymbol.xml
│       ├── multicluster_groups.xml
│       ├── multilayer_groups.xml
│       ├── path_lines.xml
│       ├── playback.xml
│       ├── png_markers_dark.xml
│       ├── png_markers.xml
│       ├── selecting_markers.xml
│       ├── stale_markers_validation.xml
│       └── svg_markers.xml
│
├── lookups/                                # 6 CSV lookup files (demo data)
│   ├── chicago-crime.csv
│   ├── fa-brands.csv
│   ├── features.csv
│   ├── go_track_tracks.csv
│   ├── go_track_trackspoints.csv
│   └── inspire22Coords.csv
│
├── static/                                 # App icons for Splunk app UI
│   ├── icon@1x.png                         # 16x16 default icon
│   ├── icon@2x.png                         # 32x32 Retina icon
│   └── icon@80.png                         # 80x80 large preview icon
│
├── docs/                                   # Release notes and project documentation
├── build_release.sh                        # Build script for release packaging
├── CHANGELOG.md                            # Version history
├── README.md                               # Comprehensive documentation (~1,090 lines)
├── CLAUDE.md                               # AI assistant guidance document
├── LICENSE.md                              # License terms
├── .gitignore                              # Git ignore patterns (node_modules, *.tgz, etc.)
└── .gitattributes                          # Git attribute configuration
```

## File Count Summary

| Category | Files | Location(s) |
|----------|------:|-------------|
| **JS source** (uncompiled) | 2 | `maps-plus/src/`, `google-street-view/src/` |
| **JS compiled/bundled** | 2 | `maps-plus/visualization.js`, `google-street-view/visualization.js` |
| **CSS source** | ~19 | `maps-plus/contrib/js/*.js` (some inline styles) + Google Street View contrib |
| **CSS compiled** | 2 | `maps-plus/visualization.css`, `google-street-view/visualization.css` |
| **Config files** (conf, json, xml) | 7 | `app.conf`, `visualizations.conf`, `savedsearches.conf`, `package.json` x2, `webpack.config.js` x2 |
| **XML dashboards** | 23 | `default/data/ui/views/*.xml` |
| **Lookup CSVs** | 6 | `lookups/*.csv` |
| **Font files** | 27 | `maps-plus/contrib/fonts/*` |
| **Image assets** | ~31 | `maps-plus/contrib/images/*` + static/ app icons |
| **i18n JSON** | 2 | `maps-plus/contrib/i18n/*` |
| **KML samples** | 3 | `maps-plus/contrib/kml/*` |
| **Non-node_modules total** | ~150 | (all source + compiled + config files) |

## Key Entry Points

| Entry Point | Purpose |
|-------------|---------|
| `appserver/static/visualizations/maps-plus/src/maps-plus.js` | Main Maps+ visualization logic (~3,564 lines, single AMD module) |
| `appserver/static/visualizations/google-street-view/src/google_street_view.js` | Secondary Google Street View plugin |
| `default/data/ui/views/*.xml` | 23 demo dashboard panels demonstrating different map features |

## Bundled Output Files (Committed to Repo)

These compiled artifacts are checked into version control so the app works without a build step:

| File | Size (approx.) | Produced By |
|------|----------------|-------------|
| `appserver/static/visualizations/maps-plus/visualization.js` | ~2.8 MB | Webpack 5 from `src/maps-plus.js` |
| `appserver/static/visualizations/maps-plus/visualization.css` | ~50 KB | css-loader from source imports |
| `appserver/static/visualizations/google-street-view/visualization.js` | ~1.2 MB | Webpack 1 from `src/google_street_view.js` |
| `appserver/static/visualizations/google-street-view/visualization.css` | ~10 KB | css-loader from source imports |

Build inputs for each bundle are in their respective `webpack.config.js` and `package.json` files. Running `npm install && npm run build` (or equivalent) regenerates these outputs from source.
