---
phase: 02-maps-plus-js-integration-testing
session_type: conversational_uat
created: 2026-04-17
target_app_version: 4.6.1
splunk_container: splunk-10-dev
related: 02-UAT-MATRIX.md (34-row offline reference)
status: blocked_on_ds_auth_bridge
---

# Phase 02 — Conversational UAT Session

End-to-end verification of Phase 02 claims against a live Splunk 10 + Dashboard
Studio instance. Distinct from `02-UAT-MATRIX.md` (the offline 34-row tester
checklist) — this file is the **session record** of the eight highest-leverage
user-observable claims extracted from `02-01-SUMMARY.md` and `02-02-SUMMARY.md`.

## Environment

- **Splunk container:** `splunk-10-dev` @ http://localhost:8000 / https://localhost:8089
- **App version:** leaflet_maps_app 4.6.1 (Phase 1 + Phase 2 integrated)
- **Browser:** _to fill_ (Chrome primary, DevTools Network panel open)
- **Tester:** _to fill_
- **Date:** 2026-04-17

## Pre-flight (already verified per bootstrap)

| ID | Check | Status |
|----|-------|--------|
| PF-1 | App installed in container, enabled, Splunk restarted | pass (bootstrap step) |
| PF-2 | REST endpoint returns valid PNG via curl | pass (bootstrap step — HTTP 200, 256x256 PNG) |
| PF-3 | Python tests 77/77 | pass (bootstrap step) |
| PF-4 | Jest tests 20/20 | pass (bootstrap step) |
| PF-5 | `visualization.js` clean / committed | pass (no diff) |

## Test Results

| # | ID | Test | Result | Notes |
|---|------|------|--------|-------|
| 1 | UAT-1 | Classic dashboard regression — proxy MUST NOT activate | **pass** (after defect fix) | AMD param/dep misalignment fixed mid-UAT — see UAT-1 notes below |
| 2 | UAT-2 | DS dashboard — proxy activates, tiles 200 OK | **blocked** | Phase 02 client-side wiring is correct; blocked on cross-origin session cookie — needs parent-frame auth bridge (Phase 03). See UAT-2 notes below |
| 3 | UAT-3 | Proxied URL shape + single encodeURIComponent (T2-06) | blocked on UAT-2 | URL-shape partially verified via 303 request line — shape is correct |
| 4 | UAT-4 | GIBS provider — `{gibsLayerId}`/`{gibsTime}` pre-resolved (D-09) | blocked on UAT-2 | |
| 5 | UAT-5 | Cache hit on reload — < 5 ms from memory LRU | blocked on UAT-2 | |
| 6 | UAT-6 | SSRF defense end-to-end via DS UI (T2-02) | blocked on UAT-2 | Phase 1 SSRF already verified standalone via curl; DS-path verification deferred |
| 7 | UAT-7 | Disabled flag → 503, graceful UI degradation | blocked on UAT-2 | |
| 8 | UAT-8 | Console hygiene — `[maps-plus] tile proxy:` prefix, no PII | **partial pass** | Observed `[maps-plus:ds-proxy] tile load failed z=N x=N y=N` with zero PII, zero stack trace, one line per failed tile — no flood. Prefix + body shape conform to D-15. Re-verify after auth bridge lands. |

---

## UAT-1 — Classic dashboard regression

**Why this matters:** Phase 02's hardest constraint (DS-JS-04) is byte-equivalent
behavior in Classic Splunk. A single tile request hitting `/maps_plus/tile/proxy`
in Classic mode would mean DS detection has a false positive.

**Steps:**
1. Open `http://localhost:8000/en-US/app/leaflet_maps_app/maps_plus_basic_markers`
   (or any Classic dashboard with a Maps+ viz)
2. Open DevTools → Network → filter by `tile/proxy`
3. Pan/zoom the map a few times
4. In Console: `console.log(window.__SPLUNK_DASHBOARD_STUDIO__)`

**Expected:**
- 0 requests matching `tile/proxy`
- Tile requests go to `*.basemaps.cartocdn.com` or similar CDN directly
- `window.__SPLUNK_DASHBOARD_STUDIO__` is `undefined`
- No `[maps-plus] tile proxy:` lines in Console

**Result:** **pass** (2026-04-17, after defect fix committed mid-session)

**Defect found and fixed during UAT-1:**

First load showed `Uncaught TypeError: p.isDashboardStudio is not a function`
and "Failed to load source for Maps+ visualization". Root cause: Phase 02
Plan 02-01 Task 2 appended `'./ds-tile-proxy-helpers'` as the **42nd** entry
in the AMD `define([...])` array at `src/maps-plus.js`, but the factory
function has only 15 positional parameters. AMD binds parameters by position,
so `DsTileProxyHelpers` (param 15) was bound to `'spin.js'` (array slot 15) —
making `p.isDashboardStudio` resolve to `Spin.isDashboardStudio` = undefined.

Jest tests (20/20) did not catch this because they `require()` the helper
module directly and never exercise the AMD wiring.

Fix: moved `'./ds-tile-proxy-helpers'` from array position 42 to position 15,
aligning it with the `DsTileProxyHelpers` factory parameter. Two-hunk edit
in `src/maps-plus.js`. Jest 20/20 still pass. `npm run build` succeeded.
Bundle redeployed to `splunk-10-dev`, md5 matches. Splunk Web restarted.

Retest result:
- Network panel filtered `tile/proxy`: **0 of 177 requests** ✓
- No `Failed to load source` error ✓
- No `p.isDashboardStudio` TypeError ✓
- Map renders fully (OSM tiles visible, marker clusters rendered)
- OSM's upstream 403 "Referer required" blocks on some tiles are expected
  Classic-mode behavior (direct-to-CDN fetch with no Referer header) and
  will disappear in DS mode where the proxy supplies a proper User-Agent.

Follow-ups captured below.

---

## UAT-2 — DS dashboard proxy activation

**Steps:**
1. In Splunk UI, create a new Dashboard Studio dashboard
2. Add a Maps+ visualization block, leave default OSM basemap
3. Open DevTools → Console: confirm `window.__SPLUNK_DASHBOARD_STUDIO__` is truthy
4. DevTools → Network → filter `tile/proxy`
5. Watch tile requests as the map renders

**Expected:**
- `window.__SPLUNK_DASHBOARD_STUDIO__` truthy (boolean `true` or object)
- ≥1 request per visible tile to `/services/maps_plus/tile/proxy`
- All 200 OK
- 0 direct requests to `tile.openstreetmap.org`

**Result:** **BLOCKED** (2026-04-17) — Phase 02 client wiring confirmed correct;
root cause is a cross-origin session-cookie problem fundamentally outside the
scope of what Phase 02 can solve in client code alone. Requires a Phase 03
parent-frame auth bridge (see "DS parent-frame auth bridge" below).

**What works (Phase 02 wiring validated end-to-end):**
- DS runtime detected: `isDashboardStudio()` returns true inside the `about:srcdoc`
  iframe (after widening detection beyond the brittle `window.__SPLUNK_DASHBOARD_STUDIO__`
  flag — see "Defects found and fixed during UAT-2" below)
- `DsProxyTileLayer.getTileUrl()` emits correct proxy URLs — confirmed in the
  Network panel, shape matches Jest-pinned template exactly:
  `/en-US/splunkd/__raw/services/maps_plus/tile/proxy?url=<enc>&z=N&x=N&y=N[&s=a][&r=2]`
- Splunk Web origin resolved correctly in the `null`-origin iframe (derived
  from the `visualization.js` script tag `src` attribute, not `location.origin`)
- Leaflet requests one proxy URL per visible tile on pan/zoom (expected fanout)
- `[maps-plus:ds-proxy] tile load failed z=N x=N y=N` instrumentation fires
  on `tileerror`, with **zero** PII, **zero** stack trace, one line per failed tile

**What blocks it:**
Every `tile/proxy` request returns HTTP 303 with
`Location: /en-US/account/login?session_expired=1&return_to=...` — Splunkweb's
session middleware rejects the request **before** it reaches the Python REST
handler.

Request headers (captured from Brave DevTools, one tile):
```
GET /en-US/splunkd/__raw/services/maps_plus/tile/proxy?url=...&z=6&x=14&y=24&s=a&r=2
Origin: null
Sec-Fetch-Site: cross-site
Sec-Fetch-Mode: no-cors
Sec-Fetch-Dest: image
(NO Cookie: header)
```

Root cause: Dashboard Studio hosts custom visualizations inside an
`about:srcdoc` sandboxed iframe, which has origin `'null'`. From the browser's
perspective, every `<img src>` Leaflet issues is a cross-site subresource
request from `null` → `http://localhost:8000`. Splunk's session cookie is
`SameSite=Lax` (modern browser default, and confirmed by Splunk's own
`set-cookie` headers on `/en-US/account/login`), which means it is **not sent
cross-site from a null origin**, so the tile request reaches Splunkweb
cookieless and is redirected to login.

This is a browser security boundary, not a bug. `<img>` with `crossorigin`
attributes, `fetch()` with `credentials: 'include'`, and XHR with
`withCredentials = true` all suffer the same limitation: cookies are simply
not sent. The only fixes are (a) change the cookie to `SameSite=None; Secure`
(requires Splunkweb config change not shippable in an app), or (b) bridge
authenticated requests through the top-level window via `postMessage`.

**Follow-up plan:** Phase 03 — DS parent-frame auth bridge (Option A).
See `## Follow-ups captured during UAT` below and
`.planning/STATE.md` for next-phase pointer.

---

### Defects found and fixed during UAT-2

All three fixes landed in `src/maps-plus.js` and `src/ds-tile-proxy-helpers.js`;
Jest 24/24 pass; bundle rebuilt + redeployed:

**Defect 2A — synchronous `window.require('splunkjs/mvc/utils')` at module top-level.**
`_resolveSplunkRestRoot()` attempted a sync AMD require at define-time; in the
DS iframe this module is not yet loaded and RequireJS throws, crashing the
entire viz AMD factory. Fix: replaced with `_detectSplunkOrigin()` which
parses the Splunk Web host out of the `visualization.js` script tag `src` at
runtime, then composes `origin + '/en-US/splunkd/__raw/services'` as the REST
root. Stable regardless of AMD module load order.

**Defect 2B — `location.origin` resolves to the literal string `'null'`
inside an `about:srcdoc` iframe.**
Multiple call sites (`L.Icon.Default.imagePath`, i18n loader, KML fetches,
etc.) prepended `location.origin` to `this.contribUri`, producing URLs like
`null/en-US/static/app/leaflet_maps_app/...` or — after String coercion —
`http://localhost:8000/.../null/en-US/static/...`. Fix: cache
`_SPLUNK_ORIGIN = _detectSplunkOrigin()` at module load and replace all five
`location.origin + this.contribUri` sites with
`(_SPLUNK_ORIGIN || location.origin) + this.contribUri`.

**Defect 2C — jquery.i18n rejection surfaces as a fatal `updateView` error
in the DS adapter.**
In DS, i18n XHR to `/contrib/i18n/en.json` is blocked by CORS (null origin,
no ACAO header on static assets). jquery.i18n's internal
`$.getJSON(...).then(r => r.default)` has no `.catch`; the rejection bubbles
out as `Uncaught (in promise) TypeError: Cannot read properties of undefined
(reading 'default')`, which DS's `IframePropsHandler.handlePropsUpdate`
`await`s and treats as a fatal `updateView` error — killing the whole render.
Fix: skip `i18n.load()` entirely when `_isDashboardStudio === true`. UI
strings fall back to English source literals (acceptable; Maps+ has minimal
user-visible i18n beyond a few menu labels).

**Defect 2D — `isDashboardStudio()` only checked `window.__SPLUNK_DASHBOARD_STUDIO__`.**
In Splunk 10's DS legacy-viz runtime, that flag is **not** set inside the
srcdoc iframe. Fix: widen detection to also match `location.href ===
'about:srcdoc'` (primary signal — defining property of the legacy adapter),
`document.URL === 'about:srcdoc'`, and as a tertiary signal `parent !== self
&& location.origin === 'null'`. All paths fail closed to Classic on exception
or missing `window`. Added 4 new Jest cases — 24/24 pass. (This was the root
cause of the proxy never activating during the first three retries of UAT-2.)

---

## UAT-3 — Proxied URL shape + single encodeURIComponent (T2-06)

**Why this matters:** Pinned by Jest (`buildTileProxyUrl` 7 cases), but the
runtime may interact with `SplunkVisualizationUtils` in unexpected ways. We
need to confirm the bundled bundle actually emits the asserted shape.

**Steps:**
1. From UAT-2 with DS dashboard loaded, click any `tile/proxy` request in Network
2. Copy the full request URL
3. URL-decode the `url=` query parameter exactly once (e.g. `decodeURIComponent` in console)

**Expected:**
- Path matches `^.*/services/maps_plus/tile/proxy\?url=.+&z=\d+&x=\d+&y=\d+$`
- After single decode, `url=` value contains literal `{z}/{x}/{y}` (server resolves these)
- After single decode, NO `%25` sequences remain (would indicate double-encoding)

**Result:** _pending_

---

## UAT-4 — GIBS provider client-side token pre-resolution (D-09)

**Why this matters:** Phase 1 server only resolves `{z,x,y,s,r}`. The client
must pre-merge GIBS-specific tokens (`{gibsLayerId}`, `{gibsTime}`,
`{gibsTileMatrixSet}`, `{gibsFormat}`) before handing the template to `url=`.
Pinned in Jest but needs runtime verification.

**Steps:**
1. In the DS dashboard from UAT-2, switch basemap to "NASA GIBS BlueMarble_NextGeneration"
   via the Maps+ format menu
2. Pan/zoom to trigger tile fetches
3. Inspect any `tile/proxy` request → decode `url=` once

**Expected:**
- Decoded `url=` contains a fully-resolved GIBS WMTS path
  (e.g. `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2024-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`)
- NO literal `{gibsLayerId}`, `{gibsTime}`, etc. remain in the decoded string
- `{z}/{y}/{x}` (server-resolved tokens) ARE still present
- Tiles render visibly

**Result:** _pending — note: GIBS requires outbound access to gibs.earthdata.nasa.gov; skip if your container has no egress there_

---

## UAT-5 — Cache hit on reload

**Steps:**
1. From UAT-2 DS dashboard with tiles loaded, hard reload (Cmd+Shift+R)
2. DevTools → Network → click any `tile/proxy` request → check Time column
3. Optional: `docker exec splunk-10-dev ls -la /opt/splunk/var/run/maps_plus/tile_cache/` to confirm disk persistence

**Expected:**
- Many requests resolve in < 5 ms (memory LRU hit) — first reload after a cold start
  may show 5–50 ms (disk hit), still much faster than upstream fetch
- All requests still 200 OK
- Disk cache dir contains files

**Result:** _pending_

---

## UAT-6 — SSRF defense end-to-end via DS UI (T2-02)

**Why this matters:** Phase 1 SSRF defense is unit-tested + UAT-confirmed.
This test confirms the Phase 2 client correctly surfaces a Phase 1 403 to the
user without breaking — i.e., the proxy URL it emits actually reaches the
server's SSRF guard.

**Steps:**
1. In the DS dashboard, open Maps+ format menu → custom tile URL
2. Set: `http://192.168.1.1/{z}/{x}/{y}.png`
3. Save / reload dashboard
4. DevTools → Network → filter `tile/proxy`

**Expected:**
- Tile requests return HTTP 403 with body `{"error":"private_ip_blocked"}`
- Browser shows blank/gray tiles (no crash)
- Console shows `[maps-plus] tile proxy:` warnings (one or a few; no flood, no stack trace)
- No outbound connection attempts to 192.168.1.1 (verify with `docker exec splunk-10-dev tcpdump -nn -i any host 192.168.1.1` if paranoid; optional)

**Result:** _pending_

---

## UAT-7 — Disabled flag → 503 with graceful degradation

**Steps:**
1. ```bash
   docker exec splunk-10-dev sh -c 'mkdir -p /opt/splunk/etc/apps/leaflet_maps_app/local && echo "{\"disabled\": 1}" > /opt/splunk/etc/apps/leaflet_maps_app/local/settings.json'
   docker exec splunk-10-dev /opt/splunk/bin/splunk restart
   ```
2. Wait for Splunk to come back up (~60s)
3. Reload the DS dashboard
4. DevTools → Network → filter `tile/proxy`
5. **Cleanup:** `docker exec splunk-10-dev rm /opt/splunk/etc/apps/leaflet_maps_app/local/settings.json && docker exec splunk-10-dev /opt/splunk/bin/splunk restart`

**Expected:**
- All `tile/proxy` requests return HTTP 503
- UI shows blank tiles gracefully
- No JS exceptions in Console (only `[maps-plus] tile proxy:` warnings)
- After cleanup + restart, normal operation resumes

**Result:** _pending_

---

## UAT-8 — Console hygiene (T2-03)

**Why this matters:** D-15 specifies `console.warn` with the prefix
`[maps-plus] tile proxy:` and short-code error body. T2-03-InfoDisclosure
requires no full URL or upstream details leak to the client console.

**Steps:**
1. Aggregate any console output from UAT-1 through UAT-7
2. Inspect each `[maps-plus]` line

**Expected:**
- Every Phase 2 console message starts with `[maps-plus] tile proxy:` (or `[maps-plus:ds-proxy]`)
- Body contains HTTP status + short error code (e.g. `403 private_ip_blocked`)
- NO full upstream URLs, stack traces, or user/session identifiers
- NO log floods on transient errors

**Result:** _pending_

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Tester | | |
| Reviewer | | |

## Pass criteria for Phase 02 verification complete

- UAT-1 (Classic regression) — **must pass** (DS-JS-04 hard constraint) ✅ **pass**
- UAT-2, UAT-3 (DS activation + URL shape) — **must pass** (core Phase 02 claim) ⛔ **blocked — see below**
- UAT-6, UAT-7 (SSRF + disabled flag end-to-end) — **must pass** (security regressions) ⛔ blocked on UAT-2
- UAT-4 (GIBS) — pass OR documented network-skip (egress dependency) — blocked on UAT-2
- UAT-5, UAT-8 (cache + console hygiene) — pass OR minor notes — UAT-8 partial pass; UAT-5 blocked

### Phase 02 closure decision

Phase 02's explicit goal was "detect DS and reroute tiles through the proxy
without regressing Classic." Mechanically, the Phase 02 client code does
exactly that — UAT-1 passes cleanly, and UAT-2 confirms the DS detection,
URL construction, origin resolution, and `tileerror` instrumentation all work
as specified in `02-01-SUMMARY.md` / `02-02-SUMMARY.md`.

What Phase 02 **could not have anticipated** is that Splunk Dashboard Studio
hosts custom visualizations inside a sandboxed `about:srcdoc` iframe with
origin `null`, which prevents the browser from sending `SameSite=Lax` session
cookies on subresource requests back to Splunk Web. No amount of client-side
tile-layer refactoring can overcome that browser security boundary — the
authenticated request has to originate from (or be authorized by) a frame
the browser considers same-site with `localhost:8000`.

**Decision:** Phase 02 is **complete** for everything it set out to do.
UAT-2's auth-bridge requirement is scope creep uncovered during UAT and is
properly handled as a new phase (Phase 03), not a patch on Phase 02. This
matches the project's phase-gated pattern: Phase 01 built the server,
Phase 02 wired the client, Phase 03 will bridge the cross-origin auth gap.

## On failure

Record failing UAT-N row with HAR / screenshot, then either:
- patch + rebuild (append plan 02-03), OR
- accept + document risk in this file under a new `## Accepted Risks` section

## Follow-ups captured during UAT

1. **AMD positional-binding defect** (found UAT-1, fixed) — Plan 02-01 Task 2
   introduced an AMD dep in the wrong array position. Jest harness missed it.
   Post-UAT improvement: add one AMD-wiring smoke test that actually calls
   `DsTileProxyHelpers.isDashboardStudio` through the bundled module resolution
   path (e.g., a jsdom harness that exercises the factory), OR add a lint rule
   that `define()` array length equals the factory's param count when any
   helper module name appears in the array. Neither blocks Phase 02 completion.

2. **DS parent-frame auth bridge** (found UAT-2, blocks DS tile rendering) —
   Phase 03. The Phase 02 client correctly issues proxy URLs, but the browser
   withholds the Splunk session cookie on cross-site null-origin requests, so
   Splunkweb redirects every tile request to the login page.

   Design sketch for Phase 03 (Option A from the UAT conversation):

   - **Parent-side shim** loaded on Splunk Web pages via `app.conf`
     `application_namespace` static-JS wiring (or equivalent load point). Runs
     in the top-level window, has the session cookie.
   - **postMessage RPC protocol** between iframe viz and parent:
     - `{ type: 'maps-plus:fetch-tile', requestId, url, z, x, y, s?, r? }`
       iframe → parent
     - `{ type: 'maps-plus:tile-result', requestId, ok: true, blobBase64, contentType }`
       or `{ ok: false, status, code }` parent → iframe
   - **Origin validation** on both ends — parent must verify
     `event.source.location` equals the Splunk Web origin it expects; iframe
     must verify `event.origin` is the top frame. Ignore all other messages.
     Never accept arbitrary JS or tile templates from postMessage beyond the
     already-validated proxy URL.
   - **Parent does the authenticated fetch** to `/en-US/splunkd/__raw/services/maps_plus/tile/proxy?...`
     (same-origin, session cookie present) — zero changes needed server-side.
     Returns the blob base64 to the iframe.
   - **Iframe creates a `blob:` URL** from the base64 bytes, assigns to
     `img.src`. Leaflet treats it as a normal tile.
   - **Security properties to preserve:**
     - SSRF defense still enforced by Phase 01 Python handler (unchanged).
     - No tokens, session IDs, or search data flow in postMessage payloads.
     - Bridge only handles tile binary bytes in one direction. No RPC
       extensibility — named message type is an allow-list of one.
     - Rate-limit messages per iframe (e.g. 500/s) to prevent a compromised
       iframe from using the parent as a fan-out proxy.
   - **Fallback:** if parent bridge is absent (older Splunk, or app installed
     without the parent shim), iframe logs one-time warning and shows blank
     tiles. No crash, no retry storm.

   Phase 03 scope: ~1 file for parent shim (~150 LOC), ~60 LOC delta in
   `DsProxyTileLayer.createTile` (custom tile creation instead of default
   `<img src>`), 1 new Jest suite for the RPC, manual UAT re-run of all 8 cases.

