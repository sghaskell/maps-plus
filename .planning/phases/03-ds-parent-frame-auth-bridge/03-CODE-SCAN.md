# Phase 3 — Code Scan: Runtime URL-Shape Inventory

> **Step 1 output of the Path B research wave.** Empirical input to D-04 (URL-shape regex) and the broader scope decision in `.continue-here.md`. Replaces the tile-only assumption baked into `03-CONTEXT.md` D-04 / D-NN-3 / D-NN-5.
>
> **Method:** ripgrep across `appserver/static/visualizations/maps-plus/src/{maps-plus.js,ds-tile-proxy-helpers.js}` for URL-emission sites (Splunk URL helpers, `/static/app/...` literals, Leaflet icon construction, `fetch`/`$.ajax`/XHR, `contrib/` literals, KML/GeoJSON loaders, font/sprite references). Cross-referenced with `contrib/css/*.css` for CSS-internal `url(...)` shapes that bypass JS interception entirely.

## Summary table — categories and counts

| Category | URL-emission sites | Loader mechanism | Iframe-cookie failure mode in DS | Bridge can intercept? |
|---|---:|---|---|---|
| (a) Tile-proxy traffic | 1 (`getTileUrl` via `DsProxyTileLayer`) | `<img src>` injected by Leaflet | Cookie withheld → 401 redirect → blank tile | **Yes** (already wired in Phase 02 — Maps+ JS controls the URL string) |
| (b) `/static/app/leaflet_maps_app/...` JS-driven static | 5 explicit emission sites (icon images, KML overlay files, custom marker icons, custom shadow icons, i18n JSON) | `<img src>`, `$.ajax`, `JSZipUtils.getBinaryContent`, `i18n.load` | Cookie withheld → 401 redirect (HTML) → asset load fails | **Yes** — JS controls the URL; bridge can wrap |
| (c) `/static/app/leaflet_maps_app/...` CSS-driven static | N CSS files with `url(...)` references (sprites, fonts, marker icons) | Browser CSS-engine resolves `url(...)` against stylesheet's own URL | Cookie withheld → 401 redirect → font/sprite missing | **NO via JS rewriting** — must rewrite CSS text BEFORE injection (or fetch-and-rewrite all `url()` to `blob:`) |
| (d) Splunk REST (non-tile) | 1 explicit (`storage/passwords` via `$.ajax`) | `$.ajax` to `/en-US/splunkd/__raw/servicesNS/...` | Cookie withheld → 401 → `getStoredApiKey()` rejects → Bing layer never inits (silent) | **Yes** — JS controls the URL |
| (e) Third-party CDN | 5+ tile-template literals (CartoCDN, OSM, OpenTopoMap, ArcGIS, GIBS, GBIF) + Bing dev.virtualearth | `<img src>` via `L.tileLayer` (Classic) or `DsProxyTileLayer.getTileUrl` (DS) | Already routed through Phase 1 server-side proxy in DS mode | **Yes** — already covered by (a) |
| (f) RequireJS-bundled `contrib/js/*` | 19 `define([...])` deps | RequireJS resolves at module load — happens BEFORE the iframe boots into DS-aware code | Bundle is loaded as part of `visualization.js` itself (already a single bundle) | **N/A** — already loaded as one file by the time the viz initializes |

## (a) Tile-proxy traffic — already routed (Phase 02)

| Site | Location | Notes |
|---|---|---|
| `DsProxyTileLayer.getTileUrl` | `maps-plus.js:146–166` | DS-only override. Builds `${restRoot}/maps_plus/tile/proxy?url=...&z=...&x=...&y=...&s=...&r=...` via `DsTileProxyHelpers.buildTileProxyUrl`. |
| `buildTileProxyUrl` | `ds-tile-proxy-helpers.js:60–76` | Single function emitting the proxy URL shape. |

**REST root resolution (`_resolveSplunkRestRoot`):** `<origin>/en-US/splunkd/__raw/services` (line 115) where `<origin>` is detected via `document.currentScript.src` (line 88–110). Falls back to `/services` (line 117) if detection fails — broken in DS, expected per T2-03.

**Final URL shape (DS mode):**
```
http://<splunkweb>/en-US/splunkd/__raw/services/maps_plus/tile/proxy?url=<enc>&z=<z>&x=<x>&y=<y>[&s=<s>][&r=<r>]
```

This matches the `D-04 PROXY_URL_SHAPE` regex starter in `03-CONTEXT.md`. **No change needed for the tile half.** The drift-guard test for D-04 (regex must match what `buildTileProxyUrl` emits) remains valid as-is.

## (b) JS-driven `/static/app/leaflet_maps_app/...` static loads

All five sites concatenate `(_SPLUNK_ORIGIN || location.origin) + this.contribUri + '/<subpath>/...'` where `contribUri = '/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib'` (line 201).

| # | Site | Subpath / extension | Loader | Notes |
|---|---|---|---|---|
| b1 | `L.Icon.Default.imagePath` | `/images/` (sprite dir for Leaflet defaults — marker-icon.png, marker-shadow.png, etc.) | Leaflet builds `<img src>` internally from `imagePath` | `maps-plus.js:2475`. Fires on every default marker. |
| b2 | i18n JSON | `/i18n/<lang>.json` (e.g. `en.json`, `de.json`) | `i18n.load(...)` → internal `$.getJSON` | `maps-plus.js:2922`. **Already gated by `!this._isDashboardStudio`** (graceful skip — fall back to English literals). Bridge could re-enable this in DS. |
| b3 | KML overlay (in-app) | `/kml/<file>.kml` or `.kmz` | `$.ajax({dataType: 'text'})` (line 1740) or `JSZipUtils.getBinaryContent` (line 1711) | `maps-plus.js:2998`. Only fires when user supplies `kmlOverlay` config; falls through to (e) if URL is absolute `https?://`. |
| b4 | Custom marker icon | `/images/<customIcon>` | Leaflet builds `<img src>` from `iconUrl` option | `maps-plus.js:3338`. Per-row from SPL `customIcon` field. |
| b5 | Custom marker shadow | `/images/<customIconShadow>` | Leaflet builds `<img src>` from `shadowUrl` option | `maps-plus.js:3336`. Per-row from SPL `customIconShadow` field. |

**Final URL shape:**
```
http://<splunkweb>/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib/{images|i18n|kml}/<filename>
```

**Path-traversal protection requirement (D-NN-5 expansion):** `customIcon`, `customIconShadow`, and `kmlOverlay` are all SPL-field-driven (b3/b4/b5). An attacker-controlled SPL search could inject `../../../etc/passwd`-style payloads. The bridge's static-asset regex MUST reject:
- `..` segments (URL-decoded and double-decoded — `%2e%2e`, `%252e%252e`, etc.)
- Backslash variants (`%5c`, `\`)
- Leading-`/` strip surprises (e.g., `/etc/passwd` after the prefix)
- Protocol-relative (`//evil.example/...`)
- Absolute URLs (already partially handled at line 2998 by the `^https?://` test, but the bridge should re-validate)
- Anything that escapes `/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib/`

Without this, the bridge becomes a same-origin SSRF primitive against Splunkweb's REST endpoints (other apps, admin endpoints, `/services/...`).

## (c) CSS-driven static loads — the SHARP EDGE

`contrib/css/*.css` files contain `url(...)` references that the **browser CSS engine resolves** against the stylesheet's own URL when it parses the CSS. JS does not see these requests; they cannot be intercepted by wrapping `fetch` or rewriting `<img src>` after the fact.

| CSS file | Reference type | Example |
|---|---|---|
| `leaflet.css` | Image sprites | `url(../images/layers.png)`, `url(../images/marker-icon.png)`, `url(../images/marker-icon-2x.png)`, `url(../images/marker-shadow.png)` |
| `leaflet.awesome-markers.css` | Image sprites | (same `images/` subdir pattern) |
| `leaflet-measure.css` | Image sprites | (same) |
| `leaflet-legend.css` | Image sprites | (same) |
| `leaflet-gplaces-autocomplete.css` | Image sprites | (same) |
| `leaflet-geoman.css` | Image sprites | (same) |
| `leaflet-draw.css` | Image sprites | (same) |
| `fontawesome-all.min.css` | `@font-face src: url(../fonts/fa-brands-400.woff2)` | Web fonts |
| `ionicons.min.css` | `@font-face src` | Web fonts |
| `glyphicon.css` | `@font-face src` | Web fonts |
| `maplibre-gl.css` | Both | Sprites + fonts |

**Resolved URL shapes:**
```
http://<splunkweb>/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib/images/<sprite>.png
http://<splunkweb>/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib/fonts/<font>.{woff,woff2,ttf,eot}
```

**The bridge CANNOT intercept these via JS-side URL rewriting.** The only mitigations:

1. **Fetch CSS through the bridge, rewrite `url(...)` in the text, inject via `<style>`.** Iframe-side: for each `<link rel="stylesheet" href=".../contrib/css/foo.css">`, intercept (or never emit), fetch the CSS text via the bridge, parse all `url(...)` refs, fetch each through the bridge, convert to `blob:` URL, substitute, then inject the rewritten CSS via `<style>` tag. **Heavy** — many `url()` refs per stylesheet. Blob URLs are origin-independent so they survive in the opaque-origin iframe. Caveat: `@font-face` with blob `src` may have additional quirks (font-loading API; CORS attribute).
2. **Move CSS-referenced assets out of `/static/app/` and into the bridge-served namespace.** Doesn't help because the cookie boundary is what's broken — not the URL shape.
3. **Inline CSS-referenced binary assets as base64 data URIs at build time.** Bloats `visualization.css`; rules out font-loading (data-URI fonts have their own CORS quirks but generally work). Build-time only.
4. **Server-side: have a Splunk REST handler proxy `/static/app/leaflet_maps_app/contrib/...` with permissive CORS.** Doesn't solve cookies in the `null`-origin iframe; the same `SameSite=Lax` boundary still applies to that REST handler unless it's explicitly cookieless (which means another auth layer).

**Implication for D-04 / D-NN-3 / D-NN-5:**

- The bridge MUST handle CSS as a content type (D-03 dispatch) — fetch CSS text, return as text payload to iframe, iframe rewrites `url()` refs.
- The bridge schema MUST be representation-agnostic (text + binary) — `tileData` rename to `body`/`payload` is no longer cosmetic; it's required.
- The static-asset URL-shape regex MUST allow `/contrib/css/*.css`, `/contrib/images/*.{png,gif,svg}`, `/contrib/fonts/*.{woff,woff2,ttf,eot}`, `/contrib/i18n/*.json`, `/contrib/kml/*.{kml,kmz}` — broader than just `/images/`.

## (d) Splunk REST (non-tile)

| Site | URL shape | Loader |
|---|---|---|
| `getStoredApiKey` | `/en-US/splunkd/__raw/servicesNS/-/-/storage/passwords/<realm>:<user>:` | `$.ajax({type: 'GET'})` at `maps-plus.js:1135–1139` |

Currently broken in DS (cookie withheld → 401). Bing Maps integration silently fails. Low priority but worth a note: bridge could carry this too. Recommend NOT widening the bridge scope to arbitrary REST in v1 — let `getStoredApiKey` remain DS-broken (it already silently fails) and address in a follow-up if Bing-in-DS becomes a requirement.

## (e) Third-party CDN tile templates

These appear as string literals in `defaultConfig` and `ATTRIBUTIONS` (`maps-plus.js:284, 354, 377–381, 2466`):

| Tile provider | Template |
|---|---|
| CartoCDN (light/dark) | `https://{s}.basemaps.cartocdn.com/{light_all,dark_all}/{z}/{x}/{y}.png` |
| OpenStreetMap | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` |
| OpenTopoMap | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` |
| Humanitarian OSM | `https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png` |
| ArcGIS World Imagery | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` |
| GIBS (NASA) | `https://gibs.earthdata.nasa.gov/...` (built dynamically from `gibsLayerId`/`gibsTime`/`gibsFormat`) |
| GBIF Antarctic | `https://tile.gbif.org/3031/omt/{z}/{x}/{y}@{r}x.png?gbif-geyser` |
| Bing Maps | resolved by `L.tileLayer.bing` from `dev.virtualearth.net` metadata |
| MapLibre / OpenFreeMap | vector-tile path through MapLibre-GL — NOT covered by the raster proxy and currently uses direct fetches |

In DS mode all of these (except MapLibre) are already routed through the Phase 1 server-side proxy via `DsProxyTileLayer`. MapLibre is its own boundary — out of scope for Phase 3.

## (f) RequireJS-bundled deps (informational, not in bridge scope)

`maps-plus.js` `define([...])` block (lines 5–48) lists 19 `../contrib/js/*` deps:

```
../contrib/js/Modal, theme-utils, HeatLayer, leaflet.spin,
leaflet.featuregroup.subgroup-src, leaflet-measure,
leaflet.awesome-markers, leaflet-vector-markers, LeafletPlayback,
CLDRPluralRuleParser, jquery.i18n[.messagestore|.fallbacks|.language|
.parser|.emitter|.emitter.bidi]
```

These are bundled INTO `visualization.js` by Webpack 5. By the time the viz JS executes inside the DS iframe, these modules are already inlined — no runtime fetch happens. **Bridge does not need to handle these.**

`leaflet`, `jquery`, `underscore`, `vendor/leaflet`, `bing-layer`, `geoman`, `turf`, `togeojson`, `jszip`, `jszip-utils`, `leaflet-ant-path`, `proj4leaflet`, `milsymbol`, `maplibre-gl`, `@maplibre/maplibre-gl-leaflet` — also bundled.

## Empirical input to D-04 (broader URL-shape regex)

Two regexes, both with drift-guards:

```
TILE_PROXY_REGEX:
  ^/en-US/splunkd/__raw/services/maps_plus/tile/proxy\?url=...&z=...&x=...&y=...(?:&s=...)?(?:&r=...)?$

APP_STATIC_REGEX:
  ^/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib/
    (?:images|fonts|css|i18n|kml)/
    [A-Za-z0-9._-]+
    (?:\.(?:png|gif|jpg|jpeg|svg|woff|woff2|ttf|eot|css|json|kml|kmz))$
```

**Hard rejections in `APP_STATIC_REGEX` validation (post-regex):**

- `..` and `%2e%2e` (and `%252e%252e`) anywhere in path
- `\` (and `%5c`)
- `//` (protocol-relative or path-collapse)
- Leading `/` after the prefix
- URL-decode-then-re-decode mismatch (signals double-encoding attack)
- Query string or fragment (static assets have neither)
- Total path length cap (e.g., 256 bytes — defense in depth against pathological inputs)

**Drift-guard tests (Plan 03-01 / 03-02 must include):**

1. `TILE_PROXY_REGEX` matches the output of `buildTileProxyUrl(...)` (call the function with sample inputs, assert match).
2. `APP_STATIC_REGEX` matches the URLs produced by all five JS-driven sites (b1–b5) with sample inputs.
3. `APP_STATIC_REGEX` matches the resolved URLs for every CSS file in `contrib/css/*.css` and every `url(...)` reference inside those CSS files.
4. `APP_STATIC_REGEX` REJECTS each of the path-traversal payloads listed above (negative tests).

## Open questions surfaced by the scan

| # | Question | Affects |
|---|---|---|
| Q1 | If R3 succeeds (iframe self-installs bridge), do CSS `url()` references still need bridge handling? **Yes** — CSS is parsed by the iframe's CSS engine after injection, regardless of where the bridge install happened. The cookie boundary still applies to CSS-emitted requests. | D-03 dispatch design |
| Q2 | Is there a Splunkweb-side cookie-policy escape hatch for `/static/app/...`? E.g., serving these without `SameSite=Lax`? | Could obviate (c) entirely if such a config exists |
| Q3 | Does Splunk 10.x DS v2 expose a `viz.json` or `setup.xml` hook that runs in the **top frame** before the iframe mounts? | R2 — would make CSS injection at top-frame possible (top frame has cookies) |
| Q4 | Can the Phase 1 REST handler be extended to serve `/contrib/static/...` via a separate endpoint that doesn't require cookies (e.g., session-token-in-URL signed by the parent)? | Alternative to a JS bridge for CSS-engine-driven requests — but reintroduces auth-token-in-URL risk |
| Q5 | Are the i18n JSON files semantically required in DS, or can the current English-fallback path stand? | Decides whether b2 needs bridge support or can stay graceful-skip |

Q1 should be carried into the R3 step as a follow-up. Q3 is the second-highest-leverage research question after R3 itself — if a top-frame hook exists, the entire CSS problem dissolves (top-frame `<link>` injection with the parent's cookies works).

## Verdict

The bridge scope expansion is **broader than `.continue-here.md` flagged**. The continue-here note covers (b) JS-driven static plus the tile half (a). It does NOT call out (c) CSS-driven static — which is the SHARP edge because JS-side URL rewriting cannot intercept CSS-engine `url()` refs. Any bridge design that doesn't handle CSS-content-type rewriting will leave fonts/sprites broken in DS even after the bridge "works."

This must be reflected in:

- D-NN-3 response schema: `body` field is binary OR text (CSS); `contentType` drives iframe-side dispatch
- D-03: explicit handlers per content type
  - `image/*` → blob → object-URL → Leaflet `<img src>` interception (already covered)
  - `text/css` → text → rewrite all `url(...)` refs → inject as `<style>` tag (NEW — most expensive)
  - `font/woff2`, `font/ttf`, `application/font-woff` → blob → object-URL → CSS `@font-face src: url(blob:...)` rewrite (chained from CSS handler)
  - `application/json` (i18n) → text → return to caller (b2)
  - `application/vnd.google-earth.kml+xml`, `application/vnd.google-earth.kmz` → blob → return to caller (b3)
- D-04: TWO regexes (tile + app-static), both with drift-guards
- D-NN-5: bridge is the ONLY guard for app-static URLs; document path-traversal rejection requirements
- D-NN-2: rename four message-type literals to reflect generic resource semantics (`maps-plus:fetch-resource` / `maps-plus:resource-result` / ping / pong); count stays at 4

## Files NOT modified

This is a research-only output. No code, no plans, no CONTEXT changes yet. Carry these findings into:

- R3 (Step 2) — particularly Q1 (CSS still needs bridge regardless of install path)
- R2 (Step 3, conditional) — particularly Q3 (top-frame hook would dissolve CSS problem)
- Step 5 — the re-lock of `03-CONTEXT.md` D-NN-3 / D-04 / D-NN-5 / D-03 / D-NN-2

> **Next:** Step 2 (R3) — read MDN/HTML spec on opaque-origin `window.top` access; if unclear, run minimal browser test in `splunk-10-dev`.
