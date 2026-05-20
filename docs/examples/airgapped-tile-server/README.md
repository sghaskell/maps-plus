# Airgapped tile server — Docker Compose example

A two-container reference deployment for the airgapped Maps+ tile server described in [`docs/airgapped-tile-server.md`](../../airgapped-tile-server.md). Use this as a starting point — adapt to your TLS, registry, and orchestration conventions.

## What you get

- **`tileserver-gl`** (port `127.0.0.1:8080`) serving vector + on-the-fly raster tiles from `data/*.mbtiles`.
- **`nginx`** (port `80`) fronting `tileserver-gl` with CORS, 30-day tile caching, and direct static serving for fonts, sprites, style JSONs, and low-zoom hillshade rasters.

## Directory layout (what you provide)

```
docs/examples/airgapped-tile-server/
├── docker-compose.yml
├── nginx.conf
├── mirror-openfreemap.sh (run on connected staging machine, see below)
├── README.md             (this file)
└── data/                 ← you create and populate this
    ├── us-west.mbtiles               from Approach A.1 in the main guide
    ├── styles/
    │   └── liberty.airgapped.json    from Approach A.4
    ├── fonts/
    │   └── Noto Sans Regular/
    │       ├── 0-255.pbf
    │       ├── 256-511.pbf
    │       └── ...
    ├── sprites/
    │   └── ofm_f384/
    │       ├── ofm.json
    │       ├── ofm.png
    │       ├── ofm@2x.json
    │       └── ofm@2x.png
    └── natural_earth/                (referenced by all four styles)
        └── ne2sr/
            └── {z}/{x}/{y}.png       z = 0..6
```

A `mirror-openfreemap.sh` script is included in this directory. Run it on your connected staging machine to populate `styles/`, `fonts/`, `sprites/`, and (for Liberty) `natural_earth/` in one pass:

```bash
# Mirror the Liberty style; default rewrite target is https://tiles.corp.internal
./mirror-openfreemap.sh liberty ./out

# Override the hostname URLs are rewritten to:
INTERNAL_BASE_URL="https://maps.example.corp" ./mirror-openfreemap.sh liberty ./out

# Mirror a different style (output size is ~110 MB regardless — hillshade dominates):
./mirror-openfreemap.sh positron ./out
```

Then `rsync` the resulting `./out/` across the airgap into `./data/`.

## Bring it up

On the airgapped server (after pulling and `docker save`/`docker load`-ing the `maptiler/tileserver-gl` and `nginx:1.27-alpine` images):

```bash
cd docs/examples/airgapped-tile-server/
docker compose up -d

# Smoke tests
curl -fsS http://localhost/styles/liberty.airgapped.json | jq .name
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost/data/v3/0/0/0.pbf
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost/fonts/Noto%20Sans%20Regular/0-255.pbf
```

All three should return `200`.

## Point Maps+ at it

In the dashboard's visualization formatter:

**Raster mode (works everywhere, no MapLibre dependency):**

| Field | Value |
|---|---|
| Map Tile Override | `http://your-tile-host/styles/liberty/{z}/{x}/{y}.png` |
| Map Attribution Override | `© OpenStreetMap contributors` |

**Vector mode (sharper labels, faster pans, browser-side restyling):**

| Field | Value |
|---|---|
| OpenFreeMap Vector Tiles | Enabled |
| MapLibre Style URL | `http://your-tile-host/styles/liberty.airgapped.json` |

> **Switch to HTTPS before production.** Splunk Web served over HTTPS will block mixed-content tile requests from an HTTP origin. The `nginx.conf` ships with a commented HTTPS server block — drop your cert and key into `./tls/`, uncomment the relevant lines in `docker-compose.yml` and `nginx.conf`, and update the URLs above to `https://`.

> **Verify with the bundled acceptance-test dashboard.** Maps+ ships an **Airgapped Tile Server Acceptance Test** dashboard (`/app/leaflet_maps_app/airgapped_tile_test`) that renders the same six globally-distributed markers in both raster and vector mode and includes a six-point sign-off checklist. Set the dashboard's three input fields to the same URLs you configure here.

## Updating tiles

Atomic swap — the tileserver-gl container holds an open file handle to the active `.mbtiles`, so overwrite-in-place can corrupt reads.

```bash
# 1. Drop new MBTiles alongside the old one
cp us-west-2026-06.mbtiles data/

# 2. Update the command in docker-compose.yml to point at the new file
#    (or use a stable symlink: data/active.mbtiles -> us-west-2026-06.mbtiles)

# 3. Recreate the container — nginx-fronted requests continue to be cached
docker compose up -d --force-recreate tileserver

# 4. After verifying, remove the old MBTiles
rm data/us-west-2026-05.mbtiles
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vector panel blank but `curl` of style/data URLs returns 200; browser console shows CORS error | `Access-Control-Allow-Origin: *, *` (header set twice — once by `tileserver-gl`, once by nginx). Browsers reject duplicate ACAO per CORS spec. | The bundled `nginx.conf` uses `proxy_hide_header Access-Control-Allow-Origin` in the proxy block to strip the upstream header before nginx sets its own. If you wrote your own nginx config, replicate that. |
| Static assets (style JSON, sprites, hillshade) return 404 from nginx | Regex `location ~ ^/styles/...` is competing for priority with the proxy's `location /`. The bundled config uses `^~` prefix locations and a specific `~ ^/styles/[^/]+\.json$` regex for exactly this reason. | Use the locations as written; in particular, do not change `^~ /fonts/` to `~ /fonts/` (regex without `^~` loses to longer prefix matches). |
| `/styles/{name}/{z}/{x}/{y}.png` returns 404 (raster mode) | The static `location` for `/styles/` is too broad and is intercepting tileserver-gl's raster pyramid path. | Only match style JSON files under `/styles/` — use `location ~ ^/styles/[^/]+\.json$`, not `location /styles/`. |
| Tiles 404 in browser, 200 with `curl` from another host | CORS header missing on the response Splunk's iframe sees | Confirm `add_header Access-Control-Allow-Origin "*" always;` appears on every `location` block including error responses |
| Map labels are boxes / question marks | Font glyphs missing | Re-run the font mirror loop in the main guide. Check `data/fonts/<stack>/0-255.pbf` exists |
| Empty grey background at zoom 0–3 | `natural_earth/ne2sr/` tiles missing | Re-run the hillshade mirror loop. All four built-in styles reference this raster source. |
| `tileserver-gl` container reports unhealthy | The image is distroless-ish — `wget`/`curl` aren't present. | The bundled compose file uses a `node` one-liner for the healthcheck. If you wrote your own, use `["CMD","node","-e","require('http').get('http://localhost:8080/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]`. |
| `tileserver-gl` GUI loads but tile requests 404 | `command:` in `docker-compose.yml` doesn't match the actual `.mbtiles` filename | Update the `--file` argument or use a config.json |
| Splunk dashboard preview shows tiles but published dashboard is blank | Mixed-content block (HTTPS Splunk → HTTP tile server) | Enable the HTTPS block in `nginx.conf` |
