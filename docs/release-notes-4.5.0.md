# Maps+ v4.5.0 — Splunkbase Release Notes

## What's New

### OpenFreeMap Vector Tiles
Maps+ now supports vector tile rendering powered by MapLibre GL JS. Enable via **Format → Map → OpenFreeMap Vector Tiles → Enabled**.

Vector tiles are sharper than raster tiles at all zoom levels, with richer cartography and smoother text rendering. Four built-in styles are included: **Liberty** (default), **Bright**, **Positron**, and **Fiord** (dark).

No API key required — tiles are served free by [OpenFreeMap](https://openfreemap.org/).

### MapLibre Style URL Override
The new **MapLibre Style URL** field accepts any MapLibre-compatible style JSON URL, giving you access to styles from Stadia Maps, MapTiler, Protomaps, or any self-hosted MapLibre style server. Embed your API key directly in the URL.

Stadia Maps styles work without an API key for development and local Splunk instances:
- `https://tiles.stadiamaps.com/styles/alidade_smooth.json`
- `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json`
- `https://tiles.stadiamaps.com/styles/outdoors.json`
- `https://tiles.stadiamaps.com/styles/osm_bright.json`

### Performance: Viewport Culling for Large Datasets
Markers outside the visible map viewport are now automatically removed from the DOM and re-added as they scroll into view. This dramatically improves pan and zoom performance at high zoom levels with large datasets (tested with 25k+ markers). Both raster and vector tile backends benefit from this improvement.

### Build Modernization
The build pipeline has been upgraded to Webpack 5 and Babel 7 with TerserPlugin, targeting modern evergreen browsers (Chrome, Firefox, Safari, Edge). IE11 is no longer a supported target.

## Upgrade Notes
- Existing dashboards are fully compatible — no SPL field changes, no formatter option removals.
- The deploy script (`scripts/deploy.sh`) now syncs additional assets to the Splunk container. If you use a custom deploy workflow, ensure `formatter.html`, `visualization.css`, and `contrib/css/maplibre-gl.css` are included.
