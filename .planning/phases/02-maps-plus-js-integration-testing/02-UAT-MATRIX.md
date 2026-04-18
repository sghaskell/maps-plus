---
phase: 02-maps-plus-js-integration-testing
uat_version: 1
created: 2026-04-17
target_app_version: 4.6.1
---

# Phase 02 — Manual UAT Matrix

Exercises the Dashboard Studio (DS) tile proxy end-to-end across Classic
vs DS runtimes, the 9 bundled tile providers, and 4 high-risk edge cases.
Intended to be run by a human against a live Splunk instance with the
Phase 1 backend already deployed and the rebuilt `visualization.js` in
place.

Each test row has:
- **ID** — stable identifier for referencing in the phase SUMMARY
- **Steps** — exact click-through
- **Expected** — what "pass" looks like
- **Result** — `pass` / `fail` / `n/a`, filled in by the tester
- **Notes** — any screenshots, deviations, or follow-ups

---

## Environment

- **Splunk version:** (fill in, e.g. 9.3.2)
- **OS:** (fill in)
- **Browser:** Chrome (primary) + Firefox (secondary) — DevTools Network
  panel open for every test
- **Maps+ app version:** 4.6.1 (Phase 1 + Phase 2 integrated)
- **Tile proxy disk cache:** enabled (default) — clear
  `var/run/maps_plus/tile_cache/` before starting
- **Network posture:** direct egress to tile CDNs (no intermediary proxy),
  otherwise note it

---

## Pre-flight (must all pass before starting Section 1)

| ID | Check | How to verify | Expected |
|----|-------|---------------|----------|
| PF-1 | App installed | `splunk list app leaflet_maps_app` | shows version 4.6.1 |
| PF-2 | REST endpoint reachable | `curl -k "https://$HOST/en-US/splunkd/__raw/services/maps_plus/tile/proxy?url=https://tile.openstreetmap.org/{z}/{x}/{y}.png&z=1&x=0&y=0" -o /tmp/t.png` | HTTP 200, file is a valid PNG, `file /tmp/t.png` confirms |
| PF-3 | Python unit tests pass | `cd /path/to/app && ./run_tests.sh` | 77/77 pass (74 baseline + 3 from Phase 1 Plan 01-03) |
| PF-4 | JS unit tests pass | `cd appserver/static/visualizations/maps-plus && npm test` | 20/20 pass |
| PF-5 | Bundle up-to-date | `git status appserver/static/visualizations/maps-plus/visualization.js` | clean (committed in 02-02 Task 3) |

---

## Section 1 — Classic Splunk (regression; DS proxy MUST NOT activate)

**Setup:** Open any existing Classic dashboard that embeds a Maps+ viz
(e.g. `default/data/ui/views/maps_plus_basic_markers.xml`).

| ID | Test | Steps | Expected | Result | Notes |
|----|------|-------|----------|--------|-------|
| C-1 | No proxy requests | Load dashboard with DevTools Network panel filtered to `/maps_plus/tile/proxy` | **0** requests to the proxy route; tile requests go directly to the configured CDN (e.g. `*.basemaps.cartocdn.com`) | | |
| C-2 | Tiles render | Pan and zoom the map | All tiles render without gaps, console clean | | |
| C-3 | No console warnings | Keep DevTools console open during C-1/C-2 | No `[maps-plus:ds-proxy]` lines | | |
| C-4 | Bundle integrity | DevTools > Sources > `visualization.js`, search for `__SPLUNK_DASHBOARD_STUDIO__` | exactly 1 match (detection site) | | |

---

## Section 2 — Dashboard Studio (proxy MUST activate)

**Setup:** Create a new Dashboard Studio dashboard. Add a Maps+ viz block
with the default OSM basemap. Confirm
`window.__SPLUNK_DASHBOARD_STUDIO__` is truthy in DevTools console before
running tests.

| ID | Test | Steps | Expected | Result | Notes |
|----|------|-------|----------|--------|-------|
| DS-1 | Proxy activation | Load dashboard | `window.__SPLUNK_DASHBOARD_STUDIO__` is truthy; tiles load | | |
| DS-2 | All tile requests go through proxy | DevTools Network filtered to `/maps_plus/tile/proxy` | **≥1 request per visible tile**, all 200 OK | | |
| DS-3 | No direct CDN requests | Filter Network to `cartocdn`/`openstreetmap`/etc | **0 direct-to-CDN** requests (all are proxied) | | |
| DS-4 | No CORS/CSP errors | Console tab | Zero `Refused to load` / CORS errors | | |
| DS-5 | Route shape is correct | Click any tile request in Network, inspect URL | matches `^.*/services/maps_plus/tile/proxy\?url=.+&z=\d+&x=\d+&y=\d+` | | |
| DS-6 | Single encodeURIComponent | Decode the `url=` param once | Yields the exact upstream CDN URL with `{z}/{x}/{y}` still embedded (server resolves) — **not** double-encoded (`%25…`) | | |
| DS-7 | Cache-Control forwarded | Inspect response headers on any proxied tile | `Cache-Control: public, max-age=...` originating from upstream, **not** Splunk's defaults | | |
| DS-8 | Second load hits cache | Reload dashboard, check Network timing | Many requests served under 5 ms from memory LRU (or disk if memory evicted) | | |

---

## Section 3 — Provider sweep (DS mode only — all 9 OOTB providers)

**Setup:** In the Maps+ format menu, switch the basemap one at a time.
After each switch, pan/zoom once, then verify:
- ≥1 `/maps_plus/tile/proxy` request completed 200 OK
- Tile images render visibly (no gray tiles)

| ID | Provider | Result | Notes (first tile URL sample) |
|----|----------|--------|-------------------------------|
| P-1 | CartoDB Positron (Light) | | |
| P-2 | CartoDB Dark Matter | | |
| P-3 | OpenStreetMap | | |
| P-4 | Esri World Imagery | | |
| P-5 | HOT OSM | | |
| P-6 | OpenTopoMap | | |
| P-7 | GBIF Geyser (natural-earth) | | |
| P-8 | GBIF OSMBright | | |
| P-9 | NASA GIBS (BlueMarble_NextGeneration) | | Template has `{gibsLayerId}`/`{gibsTime}` — verify these are resolved **before** the `url=` param (decoded URL should not contain `{gibs…}`) |

---

## Section 4 — Edge cases

| ID | Test | Steps | Expected | Result | Notes |
|----|------|-------|----------|--------|-------|
| E-1 | Private-IP SSRF blocked | In DS dashboard, open format menu, set custom tile URL to `http://192.168.1.1/{z}/{x}/{y}.png`, reload | All tile requests return HTTP 403 with JSON `{"error": "private_ip_blocked"}`; browser shows gray tiles; no connection attempt leaves the host | | |
| E-2 | Non-allowlisted host blocked | Custom tile URL `https://evil.test/{z}/{x}/{y}.png`, reload | HTTP 403 `{"error": "host_not_allowed"}` | | |
| E-3 | Custom URL with `?` and `#` | Custom URL `https://a.tile.openstreetmap.org/{z}/{x}/{y}.png?foo=1#x`, reload | Tiles load 200 OK — the `?` and `#` must be percent-encoded inside `url=` so the proxy parses the query correctly | | |
| E-4 | Disabled flag returns 503 | Set `disabled = 1` in `$SPLUNK_HOME/etc/apps/leaflet_maps_app/local/settings.json`, restart Splunkd, reload DS dashboard | All `/maps_plus/tile/proxy` requests return 503; UI shows gray tiles gracefully; no JS errors | | |
| E-5 | Classic dashboard unaffected by DS changes | After E-4 ends, re-run C-1 through C-4 | Still all pass — Classic path never touches the proxy | | |
| E-6 | Zoom level 0 | Any DS dashboard, zoom fully out | Single tile request at `z=0&x=0&y=0`, 200 OK | | |
| E-7 | Deep zoom | Zoom to level ≥17 (where supported by provider) | Requests at `z=17` return 200 or 404 (404 is provider limit, not a bug); UI does not crash | | |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tester | | | |
| Reviewer | | | |

**Pass criteria for Phase 02 completion:** all Sections 1–2 rows pass,
Section 3 has ≥7/9 providers pass (NASA GIBS and GBIF may require
outbound network trust that is environment-specific — document any
skips), Section 4 rows E-1 through E-5 pass. E-6/E-7 are smoke only.

**On failure:** file a `.planning/phases/02-maps-plus-js-integration-testing/02-UAT-FAILURES.md`
with the failing row(s), Network HAR, and the decision point to either
patch + rebuild (append new plan 02-03) or accept + document the risk.
