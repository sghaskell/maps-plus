# Maps+ for Splunk — Release Notes v4.6.7

## Airgapped / on-premises deployment guide

Maps+ now ships with an end-to-end guide and reference Docker Compose stack for running in environments with no internet access — for customers behind air-gaps, in classified networks, or with strict egress controls.

The new guide ([`docs/airgapped-tile-server.md`](https://github.com/sghaskell/maps-plus/blob/master/docs/airgapped-tile-server.md)) covers:

- Three architecture options at different complexity points (`tileserver-gl` + vector tiles, pre-rendered raster pyramid, or full `renderd` / PostGIS stack)
- Disk-size estimates so you can plan capacity for your coverage area and zoom range
- Licensing considerations across OpenStreetMap (ODbL), OpenMapTiles (CC-BY), and OpenFreeMap (MIT)
- A one-command mirror script that downloads any of the four free OpenFreeMap styles (Liberty, Positron, Bright, Fiord) along with their fonts, sprites, and Natural Earth hillshade rasters, and produces an airgapped style JSON with all URLs pre-rewritten to your internal hostname
- Instructions for pointing Maps+ at your internal tile server via the **Map Tile Override** field (raster) or **MapLibre Style URL** field (vector)

A working Docker Compose example is in [`docs/examples/airgapped-tile-server/`](https://github.com/sghaskell/maps-plus/tree/master/docs/examples/airgapped-tile-server). It has been verified end-to-end against a live Maps+ dashboard.

## Acceptance-test dashboard

Maps+ now ships an **Airgapped Tile Server Acceptance Test** dashboard (under **Examples** in the app sidebar). It renders six globally-distributed synthetic markers in both raster mode (Map Tile Override) and vector mode (MapLibre Style URL) against any tile server you configure via the dashboard's three input fields. A six-point sign-off checklist and a `tcpdump` verification command help confirm no requests leak to public CDNs.

The dashboard's tile-URL inputs default to empty and the map panels stay hidden until they're filled. This prevents the dashboard from accidentally loading Maps+'s built-in default basemaps (which would produce false-positive "leak" signals on first load) and tells operators exactly what to paste in via an inline Quick Start block.

Useful for airgapped-deployment verification, but works equally well as a quick functional smoke-test against any custom tile server.

## Bug Fixes

### Fixed: Visualization formatter help text rendered with raw HTML in two places

Two help captions in the visualization formatter — under **Heatmap → Color Gradient** and **Path Lines → Path Lines** — were rendering with raw, broken HTML because the help strings contained literal double-quote characters inside an HTML attribute. The captions are now properly escaped and render in full.

## Upgrade Notes

- Drop-in upgrade — no dashboard changes, SPL field changes, or formatter option changes are required.
- The airgapped tile-server guide and Docker Compose example are documentation only; no behavior changes for customers running Maps+ with the default public basemaps.
- Customers planning an airgap migration should follow the new guide and validate with the bundled acceptance-test dashboard before cutover.
