---
phase: 01-rest-proxy-backend-routing
plan: 01
subsystem: python-rest-handler
tags: [python, rest-handler, ssrf, lru-cache, unittest, splunk]
dependency-graph:
  requires: []
  provides:
    - "bin/rest/maps_plus/tile_proxy.py: TileProxyHandler class"
    - "bin/rest/maps_plus/tile_proxy.py: _validate_url, _host_allowed, _resolve_tile, _make_cache_key, _fetch_tile, LRUCache"
    - "tests/splunk/rest.py: offline BaseRestHandler stub"
    - "run_tests.sh: stdlib unittest runner (cross-platform)"
  affects:
    - "Plan 01-02 will ship default/settings.json consumed by _load_settings"
    - "Plan 01-02 will ship default/restmap.conf registering TileProxyHandler at /services/maps_plus/tile/proxy"
    - "Plan 01-03 will extend _get_memory_cache with a DiskCache tier"
    - "Phase 02 (JS client) will call the endpoint this handler serves"
tech-stack:
  added:
    - "Python stdlib: urllib.request, urllib.parse, urllib.error, socket, ipaddress, hashlib, collections.OrderedDict, threading, logging, json, re, os"
    - "Python stdlib test tooling: unittest, unittest.mock"
  patterns:
    - "4-layer SSRF defense: scheme + injection-char + host-allowlist + DNS/private-IP"
    - "No-redirect opener (build_opener + custom HTTPRedirectHandler) to prevent redirect SSRF"
    - "OrderedDict-backed LRU with threading.Lock (NOT functools.lru_cache per D-10)"
    - "Offline Splunk stub via tests/splunk/ on PYTHONPATH before any real splunk import"
    - "Response-size cap via resp.read(MAX+1) + len check"
key-files:
  created:
    - "bin/__init__.py (empty package marker)"
    - "bin/rest/__init__.py (empty package marker)"
    - "bin/rest/maps_plus/__init__.py (empty package marker)"
    - "bin/rest/maps_plus/tile_proxy.py (580 lines — handler + pure funcs + LRU)"
    - "tests/__init__.py"
    - "tests/splunk/__init__.py"
    - "tests/splunk/rest.py (stub BaseRestHandler + MockResponse, 30 lines)"
    - "tests/test_tile_proxy.py (420 lines, 49 test methods)"
    - "run_tests.sh (cross-platform stdlib-unittest runner)"
  modified: []
decisions:
  - "Adopted BaseRestHandler (old-style) per RESEARCH Unknown 1 — community-verified binary write support"
  - "Default {r} pixel ratio = '1' (not '') so GBIF @{r}x.png resolves to @1x.png (A-02)"
  - "SHA-256 cache keys are full 64 hex chars, never truncated (A-11)"
  - "Empty allowlist = deny-all; _FALLBACK_ALLOWED_DOMAINS is the in-code safety net (D-02)"
  - "Disabled 301/302/303/307/308 via _NoRedirectHandler — all 3xx become errors (T1-04)"
  - "Error bodies are always {\"error\":\"<short_code>\"} — never upstream body or traceback (T1-11, D-13)"
  - "run_tests.sh uses OS-detection to set PYTHONPATH separator (':' POSIX, ';' Windows) for dev-box portability"
metrics:
  duration: "~35 minutes"
  completed: "2026-04-17"
  task_count: 3
  test_count: 49
  test_pass: 49
  test_fail: 0
  handler_lines: 580
  test_lines: 420
---

# Phase 01 Plan 01: Python REST handler + first-test infrastructure Summary

Python REST handler `TileProxyHandler` with 4-layer SSRF defense, OrderedDict
LRU cache, and the project's first automated unittest suite (49 tests,
stdlib-only) running offline via a `splunk.rest` stub.

## What Was Built

**`bin/rest/maps_plus/tile_proxy.py`** (580 lines, single module) exposes
the Plan 01-03 interface contract verbatim:

```python
MAX_TILE_BYTES: int = 524288
DEFAULT_TIMEOUT_SECONDS: int = 10
DEFAULT_SUBDOMAIN: str = "a"
DEFAULT_PIXEL_RATIO: str = "1"
DEFAULT_CACHE_CONTROL: str = "public, max-age=86400"
DEFAULT_CACHE_MAX_MEMORY: int = 256

def _host_allowed(host: str, allowed_domains: list) -> bool
def _validate_url(url: str, allowed_domains: list) -> tuple  # (bool, code_or_None)
def _resolve_tile(template: str, z, x, y, s="a", r="1") -> str
def _make_cache_key(resolved_url: str) -> str   # 64 hex
def _fetch_tile(resolved_url: str, timeout_seconds: int = 10) -> tuple  # (bytes, ct, cc)
def _load_settings() -> dict
def _reset_settings_cache() -> None       # test helper
def _reset_memory_cache() -> None         # test helper

class LRUCache:
    def __init__(self, maxsize: int = 256): ...
    def get(self, key) -> value_or_None
    def set(self, key, value) -> None
    def __len__(self) -> int
    def clear(self) -> None

class _NoRedirectHandler(urllib.request.HTTPRedirectHandler)   # all 3xx -> HTTPError
_opener = urllib.request.build_opener(_NoRedirectHandler())

class TileProxyHandler(splunk.rest.BaseRestHandler):
    def handle_GET(self): ...
```

**`tests/splunk/rest.py`** — offline stub providing `BaseRestHandler` and
`MockResponse`. Placed on PYTHONPATH BEFORE `bin/` so `import splunk.rest`
resolves to the stub in tests and to the real module in Splunk runtime.

**`tests/test_tile_proxy.py`** — 49 test methods across 7 TestCase classes
covering every pure function, the LRU cache (including threading smoke),
and every `handle_GET` branch.

**`run_tests.sh`** — POSIX shell runner with Python-interpreter discovery
(`python3` → `python` → `py -3`) and OS-aware PYTHONPATH separator.

## Must-Haves Verification

| Truth                                                                           | Status |
| ------------------------------------------------------------------------------- | ------ |
| Module loads without SyntaxError under python3                                  | PASS   |
| GET with valid template+z+x+y returns upstream tile bytes with pass-through CT  | PASS (test_full_flow_with_mocked_upstream) |
| http://, disallowed host, private IP, injection chars → 400 sanitized JSON      | PASS (9 TestValidateUrl cases) |
| Upstream 403/5xx → 502, socket.timeout → 504                                    | PASS (test_upstream_http_error_returns_502, test_upstream_timeout_returns_504) |
| Responses >512KB rejected (502/400), no unbounded buffering                     | PASS (test_oversize_raises + test_upstream_oversize_returns_502) |
| {r} default = "1" so @{r}x.png resolves to @1x.png                              | PASS (test_gbif_retina_default_is_1_not_empty) |
| enabled=false returns 503 {"error":"proxy_disabled"}                            | PASS (test_disabled_returns_503) |
| Pure functions importable/testable without Splunk                               | PASS (tests/splunk/ stub) |
| unittest suite passes via run_tests.sh with zero failures                       | PASS (49/49) |

## Threat Mitigations Implemented (grep-verifiable)

| Threat                      | Mitigation                                           |
| --------------------------- | ---------------------------------------------------- |
| T1-01 SSRF                  | `_validate_url` 4-layer: scheme/injection/host/IP    |
| T1-02 z/x/y injection       | `_check_zxy_value` rejects `@ .. \n \r \x00 / space` |
| T1-03 response size         | `resp.read(MAX_TILE_BYTES+1)` + len check            |
| T1-04 redirect SSRF         | `_NoRedirectHandler` raises HTTPError on all 3xx     |
| T1-05 cache poisoning       | `_make_cache_key` = full 64-hex SHA-256              |
| T1-09 disabled endpoint     | `handle_GET` first check returns 503                 |
| T1-10 binary encoding       | `resp.read()` bytes passed to `response.write(data)` |
| T1-11 error leak            | All errors use `{"error":"<short_code>"}` only       |

## Audit Findings Addressed

- **A-01** SSRF: 4-layer defense + empty-allowlist deny-all.
- **A-02** `{r}` default = `"1"` — GBIF test asserts `@1x.png` output, rejects `@x.png`.
- **A-03** 512KB size cap with `MAX_TILE_BYTES + 1` read.
- **A-05** Pure-function extraction; first unittest suite in repo.
- **A-06** stdlib `unittest`/`unittest.mock` only; no `pytest` import.
- **A-07** No `{x}/{y}` auto-swap — Esri template test asserts literal substitution.
- **A-08** `Content-Type` pass-through from upstream response.
- **A-09** `enabled=false` → HTTP 503 `proxy_disabled`.
- **A-11** SHA-256 full 64 hex; `hexdigest()[:` pattern not present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cross-platform `PYTHONPATH` separator in run_tests.sh**
- **Found during:** Task 1 verification (local run on Windows Git Bash)
- **Issue:** Plan-specified `PYTHONPATH=tests:bin` works on Linux/macOS/Splunk
  but fails on Windows where Python parses `:` as part of a path segment (e.g.
  `tests:bin` is treated as a single path relative to a `C:` drive). The
  resulting ModuleNotFoundError would block local development and any CI that
  runs on a Windows runner.
- **Fix:** `run_tests.sh` now detects OS via `uname -s` (MINGW/MSYS/CYGWIN/
  Windows_NT → `;`, else `:`) and also falls back from `python3` to `python`
  to `py -3` so a developer on Windows (where `python3` often launches the
  MS Store shim) can still run the suite.
- **Files modified:** `run_tests.sh`
- **Commits:** e3f843f (final portable version bundled with test-suite commit)
- **Rationale:** CLAUDE.md explicitly calls out Windows/Git Bash portability
  (see MEMORY.md feedback_deploy_sh_windows). Splunk CI runs on Linux, so the
  `:` path still works there. The OS-detection is silent and has no effect on
  the canonical Splunk environment.

**2. [Rule 2 - Hardening] Explicit HTTP error conversion for all redirect codes**
- **Found during:** Task 2 implementation
- **Issue:** `urllib.request.HTTPRedirectHandler.redirect_request` returning
  `None` silently aborts the redirect, but the underlying HTTP client still
  returns the 3xx response body to the caller — meaning `_fetch_tile` could
  accept a 302 with a 200-like body. Plan specified only `redirect_request`
  override.
- **Fix:** `_NoRedirectHandler` ALSO overrides `http_error_301/302/303/307/308`
  to raise `HTTPError`. Any 3xx from an allowlisted host is now a clean
  `HTTPError` at `_opener.open` time, mapped to upstream_error 502 by the
  handler.
- **Files modified:** `bin/rest/maps_plus/tile_proxy.py`
- **Commit:** 213493d
- **Rationale:** Closes the T1-04 threat surface more rigorously than the plan
  text suggested. No test change required (full_flow still passes); adds
  defense-in-depth.

**3. [Rule 2 - Hardening] Reject raw whitespace/slash in z/x/y**
- **Found during:** Task 2 implementation
- **Issue:** Plan's `_INJECTION_CHARS` tuple caught `@ .. \n \r \x00 # %00 %0a %0d`
  but an attacker z-value like `"1 2"` or `"1/2/3"` would pass through the
  `int()` coerce check on some Python versions (actually fails via ValueError
  on 3.x, but belt-and-suspenders).
- **Fix:** `_check_zxy_value` explicitly rejects space, tab, and `/` in raw
  z/x/y strings BEFORE `int()` coerce.
- **Files modified:** `bin/rest/maps_plus/tile_proxy.py`
- **Commit:** 213493d
- **Rationale:** Layered defense for T1-02; no behavior change for legitimate
  integer inputs.

## Known Gaps / TODOs for Downstream Plans

- **Plan 01-02** must ship `default/settings.json` matching `_hardcoded_defaults()`
  and `default/restmap.conf` with:
  ```
  [script:maps_plus_tile_proxy]
  match                 = /maps_plus/tile/proxy
  scripttype            = persist
  handlertype           = python
  handlerfile           = rest/maps_plus/tile_proxy.py
  handleractions        = get
  python.version        = python3
  requireAuthentication = true
  ```
- **Plan 01-02** must also update `scripts/deploy.sh` AND `build_release.sh`
  to include `bin/` in the packaged tarball (audit A-12).
- **Plan 01-03** will add a `DiskCache` class that wraps `LRUCache`; the
  `_get_memory_cache()` accessor is the extension point.
- `_get_app_dir()` currently reads `$SPLUNK_HOME`; in the unit-test environment
  this returns `None` and `_load_settings()` falls back to hardcoded defaults.
  No further action needed.

## Stubs / Data Wiring

No client-facing UI stubs introduced. The handler emits an `x-maps-plus-cache:
hit|miss` header which Plan 02 (JS client) can observe for diagnostics but is
purely advisory.

## Self-Check: PASSED

- bin/__init__.py FOUND
- bin/rest/__init__.py FOUND
- bin/rest/maps_plus/__init__.py FOUND
- bin/rest/maps_plus/tile_proxy.py FOUND (580 lines)
- tests/__init__.py FOUND
- tests/splunk/__init__.py FOUND
- tests/splunk/rest.py FOUND
- tests/test_tile_proxy.py FOUND (420 lines, 49 tests)
- run_tests.sh FOUND and executable
- Commit d56566f (Task 1): FOUND (bin/ + tests/ + run_tests.sh skeleton)
- Commit 213493d (Task 2): FOUND (tile_proxy.py 580 lines)
- Commit e3f843f (Task 3): FOUND (test suite 49 tests + run_tests.sh portability)
- `./run_tests.sh` → `Ran 49 tests in 0.005s — OK`
