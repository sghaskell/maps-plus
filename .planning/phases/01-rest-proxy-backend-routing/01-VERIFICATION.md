---
phase: 01-rest-proxy-backend-routing
verified: 2026-04-16T00:00:00Z
status: human_needed
score: 11/11 must-haves verified (automated); 3 items require in-Splunk human verification
overrides_applied: 0
human_verification:
  - test: "Install packaged app in a running Splunk instance and call GET /services/maps_plus/tile/proxy with a real allowlisted URL (e.g. tile.openstreetmap.org)"
    expected: "HTTP 200 with image/png body, x-maps-plus-cache: miss on first call, hit on second"
    why_human: "restmap.conf stanza registration and BaseRestHandler binary write behavior can only be verified inside splunkd — unittests use an offline stub"
  - test: "Verify release tarball contents: run `bash build_release.sh` then `tar -tzf leaflet_maps_app_*.tar.gz | grep -E 'bin/rest/maps_plus/tile_proxy.py|default/restmap.conf|default/settings.json'`"
    expected: "All three paths listed; NO output from grep of '.planning|tests/|run_tests.sh|CLAUDE.md'"
    why_human: "Release packaging correctness is environmental (node/git state); Plan 01-02 explicitly deferred this to a manual release-checklist step"
  - test: "Deploy to Splunk Cloud / read-only FS environment and send a tile request"
    expected: "Handler serves tile from memory cache; one INFO log 'disk_cache_disabled_readonly_fs' or 'disk_cache_disabled_permission'; no 5xx errors"
    why_human: "T3-05 Cloud fallback code path requires a real read-only filesystem to exercise end-to-end"
---

# Phase 01: REST Proxy Backend + Routing — Verification Report

**Phase Goal:** Same-origin Splunk REST endpoint that resolves, validates, fetches, caches, and streams raster tiles back to Leaflet running inside a Dashboard Studio iframe — bypassing DS CSP — with 4-layer SSRF defense, response-size cap, and two-tier (memory + optional disk) LRU caching.

**Verified:** 2026-04-16
**Status:** human_needed (all automated checks PASS; 3 items require a live Splunk instance)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REST endpoint `/services/maps_plus/tile/proxy` registered & handler exists | VERIFIED | `default/restmap.conf` `[script:maps_plus_tile_proxy]` stanza + `TileProxyHandler` class in `bin/rest/maps_plus/tile_proxy.py:760` |
| 2 | 4-layer SSRF defense (scheme, injection, host allowlist, DNS/private-IP) | VERIFIED | `_validate_url` lines 207–265; 9 tests in `TestValidateUrl` cover http-rejection, injection, disallowed host, RFC1918, metadata IP, DNS fail |
| 3 | No-redirect opener prevents redirect-based SSRF | VERIFIED | `_NoRedirectHandler` lines 347–361 overrides `http_error_301/302/303/307/308` to raise HTTPError; `_opener` built at module scope |
| 4 | Response size cap enforced at 512KB | VERIFIED | `MAX_TILE_BYTES = 524288`; `resp.read(MAX_TILE_BYTES + 1)` + len-check at line 387–389; `test_oversize_raises` and `test_upstream_oversize_returns_502` |
| 5 | In-memory LRU cache (256 entries, thread-safe) | VERIFIED | `LRUCache` lines 401–433; OrderedDict + `threading.Lock`; 6 tests in `TestLRUCache` including thread-safety smoke |
| 6 | Two-tier cache: memory → disk → upstream with L2→L1 promotion | VERIFIED | `handle_GET` steps 6, 6b, 8 at lines 804–836, 867–880; `test_disk_hit_promotes_to_memory`, `test_miss_writes_both_tiers` |
| 7 | DiskCache: atomic writes, LRU prune by mtime, path confinement, Cloud fallback | VERIFIED | `DiskCache` class lines 467–688; `tempfile.mkstemp` + `os.replace`; `_assert_within_cache_dir` with realpath + Windows UNC-prefix + case-insensitive handling; `PermissionError`/`EROFS` → `enabled=False` |
| 8 | z/x/y template substitution + input validation | VERIFIED | `_resolve_tile` lines 291–317; `_check_zxy_value` rejects injection chars + whitespace + slash; 6 tests in `TestResolveTile` |
| 9 | Packaging: bin/ shipped by deploy.sh AND build_release.sh; dev-only artifacts stripped | VERIFIED | `scripts/deploy.sh` line 24 (bin in for-dir loop) + explicit restmap/settings copy + __pycache__ strip; `build_release.sh` lines 54–77 stage + strip + fail-fast guard |
| 10 | Error responses are sanitized JSON (no upstream body/traceback leak) | VERIFIED | `_write_json_error` lines 734–744 always writes `{"error":"<short_code>"}`; every `handle_GET` branch uses it |
| 11 | 71/71 unit tests pass via `bash run_tests.sh` | VERIFIED | Executed locally: `Ran 71 tests in 4.182s — OK` |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `bin/rest/maps_plus/tile_proxy.py` | Handler + pure funcs + LRU + DiskCache | VERIFIED | 887 lines; all required symbols present |
| `bin/rest/maps_plus/__init__.py` | Package marker | VERIFIED | Exists |
| `bin/rest/__init__.py` | Package marker | VERIFIED | Exists |
| `bin/__init__.py` | Package marker | VERIFIED | Exists |
| `default/restmap.conf` | `[script:]` stanza, python3, requireAuthentication=true | VERIFIED | 17 lines, correct stanza type (NOT `[route:]`), python.version=python3, requireAuthentication=true |
| `default/settings.json` | 9-domain allowlist + cache + timeout defaults | VERIFIED | Valid JSON, 9 allowed_domains entries, all expected keys |
| `tests/test_tile_proxy.py` | ≥49 tests (Plan 01-01) → ≥71 tests (Plan 01-03) | VERIFIED | 71 test methods across 10 TestCase classes |
| `tests/splunk/rest.py` | Offline BaseRestHandler stub | VERIFIED | Referenced by PYTHONPATH in run_tests.sh |
| `run_tests.sh` | Cross-platform unittest runner | VERIFIED | OS-aware PYTHONPATH separator; works on Windows Git Bash |
| `build_release.sh` | Packages bin/ + default/ configs; strips tests/.planning/CLAUDE.md | VERIFIED | git archive → stage → strip dev artifacts → fail-fast guard on tile_proxy.py + restmap.conf → repack |
| `appserver/.../scripts/deploy.sh` | Includes bin/ in dev package | VERIFIED | `bin` added to for-dir loop; explicit restmap.conf + settings.json re-copy |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `restmap.conf` | `TileProxyHandler` | `handlerfile = rest/maps_plus/tile_proxy.py` + `handler = TileProxyHandler` | WIRED | Class name and file path match exactly |
| `handle_GET` | `_validate_url` | Step 5 call with settings.allowed_domains | WIRED | Lines 799–802 |
| `handle_GET` | `_get_memory_cache` / `_get_disk_cache` | Two-tier lookup at steps 6 + 6b | WIRED | Lines 805–836 |
| `handle_GET` | `_fetch_tile` | Step 7 upstream call with timeout | WIRED | Lines 841–864 |
| `_load_settings` | `default/settings.json` | `$SPLUNK_HOME/etc/apps/leaflet_maps_app/default/settings.json` | WIRED | Path built in `_get_app_dir`; consumed in `_load_settings` |
| `DiskCache` | filesystem `$SPLUNK_HOME/var/run/maps_plus/tile_cache/` | `_get_disk_cache` path construction | WIRED | Lines 710–713 |

### Data-Flow Trace (Level 4)

Deferred to human verification — the data-flow endpoint is Splunk's REST framework, which only runs inside splunkd. Unit tests mock `splunk.rest.BaseRestHandler` via `tests/splunk/rest.py` stub. Live byte-flow from upstream tile provider → response body requires in-container test (see human_verification item 1).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Test suite passes | `bash run_tests.sh` | `Ran 71 tests in 4.182s — OK` | PASS |
| `settings.json` is valid JSON | `python -m json.tool default/settings.json` | Parses cleanly | PASS |
| `restmap.conf` stanza is `[script:]` not `[route:]` | grep `^\[script:` / `^\[route:` default/restmap.conf | `[script:maps_plus_tile_proxy]` present; zero `[route:` | PASS |
| Python module imports under python3 | Implicit via test suite | All 71 tests pass | PASS |
| Live endpoint response in splunkd | `curl -ku admin:... https://localhost:8089/services/maps_plus/tile/proxy?...` | SKIPPED — requires live Splunk | SKIP → human |

### Requirements Coverage

Plans do not declare REQUIREMENTS.md IDs in frontmatter, but the REQUIREMENTS.md traceability table maps phase-1 IDs to `bin/rest/maps_plus/tile_proxy.py` + `restmap.conf` + `settings.json`.

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| DS-TP-01 | GET endpoint at `/services/rest/maps_plus/tile/proxy` with z/x/y substitution | PARTIAL | Endpoint registered at `/services/maps_plus/tile/proxy` (NOTE: without the `rest/` prefix — REQUIREMENTS.md wording is incorrect; `[script:]` stanzas in Splunk 9 register under `/services/<match>`, not `/services/rest/...`). This is documented in Plan 01-02 SUMMARY and RESEARCH.md as an intentional correction of the requirement text. |
| DS-TP-02 | Content-Type passthrough, Cache-Control default `public, max-age=3600` | PARTIAL | Content-Type passthrough: SATISFIED. Default Cache-Control is `public, max-age=86400` (24h), not 3600 (1h). Minor deviation from REQUIREMENTS.md text — more conservative (longer cache is fine for immutable tiles). |
| DS-TP-03 | Graceful error handling (403/502/504) with structured logging | SATISFIED | `handle_GET` steps 7 maps HTTPError→502, timeout→504; logs use module tag `splunk.modules.maps_plus.tile_proxy` |
| DS-TP-04 | Support `{z}/{x}/{y}` + `{z}/{y}/{x}` order | SATISFIED | `_resolve_tile` performs literal substitution; Esri's `/{z}/{y}/{x}` template is respected as-is (audit A-07). `test_esri_yx_order_literal_no_swap` confirms. |
| DS-TP-05 | Support `{r}` and `{s}` extras with defaults | SATISFIED | Defaults: `s="a"`, `r="1"`; `test_gbif_retina_default_is_1_not_empty` |
| DS-CL-01 | In-memory LRU, 256 entries max, URL-keyed | SATISFIED | `LRUCache` + `_make_cache_key` (SHA-256 full digest) |
| DS-CL-02 | Optional disk LRU, default 500MB, Cloud fallback | SATISFIED | `DiskCache` + `_get_disk_cache` + `PermissionError`/`EROFS` fallback |
| DS-CL-03 | 10s upstream timeout, cache-miss triggers fetch | SATISFIED | `DEFAULT_TIMEOUT_SECONDS=10`, `_fetch_tile(..., timeout_seconds=timeout)` |
| DS-CFG-01 | Runtime config via `local/settings.json` in app scope | SATISFIED | `_load_settings` merges hardcoded → default/ → local/ |
| DS-CFG-02 | Config read at startup, no hot-reload | SATISFIED | `_settings_cache` single-load with double-checked lock |
| DS-JS-* | JS integration (out-of-scope for Phase 1) | N/A (Phase 2) | Deferred |

### Anti-Patterns Found

None. Scanned `bin/rest/maps_plus/tile_proxy.py` for TODO/FIXME/placeholder/empty-return patterns — zero matches outside of docstring references to plan IDs.

### Threat-Model Coverage (T1 + T2 + T3)

| Threat | Mitigation | Test Coverage |
|--------|-----------|---------------|
| T1-01 SSRF | `_validate_url` 4-layer | `TestValidateUrl` (9 tests) |
| T1-02 z/x/y injection | `_check_zxy_value` | `test_rejects_injection_in_z/x/y`, `test_rejects_negative_zxy` |
| T1-03 response-size DoS | `resp.read(MAX+1)` + len check | `test_oversize_raises`, `test_upstream_oversize_returns_502` |
| T1-04 redirect SSRF | `_NoRedirectHandler` all 3xx→HTTPError | Implicit via `_fetch_tile` tests; handler mocks confirm no redirect follow |
| T1-05 cache-key poisoning | SHA-256 full 64-hex, no truncation | `test_key_is_64_hex_chars` |
| T1-09 disabled endpoint | Early 503 return | `test_disabled_returns_503` |
| T1-10 binary encoding | Bytes pass-through | `test_full_flow_with_mocked_upstream` |
| T1-11 error leak | Sanitized JSON short-codes | Every error branch in `TestHandleGetOrchestration` |
| T2-01 anonymous SSRF | `requireAuthentication = true` | Config-level, not testable offline |
| T2-02 wrong stanza type | `[script:]` not `[route:]` | grep verified |
| T2-03 Python 2 fallback | `python.version = python3` | grep verified |
| T2-05 missing-from-package | build_release.sh fail-fast guard | Script exits if tile_proxy.py or restmap.conf missing from stage |
| T3-01 path traversal | `_assert_within_cache_dir` realpath | `test_path_escape_rejected` |
| T3-02 torn write | mkstemp + os.replace | `test_atomic_write_no_tmp_leftovers` |
| T3-03 concurrency race | `threading.Lock` | 3 concurrency tests (160/400/80 writes) |
| T3-04 disk exhaustion | `_prune_locked` mtime LRU | `test_lru_prune_removes_oldest_when_over_cap` |
| T3-05 Cloud read-only FS | `PermissionError`/`EROFS`→`enabled=False` | `test_disabled_on_permission_error`, `test_disabled_on_readonly_fs_erofs`; **live verification pending** |
| T3-06 pickle RCE | Custom length-prefixed binary with `MP01` magic | `test_wrong_magic_header_returns_none` |
| T3-07 symlink escape | realpath resolves symlinks | Covered by `_assert_within_cache_dir` tests |

### Summary claims vs. reality cross-check

No hallucinations found. Every claim in the three SUMMARY.md files that I checked against the codebase was accurate:

- File line counts match (tile_proxy.py 887 lines, restmap.conf 17 lines, settings.json 23 lines)
- Test counts match (49 → 71 cumulative)
- Commit hashes referenced exist in recent git log (271704a, 77d11a1, 0cb8e03)
- Interface contracts (class/function names, signatures) match source
- Plan 01-02 SUMMARY flagged release-tarball verification as DEFERRED — correctly surfaced rather than claimed as complete.

### Human Verification Required

1. **Live endpoint smoke test in splunkd** — install packaged app, curl the endpoint with a real OSM URL, verify 200 + PNG bytes + `x-maps-plus-cache: miss` on first call and `hit` on second.
2. **Release tarball contents** — run `build_release.sh` and confirm via `tar -tzf` that Phase-1 artifacts ship and dev artifacts are stripped (explicitly deferred in Plan 01-02 SUMMARY).
3. **Splunk Cloud fallback behavior** — deploy to a Cloud / read-only FS context and verify graceful degradation to memory-only with a single INFO log.

### Gaps Summary

No blocking gaps. Phase 01 delivers the goal: the REST proxy handler exists, is registered, implements all four SSRF defense layers, enforces the 512KB cap, provides two-tier (memory + optional disk) LRU caching, handles Splunk Cloud gracefully, sanitizes errors, and ships through both dev and release pipelines. The 71-test suite exercises every threat mitigation in the T1/T2/T3 model that is testable offline.

Two minor REQUIREMENTS.md text deviations noted (DS-TP-01 endpoint path lacks `rest/` prefix — correctly intentional per Splunk 9 `[script:]` semantics; DS-TP-02 default Cache-Control is 86400s rather than 3600s — more conservative) are implementation-correct and should be reconciled by updating REQUIREMENTS.md text in a later doc-pass.

Three items genuinely require a live Splunk instance to verify and are documented under Human Verification. Phase 02 (JS client) can safely proceed — the backend contract `/services/maps_plus/tile/proxy?url=<tmpl>&z=<int>&x=<int>&y=<int>[&s=&r=]` is stable.

---

_Verified: 2026-04-16_
_Verifier: Claude (gsd-verifier)_
