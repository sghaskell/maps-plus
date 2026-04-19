---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03
status: Phase 03 paused mid-Plan 03-01; Step 1 (code scan) + R3 (iframe self-install) complete; R3 collapsed per spec; R2 (DS v2 extension surface) is the live work item
last_updated: "2026-04-18T22:00:00.000Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 7
  completed_plans: 5
  percent: 71
---

# Project State — Maps+ Dashboard Studio Compatibility

## Status: Phase 03 — PAUSED mid-Plan 03-01; Step 1 + R3 complete; R3 collapsed per spec; R2 is the live work item

- **Last updated:** 2026-04-18 (third pause — Path B research wave Step 1 + R3 complete; handoff to fresh-context Opus 4.7 1M Extra High Thinking session for R2 — see `.planning/phases/03-ds-parent-frame-auth-bridge/.continue-here.md`)
- **Current milestone:** 1 (Dashboard Studio Raster Tile Proxy) — in progress, blocked on Phase 03 research wave
- **Current phase:** 03
- **Workflow mode:** interactive (auto_advance enabled)
- **Git workflow:** feature branch `feature/dashboard-studio-tile-proxy-v2`

## Phase Progress

| Phase | Status | Plans Completed | Notes |
|-------|--------|-----------------|-------|
| 1: REST Proxy Backend + Routing | Execution + Secure Complete | 3/3 | All plans complete: REST handler (01-01) + restmap/packaging (01-02) + DiskCache (01-03). 77 unit tests pass. UAT 8/8. 01-SECURITY.md closed 24/24 threats. |
| 2: Maps+ JS Integration + Testing | Complete (UAT-1 pass, UAT-2 blocked on external boundary) | 2/2 | All Phase 02 code goals met. 4 defects found and fixed during UAT (AMD positional-binding; sync `window.require`; `location.origin='null'` in srcdoc; jquery.i18n fatal promise rejection; DS detection widened to cover `about:srcdoc`). 24/24 Jest + 77/77 Python tests pass. UAT-2 uncovered that the browser withholds `SameSite=Lax` session cookies on null-origin subresource requests — not solvable in client code alone. See `02-UAT.md` for full diagnosis. |
| 3: DS Parent-Frame Auth Bridge | Plan 03-01 PAUSED — Path B research wave in progress (Step 1 + R3 done; R2 next) | 0/2 | Plan 03-01 W0 conclusion ("SimpleXML-only") REOPENED in second pause. Bridge scope EXPANDED to tile + app-static. **Step 1 (code scan)** complete: see `03-CODE-SCAN.md` — two URL-shape regex categories required (tile proxy + app static) with airtight path-traversal protection; CSS-engine `url(...)` references in `contrib/css/*.css` are a "sharp edge" requiring CSS-text rewriting since JS cannot intercept them. **R3 (iframe self-install)** complete and **collapsed per spec** — see `03-RESEARCH-ADDENDUM.md` § R3: HTML §7.1.1 same-origin algorithm + §7.2.1.3.1 cross-origin Window safe-list rule out `window.top.document` access from opaque-`null` DS iframe; only legitimate cross-frame channel is `postMessage` which requires pre-installed listener. Empirical test skipped — spec unambiguous, current browser behavior uniform, Phase 02 UAT-2 already observed downstream consequence. **R2 (DS v2 extension surface) is now load-bearing** — must enumerate any top-frame hook that runs before the custom-viz iframe is constructed; if R2 also collapses, Phase 3's full-DS-parity goal is unreachable from app space alone. Recommended next-session model: Opus 4.7 1M Extra High Thinking. See `.planning/phases/03-ds-parent-frame-auth-bridge/.continue-here.md` for full handoff including R2 candidate vectors and evidence sources. |

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

**Immediate (next session, fresh context):** `/clear`, switch model to **Opus 4.7 1M Extra High Thinking**, then `/gsd-resume-work`.
Resume reads `.planning/phases/03-ds-parent-frame-auth-bridge/.continue-here.md` which contains the full updated handoff with R3 verdict, R2 candidate vectors, evidence-source priority, and post-R2 routing logic. Then reads `03-RESEARCH-ADDENDUM.md` § R3 (accept verdict — spec citations are airtight) and `03-CODE-SCAN.md` (Q1 CSS sharp edge, Q3 top-frame hook = R2's central question).

**Path B research wave status:**

| Step | Status | Output |
|---|---|---|
| 1 — Code scan | **Complete** | `03-CODE-SCAN.md` |
| 2 — R3: iframe → `window.top` bridge install | **Complete — collapsed per spec** | `03-RESEARCH-ADDENDUM.md` § R3 |
| 3 — R2: Splunk 10.x DS v2 extension surface | **Live work item (now load-bearing)** | Stub in `03-RESEARCH-ADDENDUM.md` § R2 |
| 4 — R1 + R4: namespace + nav XML tests | Conditional on R2 partial result | (handoff to user when reached) |
| 5 — Re-lock `03-CONTEXT.md` (D-NN-3, D-NN-2, D-04, D-NN-5, D-03, D-01) | Pending R2 | — |
| 6 — Plans 03-01 + 03-02 update or rewrite | Pending re-lock | — |

**R2 central question:** Does Splunk 10.x DS v2 expose any extension point that runs in the top frame, **before** the custom-visualization iframe is constructed? Candidate vectors enumerated in `.continue-here.md` (`appserver/templates/*` overrides, DS module lifecycle hooks, `viz.json` extension keys, `setup.xml`, Splunk Web pre-render hooks, Splunkbase pattern-mining, side-quest sandbox attribute confirmation). Evidence sources in priority order: Splunk Web JS bundle in-container > official docs > Splunkbase apps > community threads > public splunk-web mirror.

**If R2 collapses too:** Phase 3's stated goal (full DS parity from app space alone) is unreachable. Pause and bring decision back to user before proceeding to Step 5.

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
