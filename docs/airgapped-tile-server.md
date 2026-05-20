# Self-hosting an airgapped tile server for Maps+

This guide is for ops/DevOps engineers standing up a tile server inside a network that has no internet access. The goal is to make Maps+ for Splunk render maps without ever calling out to CartoDB, OpenStreetMap, OpenFreeMap, or any other public endpoint.

Maps+ is tile-server-agnostic. It already supports:

- **Raster tile URL templates** via the **Map Tile Override** field in the formatter (any `{z}/{x}/{y}` URL).
- **MapLibre GL vector tiles** via the **MapLibre Style URL** field (any MapLibre-compatible `style.json` URL).

So the Maps+ side is a one-line configuration change. The work is on the tile-server side.

This guide covers three approaches, from simplest to most flexible:

| Approach | Output | Disk (region) | Disk (planet) | Best for |
|---|---|---|---|---|
| **A. Vector tiles via tilemaker + tileserver-gl** | Vector + on-the-fly raster | 0.5–10 GB | ~100 GB | Most airgapped Maps+ deployments |
| **B. Pre-rendered raster tile pyramid behind nginx** | Raster only | 5–200 GB | 1–10 TB | Locked-in to raster, no rendering daemon allowed |
| **C. Full renderd / mod_tile / PostGIS stack** | Raster (on-demand) | ~150 GB DB | ~1 TB DB | Restyling, label-density tuning, very large user base |

> **TL;DR.** Use **Approach A** unless you have a specific reason not to. Vector tiles render to raster on the server with `tileserver-gl`, are 10–100× smaller than baked rasters, and the Maps+ MapLibre Style URL field gives you native vector rendering in the browser for free.

---

## Prerequisites

You will need two machines:

1. **Staging machine** — has internet access, used once to download OSM data and generate tiles. Linux/macOS, 16 GB RAM minimum for country-scale extracts, 64 GB RAM for planet-scale (see [tilemaker docs](https://tilemaker.org/)).
2. **Production tile server** — lives in the airgapped network. Linux (Ubuntu 22.04+ or RHEL 9 equivalent), enough disk for the tile set you chose above. Network-reachable from the Splunk web tier on whichever port you pick (defaults to 80/443 for nginx, 8080 for `tileserver-gl`).

All three approaches share the same starting point: a `.osm.pbf` extract from [Geofabrik](https://download.geofabrik.de/) (free, OpenStreetMap data, ODbL). Pick the smallest geographic extract that covers your area of interest. A country extract is typically 50 MB – 5 GB; the full planet is ~80 GB.

```bash
# Example: download the US Pacific extract on the staging machine
wget https://download.geofabrik.de/north-america/us-west-latest.osm.pbf
```

---

## Approach A — Vector tiles with `tilemaker` + `tileserver-gl` (recommended)

Generate vector tiles once with `tilemaker`, ship the resulting `.mbtiles` file to the airgapped server, and serve it with `tileserver-gl`. `tileserver-gl` will rasterize vector tiles on demand via MapLibre GL Native, so Maps+ can consume either raster (`{z}/{x}/{y}.png`) or native vector (`style.json`) — your choice.

### A.1 Generate vector tiles on the staging machine

`tilemaker` is a single C++ binary that converts an `.osm.pbf` into `.mbtiles` or `.pmtiles`. It uses the OpenMapTiles schema by default, which works directly with any standard MapLibre style.

```bash
# Install tilemaker (Ubuntu 24.04+ ships it; otherwise build from source)
sudo apt install tilemaker

# Generate vector tiles (OpenMapTiles-compatible schema, MBTiles output)
tilemaker \
  --input us-west-latest.osm.pbf \
  --output us-west.mbtiles \
  --config /usr/share/tilemaker/config-openmaptiles.json \
  --process /usr/share/tilemaker/process-openmaptiles.lua
```

For a US-state-sized region this takes 5–30 minutes. For a continent, hours. For the planet, plan on a beefy machine: tilemaker can do the planet in ~2 hours on a 32-core / 256 GB box, or 6+ hours on a Mac Mini M2 Pro.

Output is one self-contained `us-west.mbtiles` file. Copy it to the airgapped server via your usual data-diode / sneakernet process.

### A.2 Run `tileserver-gl` on the airgapped server

`tileserver-gl` is distributed as a Docker image (`maptiler/tileserver-gl`) or an npm package. For airgapped use, pull the image once on a connected machine, save it, and `docker load` on the airgapped server.

```bash
# On a connected machine — save the image
docker pull maptiler/tileserver-gl:latest
docker save maptiler/tileserver-gl:latest -o tileserver-gl.tar

# On the airgapped server — load the image and run it
docker load -i tileserver-gl.tar
mkdir -p /srv/tiles
cp us-west.mbtiles /srv/tiles/

docker run -d --restart=unless-stopped \
  --name tileserver-gl \
  -v /srv/tiles:/data \
  -p 8080:8080 \
  maptiler/tileserver-gl:latest \
  --file us-west.mbtiles
```

`tileserver-gl` reads `/data/us-west.mbtiles`, auto-detects the OpenMapTiles schema, and exposes:

- A web GUI at `http://tile-server:8080/` for inspection.
- Raster XYZ endpoints at `http://tile-server:8080/styles/{style}/{z}/{x}/{y}.png` (server-side rendered).
- Vector tile JSON at `http://tile-server:8080/data/v3.json`.
- Style JSON for MapLibre at `http://tile-server:8080/styles/{style}/style.json`.

> **Style assets.** `tileserver-gl` ships a `basic-preview` style for sanity-checking, but production maps need a real style with its fonts, sprites, and (for some styles) low-zoom hillshade rasters. The next section walks through mirroring an OpenFreeMap style end-to-end.

### A.3 Mirror an OpenFreeMap style and its assets

A MapLibre style is a `style.json` file that points at four URL families:

| Asset | URL pattern in OpenFreeMap | What it is |
|---|---|---|
| Vector tiles | `https://tiles.openfreemap.org/planet` (TileJSON → `{z}/{x}/{y}.pbf`) | You already have this — it's your `.mbtiles` from A.1. |
| Fonts (`glyphs`) | `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` | Protobuf glyph atlases. ~256 files per font stack. |
| Sprites | `https://tiles.openfreemap.org/sprites/ofm_f384/ofm{,@2x}.{json,png}` | Icon sheet. 4 small files total. |
| Hillshade rasters | `https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png` | Low-zoom relief shading, z0–z6. ~5,500 tiles, ~340 MB. Referenced by all four built-in styles. |

If you skip any of these, the map will render with broken labels, missing icons, or empty zoomed-out background. Mirror them all on the staging machine, then ship them across the airgap as static files.

A ready-to-run mirror script is included in this repo at [`docs/examples/airgapped-tile-server/mirror-openfreemap.sh`](examples/airgapped-tile-server/mirror-openfreemap.sh). On the staging machine (requires `bash`, `curl`, `jq`):

```bash
# Default: mirror the Liberty style to ./out/, with URLs rewritten to https://tiles.corp.internal
./mirror-openfreemap.sh liberty ./out

# Other styles:
./mirror-openfreemap.sh positron ./out
./mirror-openfreemap.sh bright   ./out
./mirror-openfreemap.sh fiord    ./out

# Override the rewrite target hostname:
INTERNAL_BASE_URL="https://maps.example.corp" ./mirror-openfreemap.sh liberty ./out
```

The script does four things:

1. Downloads `styles/<style>.json` from `tiles.openfreemap.org`.
2. Downloads the sprite sheet (4 files: `ofm.{json,png}` and `ofm@2x.{json,png}`).
3. Auto-discovers font stacks referenced in the style's `text-font` layer properties and downloads all 256 unicode range PBFs per stack. Sparse ranges that 404 are silently skipped (expected — most stacks only populate a subset of Unicode).
4. Mirrors Natural Earth hillshade rasters from z0 to z6 (~5,500 tiles, ~340 MB) — referenced by all four styles. Set `PARALLEL=N` to control concurrent downloads (default 8); the default takes ~3-4 minutes on a typical broadband connection.
5. Produces a second file, `styles/<style>.airgapped.json`, where every URL pointing at `tiles.openfreemap.org` has been rewritten to `$INTERNAL_BASE_URL` — including `glyphs`, `sprite`, the `ne2_shaded` raster tile array, and the `openmaptiles` vector source URL (rewritten to `/data/v3.json` so it consumes tiles from your `tileserver-gl`).

Expected output size: ~380 MB regardless of style (the ~340 MB hillshade dominates; per-style font and sprite differences are small).

> **The `*.airgapped.json` file is what you point Maps+ at** via the MapLibre Style URL field. The original `<style>.json` is kept alongside it for reference and debugging.

### A.4 Front with nginx (TLS, caching, static assets)

Lay out the assets like this on the production server:

```
/srv/tiles/
  styles/
    liberty.airgapped.json
  fonts/
    Noto Sans Regular/0-255.pbf, 256-511.pbf, ...
  sprites/
    ofm_f384/ofm.json, ofm.png, ofm@2x.json, ofm@2x.png
  natural_earth/
    ne2sr/0/0/0.png, ...
  us-west.mbtiles
```

The `.mbtiles` file is mounted into `tileserver-gl`; everything else nginx serves as static files. A single nginx server block handles both:

```nginx
proxy_cache_path /var/cache/nginx/tiles levels=1:2 keys_zone=tiles:50m
                 max_size=20g inactive=30d use_temp_path=off;

server {
    listen 443 ssl http2;
    server_name tiles.corp.internal;

    ssl_certificate     /etc/ssl/corp/tiles.crt;
    ssl_certificate_key /etc/ssl/corp/tiles.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Splunk Web iframes are cross-origin, so every response must carry
    # Access-Control-Allow-Origin. CRITICAL: do not also let tileserver-gl's
    # own ACAO header through — duplicate ACAO is rejected by browsers
    # (see proxy_hide_header below).
    #
    # Note: nginx's add_header does NOT inherit across nested scopes; an
    # add_header in an inner block REPLACES outer ones. We re-declare it
    # in each location.

    # Static MapLibre assets. We deliberately do NOT match /styles/ as a
    # prefix because tileserver-gl owns /styles/{name}/{z}/{x}/{y}.png for
    # server-side raster rendering — only the style JSON files are static.
    location ^~ /fonts/ {
        root /srv/tiles;
        expires 30d;
        add_header Cache-Control "public, immutable" always;
        add_header Access-Control-Allow-Origin "*" always;
        try_files $uri =404;
    }
    location ^~ /sprites/ {
        root /srv/tiles;
        expires 30d;
        add_header Cache-Control "public, immutable" always;
        add_header Access-Control-Allow-Origin "*" always;
        try_files $uri =404;
    }
    location ^~ /natural_earth/ {
        root /srv/tiles;
        expires 30d;
        add_header Cache-Control "public, immutable" always;
        add_header Access-Control-Allow-Origin "*" always;
        try_files $uri =404;
    }
    location ~ ^/styles/[^/]+\.json$ {
        root /srv/tiles;
        expires 30d;
        add_header Cache-Control "public, immutable" always;
        add_header Access-Control-Allow-Origin "*" always;
        try_files $uri =404;
    }

    # Everything else (vector tiles, raster /styles/{name}/{z}/{x}/{y}.png,
    # TileJSON endpoints) is proxied to tileserver-gl.
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;

        # Strip tileserver-gl's ACAO header so the browser only ever sees
        # the one set by add_header below. Without this, you get
        # "Access-Control-Allow-Origin: *, *" and the browser rejects it.
        proxy_hide_header Access-Control-Allow-Origin;
        proxy_hide_header Access-Control-Allow-Methods;
        proxy_hide_header Access-Control-Allow-Headers;

        proxy_cache tiles;
        proxy_cache_valid 200 30d;
        proxy_cache_valid 404 1m;
        add_header X-Cache-Status $upstream_cache_status always;
        add_header Access-Control-Allow-Origin "*" always;
    }
}
```

> A ready-to-run Docker Compose example wiring `tileserver-gl` + nginx + this config together is in [`docs/examples/airgapped-tile-server/`](examples/airgapped-tile-server/).

### A.5 Point Maps+ at it

In the dashboard's visualization formatter:

- **Raster mode** (works with all Maps+ features including heatmaps, marker clustering, drawing tools):

  | Field | Value |
  |---|---|
  | Map Tile Override | `https://tiles.corp.internal/styles/liberty/{z}/{x}/{y}.png` |
  | Map Attribution Override | `© OpenStreetMap contributors` |

- **Vector mode** (sharper labels, rotation, restyleable in the browser):

  | Field | Value |
  |---|---|
  | OpenFreeMap Vector Tiles | Enabled |
  | MapLibre Style URL | `https://tiles.corp.internal/styles/liberty.airgapped.json` |

  This is the rewritten style JSON produced by the mirror script in A.3 — every URL inside it points at `tiles.corp.internal`, so no tile, font, sprite, or hillshade request ever leaves your network.

That's it. Reload the dashboard and tiles will load entirely from your internal server.

---

## Approach B — Pre-rendered raster pyramid behind nginx

Use this only if your environment forbids running a tile-rendering process in production (some hardened government / OT networks). You generate every raster tile on the staging machine, ship the resulting directory tree, and serve it as static files.

### B.1 Render to disk on the staging machine

The cleanest way to bake a raster pyramid from OSM data is to run `tileserver-gl` in batch mode against your MBTiles file. The `tileserver-gl` CLI has a `--render` subcommand-style workflow, but for full pyramid baking most operators reach for [`mbutil`](https://github.com/mapbox/mbutil) (extract an MBTiles file to a `{z}/{x}/{y}.png` directory tree) or the `tl` tool from [tilelive](https://github.com/mapbox/tilelive).

If you don't want to go through MBTiles at all, the full Mapnik render stack (Approach C) baked offline is the canonical path. The short version:

```bash
# Assumes you already have a renderd stack running on the staging machine.
# This pre-renders zoom levels 0–14 for a bounding box and writes to disk.
render_list -a -z 0 -Z 14 -n 8 -m default -x 0 -X 16383 -y 0 -Y 16383

# Then copy /var/lib/mod_tile to the airgapped server as a directory tree.
```

**Disk reality check** (PNG tiles, OSM Carto styling, rough numbers):

| Zoom range | Continent (e.g. Europe) | Single country | Planet |
|---|---|---|---|
| 0–10 | 0.5 GB | 50 MB | 8 GB |
| 0–14 | 30 GB | 2 GB | 600 GB |
| 0–17 | ~1 TB | 80 GB | 30+ TB |

For Splunk dashboards, **zoom 0–14 is plenty** (you can see down to neighborhood level). Going to 17 is a >30× disk blow-up for marginal benefit.

### B.2 Serve with nginx

```nginx
server {
    listen 443 ssl http2;
    server_name tiles.corp.internal;

    ssl_certificate     /etc/ssl/corp/tiles.crt;
    ssl_certificate_key /etc/ssl/corp/tiles.key;

    root /srv/tiles/osm;

    location ~ ^/(\d+)/(\d+)/(\d+)\.png$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
        try_files $uri =404;
    }
}
```

### B.3 Point Maps+ at it

| Field | Value |
|---|---|
| Map Tile Override | `https://tiles.corp.internal/{z}/{x}/{y}.png` |
| Map Attribution Override | `© OpenStreetMap contributors` |

---

## Approach C — Full `renderd` / `mod_tile` / PostGIS stack

This is the canonical OpenStreetMap.org tile rendering architecture: PostgreSQL + PostGIS as the data store, `osm2pgsql` to import, Mapnik to render, `renderd` to schedule, `mod_tile` (Apache module) to serve and cache. Tiles are rendered on-demand the first time they're requested, then cached on disk.

**Use this if:**
- You need to restyle the map (change colors, label density, hide features) and re-render without going back to the staging machine.
- You expect tens of thousands of unique tile requests per day and want on-demand rendering rather than baking the whole pyramid.
- You're already running PostGIS for other workloads.

**Don't use this if:** you just want maps to show up in airgapped Splunk dashboards. It's a ~150 GB PostGIS database (for the planet), a multi-hour import (`osm2pgsql --slim ...`), and a non-trivial Apache + Mapnik + Carto-CSS toolchain to keep running.

### C.1 Reference: switch2osm

Rather than duplicate a 3000-word installation walkthrough that's already maintained better than we ever could, follow the **switch2osm Ubuntu 24.04 LTS guide**:

- https://switch2osm.com/serving-tiles/manually-building-a-tile-server-ubuntu-24-04-lts/

It covers: installing `apache2`, `libapache2-mod-tile`, `renderd`, `mapnik-utils`, `postgresql-16-postgis-3`, `osm2pgsql`; creating the `gis` database; downloading and importing the `.osm.pbf` (`osm2pgsql --slim -d gis --hstore ...`); installing the `openstreetmap-carto` stylesheet; building it with `carto project.mml > mapnik.xml`; configuring `/etc/renderd.conf`; and starting the daemons.

**Adjustments for airgapped use:**

1. **Build on a connected staging server first.** Run the entire switch2osm guide to completion on a machine that can reach the internet. Verify tiles render at `http://staging-tile-server/hot/0/0/0.png`.
2. **Ship apt packages, not the whole VM.** Use `apt-get download $(apt-cache depends --recurse --no-recommends ... | grep "^\w")` to pull every `.deb` into a directory, then `dpkg -i *.deb` on the airgapped box. This is much smaller than imaging a whole VM and easier to audit.
3. **Ship the imported PostGIS database, not the `.osm.pbf`.** The slow part is the `osm2pgsql` import, not the database itself. Do `pg_dump -Fc gis > gis.dump` on staging and `pg_restore` on the airgapped server. This skips the multi-hour import on the production side.
4. **Ship `openstreetmap-carto/mapnik.xml`, not the stylesheet sources.** The compiled `mapnik.xml` is what `renderd` reads. You don't need Carto, Node.js, or npm on the airgapped server.

### C.2 Point Maps+ at it

`mod_tile` serves tiles at `/<style>/{z}/{x}/{y}.png` (the default style suffix from switch2osm is `hot` or whatever you set in `/etc/renderd.conf`).

| Field | Value |
|---|---|
| Map Tile Override | `https://tiles.corp.internal/hot/{z}/{x}/{y}.png` |
| Map Attribution Override | `© OpenStreetMap contributors` |

---

## Updating tile data

OSM data changes constantly. If your dashboards need fresh data (roads, points of interest, building footprints), plan a refresh cadence:

- **Approach A / B:** re-run tile generation on the staging machine against a fresh Geofabrik `.osm.pbf` (downloaded daily), copy the new `.mbtiles` or tile pyramid across the air gap, atomically swap on the production server. Monthly cadence is typical.
- **Approach C:** use `osm2pgsql --append` with daily diffs from Geofabrik (`*.osc.gz` files). Diffs are also free to download but must be applied through the air gap on the same schedule as the database.

For airports, military bases, hospitals, etc., features change slowly — quarterly or semi-annual refreshes are usually fine.

---

## Licensing and attribution

- **OSM data** is [ODbL](https://opendatacommons.org/licenses/odbl/). You can host it, derive tiles from it, and serve those tiles internally with no license fee. Attribution `© OpenStreetMap contributors` is required on the visible map (Maps+ does this automatically via the **Map Attribution Override** field). Internal corporate use is fully covered; redistribution outside your organization triggers the share-alike clause.
- **OpenMapTiles schema** (used by tilemaker's default config) is CC-BY. You can self-generate, self-host, and use commercially for free. You only pay [MapTiler](https://maptiler.com/data/pricing) if you want their *pre-generated* planet tiles. tilemaker against a free Geofabrik extract avoids any payment.
- **OpenFreeMap styles** (`liberty`, `positron`, `bright`, `fiord`) are MIT-licensed and free for commercial self-hosting. Their planet PMTiles dataset is also free for self-hosting (300 GB disk).
- **CartoDB / Esri / Stadia tiles** are commercial. If you previously used these in Maps+ and need an airgapped equivalent, all three offer paid on-prem licenses, but for most users self-generated OSM tiles via Approach A is the simpler answer.

---

## Sanity-check the airgap

Maps+ ships with an acceptance-test dashboard for exactly this purpose. After installing the app:

1. Open **Maps+ for Splunk → Airgapped Tile Server Acceptance Test** in the Splunk Web sidebar (also reachable at `/app/leaflet_maps_app/airgapped_tile_test`).
2. Set the three input fields at the top to your internal tile server URLs (raster template, MapLibre style JSON, attribution string).
3. Walk through the six-point checklist in the bottom panel — both maps render with labels, all six globally-distributed markers are visible on a non-grey background, every Network-tab request targets your tile host, etc.

Pair the dashboard with `tcpdump` on the Splunk web host while reloading it:

```bash
# Confirm there are NO outbound requests to any tile CDN.
sudo tcpdump -i any -n -c 200 \
  'host basemaps.cartocdn.com or host tile.openstreetmap.org or host tiles.openfreemap.org'

# Expected output: zero captured packets.
# Any packets here means a Maps+ setting somewhere is still pointing at a public CDN —
# check Map Tile, Map Tile Override, MapLibre Style URL, and the OpenFreeMap toggle.
```

Also confirm in the browser DevTools Network tab (with cache disabled) that every tile request goes to `tiles.corp.internal` (or whatever you named it) and returns 200.

---

## Troubleshooting

**Tiles 404 in the browser, but `curl` works on the tile server.**
CORS. Make sure `Access-Control-Allow-Origin: *` (or your Splunk Web origin) is on every tile response.

**Tiles load but the map looks empty / no labels.**
You're serving vector tiles with a style that references fonts (`glyphs`) or icons (`sprite`) hosted at a public URL. Edit the style JSON to point `glyphs` and `sprite` at your internal server, and host the corresponding PBF font stacks and sprite PNGs alongside the style.

**Maps+ shows tiles in dashboard preview but they're blank when viewing the published dashboard.**
The Splunk iframe sandbox blocks mixed content. If your tile server is HTTP and Splunk Web is HTTPS, browsers will block tile requests silently. Always serve tiles over HTTPS in production.

**`tileserver-gl` runs but the GUI shows "no styles".**
You only mounted the MBTiles file, not a `config.json` declaring styles. Either pass `--file us-west.mbtiles` (auto-detects and uses the default style) or write a `config.json` that registers your custom style — see the [tileserver-gl docs](https://tileserver.readthedocs.io/).

**Disk filled up faster than expected on the raster pyramid.**
You probably enabled zoom 17+ for a large region. Each extra zoom level is 4× the tiles of the previous one. Cap at zoom 14 for dashboard use; cap at 16 only if your users zoom into individual buildings.
