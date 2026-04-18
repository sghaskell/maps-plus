---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02
current_plan: complete
status: Phase 02 complete — UAT-1 pass, UAT-2 blocked on cross-origin cookie (null-origin srcdoc iframe). Phase 03 (DS parent-frame auth bridge) required for DS tile rendering. See .planning/phases/02-maps-plus-js-integration-testing/02-UAT.md for full details.
last_updated: "2026-04-17T00:00:00.000Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
  percent: 66
---

# Project State — Maps+ Dashboard Studio Compatibility

## Status: Phase 02 — COMPLETE; Phase 03 REQUIRED for DS tile rendering

- **Last updated:** 2026-04-17 (Phase 02 UAT complete — UAT-1 pass, UAT-2 blocked on cross-origin cookie)
- **Current milestone:** 1 (Dashboard Studio Raster Tile Proxy) — in progress, awaiting Phase 03
- **Current phase:** 02 complete (client wiring + 4 in-UAT defects fixed + detection hardened). Next: Phase 03 (parent-frame auth bridge).
- **Workflow mode:** interactive (auto_advance enabled)
- **Git workflow:** feature branch `feature/dashboard-studio-tile-proxy-v2`

## Phase Progress

| Phase | Status | Plans Completed | Notes |
|-------|--------|-----------------|-------|
| 1: REST Proxy Backend + Routing | Execution + Secure Complete | 3/3 | All plans complete: REST handler (01-01) + restmap/packaging (01-02) + DiskCache (01-03). 77 unit tests pass. UAT 8/8. 01-SECURITY.md closed 24/24 threats. |
| 2: Maps+ JS Integration + Testing | Complete (UAT-1 pass, UAT-2 blocked on external boundary) | 2/2 | All Phase 02 code goals met. 4 defects found and fixed during UAT (AMD positional-binding; sync `window.require`; `location.origin='null'` in srcdoc; jquery.i18n fatal promise rejection; DS detection widened to cover `about:srcdoc`). 24/24 Jest + 77/77 Python tests pass. UAT-2 uncovered that the browser withholds `SameSite=Lax` session cookies on null-origin subresource requests — not solvable in client code alone. See `02-UAT.md` for full diagnosis. |
| 3: DS Parent-Frame Auth Bridge | Planned | 0/? | postMessage RPC between DS iframe and top-level window to proxy authenticated tile fetches. Design sketch in `02-UAT.md § Follow-ups`. Required for UAT-2..UAT-7 to complete. |

## Milestone Progress

| Milestone | Status | Phases Complete | Notes |
|-----------|--------|-----------------|-------|
| 1: Dashboard Studio Raster Tile Proxy | Not Started | 0/2 | First milestone |
| 2: Vector Tiles + KML Proxy | Planned | — | Future work |

## Pending Items

| Type | Description | Reference |
|------|-------------|-----------|
| Plan to create | Phase 1 plans (3 plans) | ROADMAP.md Phase 1 |
| Git workflow | Use gitflow — feature branch from develop, PR merge back | STATE.md note |
| Decision pending | Confirm interactive planning workflow before execution | This file |
| Testing strategy | Need test approach for Python REST handler + JS integration | TESTING.md notes |

## Artifacts Created

| Artifact | Date | Description |
|----------|------|-------------|
| PROJECT.md | 2026-04-16 | Project context, requirements, scope |
| REQUIREMENTS.md | 2026-04-16 | Detailed requirement IDs and priorities |
| ROADMAP.md | 2026-04-16 | Phase structure and plan outline |
| OFFLINE-TILES-DASHBOARD-STUDIO-SUPPORT.md | (original) | Qwen3.6 feature plan — reviewed, scoped down |
| 01-01-SUMMARY.md | 2026-04-17 | Plan 01-01 — Python REST handler + 49 unit tests |
| 01-02-SUMMARY.md | 2026-04-17 | Plan 01-02 — restmap.conf + settings.json + packaging |
| 01-03-SUMMARY.md | 2026-04-17 | Plan 01-03 — DiskCache (atomic writes, LRU prune, Cloud fallback) + 22 new tests (71 total) |
| 01-SECURITY.md | 2026-04-17 | Phase 01 threat verification — 24/24 closed, ASVS L2, 3 accepted risks documented |

## Decisions

- **Custom length-prefixed binary cache format (Plan 01-03):** 4-byte magic header `MP01` + 4-byte BE length-prefixed content-type + 4-byte BE length-prefixed cache-control + raw bytes. Rejected `pickle` due to RCE risk (T3-06) if an attacker could write to the cache dir.
- **Cache `realpath(cache_dir)` once at `__init__` (Plan 01-03):** Under Windows concurrency, `os.path.realpath` can return the `\\?\` UNC long-path form, which broke the prefix check. Cached anchor + UNC-prefix normalization resolves it without weakening the S-10 guard.
- **Two-tier write-through on miss (Plan 01-03):** Handler writes to memory LRU always, disk best-effort (exceptions logged + swallowed). User response never blocked by disk failure (T3-05 safety net).
- **HTTP 403 vs 400 status-code split (UAT Test 4 fix):** SSRF policy rejections (`host_not_allowed`, `invalid_ip`, `private_ip_blocked`) return 403 per RFC 9110 §15.5.4; client-malformed codes (`scheme_not_https`, `invalid_chars`, `dns_failed`) remain 400. The split is encoded as `_SSRF_POLICY_CODES` set in `bin/tile_proxy.py` handle_GET step 5; lock-tested by three new integration tests in `tests/test_tile_proxy.py`.

## Next Action

**Immediate:** Clear agent context, then begin Phase 03 planning (DS parent-frame
auth bridge). Phase 03 design sketch lives in
`.planning/phases/02-maps-plus-js-integration-testing/02-UAT.md § Follow-ups
captured during UAT` — use that as the starting input to `/gsd-plan 3`.

**Blocked until Phase 03 lands:**
- UAT-2..UAT-7 re-run against DS dashboards (tile rendering, SSRF end-to-end,
  disabled flag, cache hit, GIBS)
- `/gsd-verify-work 2` full replay
- `/gsd-secure-phase 2` (automated unit tests already cover T2-01..T2-06;
  secure-phase replay is optional)
- `/gsd-complete-milestone 1`

**Phase 02 work committed to `feature/dashboard-studio-tile-proxy-v2`:**
- Plan 02-01 (DS detection + `DsProxyTileLayer`) — committed
- Plan 02-02 (Jest harness + bundle rebuild + 02-UAT.md + matrix) — committed
- 4 in-UAT defect fixes (AMD wiring, `_detectSplunkOrigin`, i18n DS-skip,
  widened DS detection) — about to commit alongside this STATE update

## Accumulated Context

### Roadmap Evolution

- **Phase 3 added (2026-04-17): DS parent-frame auth bridge.** Discovered during
  Phase 02 UAT-2. The null-origin `about:srcdoc` iframe that Splunk Dashboard
  Studio uses for custom visualizations causes the browser to withhold Splunk's
  `SameSite=Lax` session cookie on cross-site subresource requests — every
  `/en-US/splunkd/__raw/services/maps_plus/tile/proxy?...` request from Leaflet
  arrives cookieless and Splunkweb redirects to login. Not solvable in client
  code alone; requires a top-level-window shim that bridges tile fetches over
  `postMessage`. Design sketch captured in
  `.planning/phases/02-maps-plus-js-integration-testing/02-UAT.md § Follow-ups`;
  6 new requirement IDs (DS-AUTH-01..DS-AUTH-06) added to REQUIREMENTS.md; 2
  plans anticipated (`03-01` parent shim + load-point wiring, `03-02` iframe
  override + Jest RPC harness + UAT re-run). Phase 02 is closed complete —
  the bridge is scope that could not have been anticipated before UAT revealed
  the browser boundary.

## UAT Summary (Phase 01)

| # | Test | Result |
|---|------|--------|
| 1 | Release tarball contents | pass |
| 2 | Splunk app install | pass |
| 3 | Endpoint returns a tile | pass (fixed via 13fd7cd) |
| 4 | SSRF defense blocks private IP | pass (fixed — 400→403 for policy rejections) |
| 5 | SSRF defense blocks non-allowlisted host | pass (re-verified at 403) |
| 6 | Two-tier cache — memory hit | pass |
| 7 | Disk cache persists across Splunk restart | pass |
| 8 | Disabled flag returns 503 | pass |
