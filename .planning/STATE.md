---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03
status: Phase 03 paused mid-Plan 03-01; Step 1 + R3 + R2 + DS-engineering-recommendations-writeup complete; R3 + R2 both collapsed (R1 + R4 pre-collapsed by R2 evidence); R2 follow-up discovered DS already ships a FETCH-PROXY mechanism that Maps+ could use with a ~30 LOC DS-side change; Step 5 (re-lock 03-CONTEXT.md) is the live work item; user decision on options A/B/C/D required
last_updated: "2026-04-19T00:30:00.000Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 7
  completed_plans: 5
  percent: 71
---

# Project State — Maps+ Dashboard Studio Compatibility

## Status: Phase 03 — PAUSED at Step 5 entry; Steps 1 + 2 (R3) + 3 (R2) + DS-engineering writeup all complete; R3 collapsed per spec, R2 collapsed per architecture+empirical evidence, R1 + R4 pre-collapsed by R2; R2 follow-up discovered DS already ships a FETCH-PROXY mechanism (just needs ~30 LOC change to credential-handling) — Phase 3 full-DS-parity goal unreachable from app space alone but tractable with DS-engineering cooperation — needs user decision on options A/B/C/D before re-lock

- **Last updated:** 2026-04-19 (fifth pause — R2 complete + DS-engineering recommendations document written; full evidence trail in `03-RESEARCH-ADDENDUM.md` § R2 plus its FETCH-PROXY follow-up; concrete DS-side fix proposal in `03-DS-ENGINEERING-RECOMMENDATIONS.md`; user decision required on options A/B/C/D documented at end of § R2 follow-up)
- **Current milestone:** 1 (Dashboard Studio Raster Tile Proxy) — in progress, blocked on Phase 03 research wave
- **Current phase:** 03
- **Workflow mode:** interactive (auto_advance enabled)
- **Git workflow:** feature branch `feature/dashboard-studio-tile-proxy-v2`

## Phase Progress

| Phase | Status | Plans Completed | Notes |
|-------|--------|-----------------|-------|
| 1: REST Proxy Backend + Routing | Execution + Secure Complete | 3/3 | All plans complete: REST handler (01-01) + restmap/packaging (01-02) + DiskCache (01-03). 77 unit tests pass. UAT 8/8. 01-SECURITY.md closed 24/24 threats. |
| 2: Maps+ JS Integration + Testing | Complete (UAT-1 pass, UAT-2 blocked on external boundary) | 2/2 | All Phase 02 code goals met. 4 defects found and fixed during UAT (AMD positional-binding; sync `window.require`; `location.origin='null'` in srcdoc; jquery.i18n fatal promise rejection; DS detection widened to cover `about:srcdoc`). 24/24 Jest + 77/77 Python tests pass. UAT-2 uncovered that the browser withholds `SameSite=Lax` session cookies on null-origin subresource requests — not solvable in client code alone. See `02-UAT.md` for full diagnosis. |
| 3: DS Parent-Frame Auth Bridge | Plan 03-01 PAUSED at Step 5 entry — Steps 1 + 2 (R3) + 3 (R2) + DS-engineering writeup complete; R1 + R4 pre-collapsed | 0/2 | **Step 1 (code scan)** complete — see `03-CODE-SCAN.md`. **R3 (iframe self-install)** collapsed per spec — see `03-RESEARCH-ADDENDUM.md` § R3. **R2 (DS v2 extension surface)** collapsed per architectural + empirical evidence — see `03-RESEARCH-ADDENDUM.md` § R2 (six vectors enumerated and closed; rendered-HTML capture confirms zero scripts from `leaflet_maps_app` on DS pages). **R2 follow-up:** while writing DS-engineering recommendations, discovered that DS already ships a complete `FETCH-PROXY-REQUEST` / `FETCH-PROXY-RESPONSE` postMessage mechanism in `ds-iframe-studio.js` + `chunks/chunk-DT4FOOLP.js` (functions `da`/`fa`/`pa`/`Dn`). The mechanism intercepts iframe-side `window.fetch`, relays same-origin requests to the parent, and reconstructs a `Response`. **The reason it doesn't fix Maps+ today is one helper function: `pa()` unconditionally strips credentials from every relayed request.** A ~30 LOC change (per-viz credential allow-list driven by `allow_authenticated_proxy` + `authenticated_proxy_urls` fields in `visualizations.conf`) makes Maps+ work end-to-end. Concrete code-level proposal in `03-DS-ENGINEERING-RECOMMENDATIONS.md`. **R1 + R4 pre-collapsed** by R2 evidence (no separate empirical tests needed). **Phase 3's full-DS-parity goal remains unreachable from app space alone**, but is now tractable with DS-engineering cooperation. Four forward options: (A) ship a Splunk-Web boot-path patch (fragile, not recommended), (B) accept partial DS support documented as a manual operator step (workable but high friction), (C) declare DS unsupported pending DS-side change (was the recommendation; still viable), (D) submit the DS-engineering recommendations document to Splunk and ship C as the interim release; once DS picks up the change, Maps+ adds 2 lines to `visualizations.conf` and DS support becomes automatic. User decision required before Step 5 re-lock can proceed. |

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
| 03-CODE-SCAN.md | 2026-04-18 | Phase 03 Step 1 — bridge URL allow-list / regex / CSS sharp-edge analysis |
| 03-RESEARCH-ADDENDUM.md | 2026-04-18 (R3) + 2026-04-19 (R2 + follow-up + R1/R4 collapse notes) | Path B research wave outputs (R3 + R2 + R2 FETCH-PROXY follow-up + R1/R4 pre-collapse) |
| 03-DS-ENGINEERING-RECOMMENDATIONS.md | 2026-04-19 | Concrete code-level fix recommendations to Splunk DS engineers; ~30 LOC R1 + ~150 LOC R2 + ~200 LOC R3 |

## Decisions

- **Custom length-prefixed binary cache format (Plan 01-03):** 4-byte magic header `MP01` + 4-byte BE length-prefixed content-type + 4-byte BE length-prefixed cache-control + raw bytes. Rejected `pickle` due to RCE risk (T3-06) if an attacker could write to the cache dir.
- **Cache `realpath(cache_dir)` once at `__init__` (Plan 01-03):** Under Windows concurrency, `os.path.realpath` can return the `\\?\` UNC long-path form, which broke the prefix check. Cached anchor + UNC-prefix normalization resolves it without weakening the S-10 guard.
- **Two-tier write-through on miss (Plan 01-03):** Handler writes to memory LRU always, disk best-effort (exceptions logged + swallowed). User response never blocked by disk failure (T3-05 safety net).
- **HTTP 403 vs 400 status-code split (UAT Test 4 fix):** SSRF policy rejections (`host_not_allowed`, `invalid_ip`, `private_ip_blocked`) return 403 per RFC 9110 §15.5.4; client-malformed codes (`scheme_not_https`, `invalid_chars`, `dns_failed`) remain 400. The split is encoded as `_SSRF_POLICY_CODES` set in `bin/tile_proxy.py` handle_GET step 5; lock-tested by three new integration tests in `tests/test_tile_proxy.py`.

## Next Action

**Immediate (next session, with user):** Surface the R2 verdict and the **four** forward options (A / B / C / D) documented at end of `03-RESEARCH-ADDENDUM.md` § R2 (and the FETCH-PROXY follow-up immediately after). **User decision required before Step 5 (re-lock) can proceed.** Recommended option is now **D** (ship C as the interim user-facing behavior in this release AND submit `03-DS-ENGINEERING-RECOMMENDATIONS.md` to Splunk; once DS ships the ~30 LOC fix, upgrade Maps+ in a future release with two new lines in `visualizations.conf`).

Once the user picks A / B / C / D, Step 5 (re-lock `03-CONTEXT.md` § Locked Decisions) becomes mechanical:
- Under **D**: same as C for this release (graceful-degradation plan only); plus an out-of-band tracking item to monitor DS releases for the FETCH-PROXY credential change and a future micro-phase to add the 2 visualizations.conf lines + UAT once it lands.
- Under **C**: D-NN-1 reduces to "no bridge — display unsupported message inside iframe"; D-03/D-04/D-NN-3 become moot; Plans 03-01 and 03-02 collapse to a small "graceful degradation" plan (visualization.js detects `Origin: null` + opaque-origin and renders a clear in-product message).
- Under **B**: D-NN-1 reduces to "operator-installed bridge"; need new plans for operator script + verification + documentation; D-03/D-04/D-NN-3 stay as locked but with operator-install caveat.
- Under **A**: D-NN-1 stays as locked; need new plan for installer-patch of `splunk-dashboard-studio/appserver/templates/dashboard.html`; need re-test cadence tied to DS app version bumps.

**Path B research wave status:**

| Step | Status | Output |
|---|---|---|
| 1 — Code scan | **Complete** | `03-CODE-SCAN.md` |
| 2 — R3: iframe → `window.top` bridge install | **Complete — collapsed per spec** | `03-RESEARCH-ADDENDUM.md` § R3 |
| 3 — R2: Splunk 10.x DS v2 extension surface | **Complete — collapsed (architectural + empirical)** | `03-RESEARCH-ADDENDUM.md` § R2 |
| 3a — DS-engineering recommendations writeup (user-requested side artifact) | **Complete** — discovered DS ships FETCH-PROXY mechanism; documented ~30 LOC fix to credential-stripping plus optional R2/R3 enhancements | `03-DS-ENGINEERING-RECOMMENDATIONS.md` + R2 follow-up section in `03-RESEARCH-ADDENDUM.md` |
| 4 — R1 + R4: namespace + nav XML tests | **Pre-collapsed by R2 evidence** | `03-RESEARCH-ADDENDUM.md` § R1, § R4 |
| 5 — Re-lock `03-CONTEXT.md` | **Awaiting user decision on options A / B / C / D** | (Step 5 work begins after user picks one) |
| 6 — Plans 03-01 + 03-02 update or rewrite | Pending re-lock | — |

**R2 central question (now answered):** Does Splunk 10.x DS v2 expose any extension point that runs in the top frame, before the custom-visualization iframe is constructed? **No.** Six vectors enumerated and closed in `03-RESEARCH-ADDENDUM.md` § R2; rendered-HTML ground truth captured at `/tmp/ds-rendered.html` confirms zero per-app scripts loaded by DS pages.

**R2 follow-up (during the DS-engineering writeup):** discovered that DS ships a complete `FETCH-PROXY-REQUEST` / `FETCH-PROXY-RESPONSE` mechanism in `ds-iframe-studio.js` + `chunks/chunk-DT4FOOLP.js`. The mechanism strips credentials unconditionally (in helper `pa()`) which is why it doesn't fix Maps+ today. A ~30 LOC change makes Maps+ work end-to-end. Concrete proposal in `03-DS-ENGINEERING-RECOMMENDATIONS.md`. This adds **option D** (ship C as the interim release; submit recommendations to Splunk; add DS support in a future micro-phase once their fix lands).

**Phase 3's stated goal is unreachable from app space alone in this release** regardless of which option is chosen — the DS-side change cannot be shipped by us. **The four forward options (A/B/C/D) at end of § R2 + R2 follow-up are the only paths.** Recommendation now is **D**.

**Blocked until Phase 03 lands:**

- UAT-2..UAT-7 re-run against DS dashboards (tile rendering, SSRF end-to-end,
  disabled flag, cache hit, GIBS, AND now app-static asset loads)
- `/gsd-verify-work 2` full replay
- `/gsd-secure-phase 2` (automated unit tests already cover T2-01..T2-06;
  secure-phase replay is optional)
- `/gsd-complete-milestone 1`

**Splunk version floor:** 10.x (confirmed by user 2026-04-18). 9.x compatibility
deferred until 10.x bridge ships.

**Bridge scope (corrected 2026-04-18):** tile-proxy traffic AND app-static asset
loads under `/static/app/leaflet_maps_app/...`. User has empirically observed
CORS/cookie failures on both. The tile-only design locked in `03-CONTEXT.md`
must be re-locked around the broader scope before any production code is written.

**Stale artifact removed:** `.planning/HANDOFF.json` (was generated when phase
was at "context_gathered_ready_to_plan"; planning + execution have advanced
past that and the file became misleading on resume). Authoritative resume
sources are now this STATE.md + the phase-03 `.continue-here.md`.

**Phase 02 work committed to `feature/dashboard-studio-tile-proxy-v2`:**

- Plan 02-01 (DS detection + `DsProxyTileLayer`) — committed
- Plan 02-02 (Jest harness + bundle rebuild + 02-UAT.md + matrix) — committed
- 4 in-UAT defect fixes (AMD wiring, `_detectSplunkOrigin`, i18n DS-skip,
  widened DS detection) — committed (commit `7714728` and predecessors)

**Phase 03 work currently uncommitted on the same branch:**

- `default/app.conf` — load-matrix scaffold + per-mechanism comments (conclusion at the bottom is wrong; will be corrected before any release commit but does not block R2)
- `appserver/static/parent-auth-bridge.js` — probe stub (kept; needed if R2 produces partial result requiring R1)
- `appserver/static/dashboard.js` — probe loader (kept; same reason)
- `default/data/ui/views/phase03_probe.xml` — probe SimpleXML dashboard (kept as manual-test fixture)
- `.planning/STATE.md` + `.planning/phases/03-.../.continue-here.md` — handoff updates (this commit batch)
- `.planning/phases/03-.../03-CODE-SCAN.md` — **new** Step 1 output
- `.planning/phases/03-.../03-RESEARCH-ADDENDUM.md` — **new** R3 complete; R2/R1/R4 stubbed

**Recommended:** commit this entire batch as one atomic commit before starting R2 in the fresh session, so R2 begins from a clean working tree.

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
