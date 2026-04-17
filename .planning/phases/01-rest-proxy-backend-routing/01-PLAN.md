# Phase 1: REST Proxy Backend + Routing — Plan

**Phase:** 01-rest-proxy-backend-routing
**Milestone:** 1 (Dashboard Studio Raster Tile Proxy Support)
**Created:** 2026-04-16
**Status:** Planned

---

<threat_model>

## Threat Model — Phase 1: REST Proxy Backend + Routing

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| T1 | **SSRF via tile URL parameter** — An authenticated Splunk user supplies a crafted `url` parameter pointing to internal services (e.g., `http://localhost:8089/services/search/jobs/`) to read Splunk internals through the proxy. | HIGH — Bypasses network boundary; could expose authentication tokens, search results, or internal configs. | MEDIUM — Requires Splunk auth but runs under the caller's privilege context. | **Domain allowlist** (configurable `allowed_domains`); **block all private/reserved IP ranges** at resolution time; **reject non-https schemes**; whitelist default to empty (allow-all) only when explicitly configured. Validate with regex before any DNS lookup. |
| T2 | **Open redirect via tile URL** — The proxy URL itself is used as a redirect target or appears in logs/referrers, potentially leaking session tokens. | LOW | LOW — Tile URLs appear in browser Network panel, not referrers. | No redirect behavior; proxy returns raw tile bytes directly. |
| T3 | **Path traversal in cache keys** — A crafted tile URL containing `../` sequences could cause disk writes to escape the designated cache directory, corrupting or overwriting arbitrary files on the Splunk server filesystem. | CRITICAL — Could overwrite system files or other app data if running as splunk user with write access. | LOW-MEDIUM — Requires SSRF vulnerability (T1) to be exploited first; mitigated by domain allowlist and URL validation. | **Normalize and sanitize** all resolved URLs before use as cache keys; on disk, hash the full resolved URL (SHA-256) for the filename rather than using raw URL paths; verify resolved file path is within the designated cache directory using `os.path.realpath()` + prefix check before every write. |
| T4 | **Denial of Service via tile flood** — An attacker requests a large number of unique tile URLs (one per zoom level across a world-extent bounding box), exhausting in-memory LRU cache and/or disk space, causing Splunk web processes to become unresponsive. | MEDIUM — Splunk web could degrade or OOM-kill under sustained attack. | MEDIUM — Authenticated users can trigger arbitrary numbers of tile fetches. | **Hard cap on in-memory entries** (256); **hard cap on disk cache** (500MB with auto-prune); **per-process timeout** (10s per upstream request) to prevent thread blocking; **connection reuse disabled** (create fresh `Request` objects per call). |
| T5 | **Information disclosure via error responses** — Upstream HTTP errors (502, 504, connection refused) leak internal details (IP addresses, stack traces, hostnames) in the REST response body. | LOW-MEDIUM | LOW — Splunk REST framework typically wraps handler exceptions; however custom error bodies could expose internals. | **Never echo upstream response bodies** to the client; log full error details with module tag `maps_plus.tile_proxy` but return only an HTTP status code + minimal JSON error message. |
| T6 | **Config tampering via settings.json injection** — A user modifies `local/settings.json` to enable disk cache write to an arbitrary path (e.g., `"/opt/splunk/etc/auth/"`) or disable domain allowlisting. | MEDIUM — Running under Splunk app context, so the attacker already has some auth level; misconfiguration could widen blast radius. | LOW — Requires write access to `local/` directory, which implies admin-level privileges. | Document in admin guide that `local/settings.json` overrides are trusted; validate config values at module load time with type checks and path restrictions (cache_disk_path must resolve within Splunk var/run/). |

**Threat Summary:** The primary attack surface is the tile URL parameter, which enables SSRF if not properly constrained. All other risks (path traversal, DoS, info disclosure) are mitigated through defense-in-depth: domain validation + IP-range blocking, path canonicalization + hashing, hard size caps + auto-prune, and error suppression.

</threat_model>

---

## Plan 1.1: Python REST Handler (`bin/rest/maps_plus/tile_proxy.py`)

### Overview
Implement the core Splunk REST handler — a `BaseRestHandler` subclass that exposes a GET endpoint at `/services/rest/maps_plus/tile/proxy`. The handler reads URL template + coordinates from query parameters, substitutes placeholders (`{z}`, `{x}`, `{y}`, `{s}`, `{r}`), checks the in-memory LRU cache, fetches from upstream if needed, and streams the response back with appropriate headers. Error conditions (403 rate-limit, 504 timeout) are handled gracefully without process crashes.

### Tasks

- [ ] **T1.1.1: Create Python package structure `bin/rest/maps_plus/`**
  - Create directory hierarchy under app root: `bin/rest/maps_plus/`
  - Add empty `__init__.py` files for `bin/`, `bin/rest/`, and `bin/rest/maps_plus/`
  - Verify Splunk can discover the handler via standard REST module path resolution
  - **Files modified:** (new) `bin/__init__.py`, `bin/rest/__init__.py`, `bin/rest/maps_plus/__init__.py`
  - **Verification:** `python -c "import sys; sys.path.insert(0, 'bin'); from rest.maps_plus import tile_proxy"` succeeds without import errors on a system with Splunk's sdklib available

- [ ] **T1.1.2: Implement `_resolve_tile()` — URL template substitution**
  - Create `class TileProxyHandler(BaseRestHandler)` in `tile_proxy.py`
  - Implement `_resolve_tile(url_template, z, x, y)` method that performs string replacement of `{z}`, `{x}`, `{y}` placeholders
  - Support subdomain variable `{s}` (defaults to `"a"` if present but not provided)
  - Support pixel ratio variable `{r}` (defaults to `"1"` if present but not provided)
  - Auto-detect coordinate-order reversal for Esri/GIBS URLs: if the URL contains `/ArcGIS/` or `gibs.earthdata.nasa.gov`, swap `{x}` and `{y}` positions in the template before substitution
  - Return the fully resolved tile URL string
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (partial)
  - **Verification:** Unit tests pass for all provider URL patterns: OSM (`{z}/{x}/{y}`), CartoDB (`{s}.basemaps.../{z}/{x}/{y}`), Esri (`{z}/{y}/{x}` auto-detect), GIBS (`{z}/{y}/{x}` auto-detect with extra params)

- [ ] **T1.1.3: Implement GET handler — query parsing and entry point**
  - Implement `def get(self, *args, **kwargs)` method on `TileProxyHandler`
  - Parse query parameters: `url` (tile template), `z`, `x`, `y`
  - Validate that all three coordinate params are present and numeric integers; return HTTP 400 if missing or invalid
  - URL-decode the `url` parameter using `urllib.parse.unquote_plus()`
  - Call `_resolve_tile()` to build the final upstream URL
  - Return HTTP 400 with JSON error if resolution fails (e.g., unresolved placeholders)
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (extended)
  - **Verification:** Test with valid and invalid parameters; confirm 400 response for malformed inputs; confirm resolved URL is correct for each provider pattern

- [ ] **T1.1.4: Implement `_fetch_tile()` — upstream fetch via urllib.request**
  - Implement `_fetch_tile(resolved_url)` method that opens the upstream tile URL using `urllib.request.urlopen()`
  - Set socket timeout of 10 seconds (configurable; read from settings later)
  - Read response body as binary (`response.read()`)
  - Capture response headers: `Content-Type` and `Cache-Control`
  - If Content-Type is not image/png or image/jpeg, default to `image/png`
  - If Cache-Control header is absent, default to `public, max-age=3600`
  - Return tuple: `(binary_data, content_type, cache_control)`
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (extended)
  - **Verification:** Mocked unit test confirms binary tile data is returned; verify default headers are applied when upstream omits them

- [ ] **T1.1.5: Implement in-memory LRU cache layer**
  - Add module-level `_lru_cache`: an `collections.OrderedDict` keyed by resolved URL, value = `(binary_data, content_type, cache_control, last_accessed_epoch)`
  - Add constant `MAX_MEMORY_CACHE = 256` (hardcoded for Phase 1; becomes configurable in Plan 1.3)
  - Implement `_cache_get(url)` — returns cached data if present, moves entry to end (most-recently-used), or None on miss
  - Implement `_cache_set(url, data_tuple)` — inserts/updates entry and evicts oldest if > 256 entries using `popitem(last=False)`
  - No lock is needed: Splunk's modular REST handler processes requests sequentially within each process (single-threaded Python in web framework)
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (extended)
  - **Verification:** Unit test inserts 260 unique URLs; confirms oldest 4 are evicted; confirms LRU ordering by accessing middle entries

- [ ] **T1.1.6: Wire cache into GET handler — complete proxy flow**
  - In `get()`, after resolving the tile URL, call `_cache_get(resolved_url)`
  - On cache hit: return cached data directly (no network call) with appropriate Splunk REST response headers
  - On cache miss: call `_fetch_tile(resolved_url)`, store result via `_cache_set()`, then stream response
  - Set Splunk REST response headers using `self.setResponseHeader()` and write binary body via `self.write()`
  - Call `self.finish()` to complete the response
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (final handler logic)
  - **Verification:** Manual test: request same tile twice; confirm second request returns cached data (no network activity visible in tcpdump/Wireshark); verify correct Content-Type header in response

- [ ] **T1.1.7: Implement error handling — upstream failures**
  - Wrap `_fetch_tile()` in try/except for `urllib.error.HTTPError` and `socket.timeout`
  - On HTTP 403 (rate-limit): log warning with module tag `maps_plus.tile_proxy`, return HTTP 502 to client with body `'{"error":"tile provider rate-limited"}'`
  - On HTTP 5xx: log error, return HTTP 502 with JSON error body
  - On socket.timeout / URLError (unreachable host): log error, return HTTP 504 with JSON error body
  - On any unexpected exception: catch broadly, log traceback, return HTTP 500 with generic error message
  - **Never echo upstream response bodies or stack traces to the client** (per threat model T5)
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (error handling added)
  - **Verification:** Mocked unit tests for each error scenario: HTTP 403 returns 502, timeout returns 504, network unreachable returns 504; verify error bodies are sanitized

- [ ] **T1.1.8: Add module-level logging with Splunk module tag**
  - Import `logging` and create logger: `logger = logging.getLogger('splunk.modules.maps_plus.tile_proxy')`
  - Configure log level to INFO by default (configurable via Python's logging hierarchy)
  - Use `logger.info()` for cache hits/misses, `logger.warning()` for rate-limits, `logger.error()` for failures
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (logging added)
  - **Verification:** Trigger a cache hit and confirm INFO-level log entry appears in Splunk `_internal` logs under sourcetype `splunkd`

- [ ] **T1.1.9: Write unit tests for `_resolve_tile()` with mocked responses**
  - Create test file at `tests/test_tile_proxy.py` (test infrastructure from T1.2.4)
  - Test all URL template patterns: OSM, CartoDB (with `{s}`), Esri (auto-reversed), GIBS (auto-reversed with extra params), custom user override (plain {z}/{x}/{y})
  - Test default substitution for `{s}` (defaults to `"a"`) and `{r}` (defaults to `"1"`)
  - Test edge cases: missing `{z}`/`{x}`/`{y}` params → HTTP 400; non-integer params → HTTP 400
  - Use `unittest.mock.patch('urllib.request.urlopen')` for network mocking
  - **Files modified:** (new) `tests/test_tile_proxy.py`, tests will be extended with more test cases in T1.3.5
  - **Verification:** All tests pass via `python -m pytest tests/ -v`; confirm 100% assertion coverage for `_resolve_tile()` and error handling paths

### Verification

1. Deploy handler to a local Splunk 9.x instance with `bin/rest/maps_plus/tile_proxy.py` in place
2. Register route via `restmap.conf` (see Plan 1.2)
3. Use curl to test: `curl -k -u admin:changeme "https://localhost:8089/services/rest/maps_plus/tile/proxy?url=https://tile.openstreetmap.org/{z}/{x}/{y}.png&z=10&x=500&y=300"` — expect 200 with PNG data
4. Test error cases: missing params (400), provider timeout (504), rate-limit (502)
5. Run unit tests: `python -m pytest tests/ -v` — all pass

---

## Plan 1.2: Configuration (`restmap.conf`, `default/settings.json`)

### Overview
Create the Splunk configuration files that register the REST route and provide default settings for the tile proxy. The `restmap.conf` file defines the URL routing from `/services/rest/maps_plus/tile/proxy` to the Python handler. The `default/settings.json` provides sensible defaults that users can override in their `local/` directory. The deploy script must be updated to include the new `bin/` directory and configuration files.

### Tasks

- [ ] **T1.2.1: Create `restmap.conf` with route definition**
  - Create `default/restmap.conf` under app root
  - Define stanza: `[route:maps_plus_tile_proxy]`
  - Set `match = /services/rest/maps_plus/tile/proxy` (exact match on path)
  - Set `source = rest.maps_plus.tile_proxy:TileProxyHandler` (module.class:handler_class — standard Splunk sdklib modular REST handler syntax)
  - No `[rest://...]` authentication stanzas needed — proxy inherits the caller's Splunk session permissions
  - **Files modified:** (new) `default/restmap.conf`
  - **Verification:** After deployment, Splunk logs confirm route registration; curl test to the endpoint returns handler output (not a "route not found" error)

- [ ] **T1.2.2: Create default `settings.json` with config schema**
  - Create `default/settings.json` under app root with the following structure:
  ```json
  {
    "maps_plus": {
      "tile_proxy": {
        "enabled": true,
        "cache_enabled": true,
        "cache_type": "disk",
        "cache_max_size_mb": 500,
        "cache_memory_limit": 256,
        "cache_disk_path": null,
        "timeout_seconds": 10,
        "allowed_domains": [],
        "log_level": "INFO"
      }
    }
  }
  ```
  - `enabled` — master toggle for the proxy (when false, handler returns 503)
  - `cache_type` — `"disk"` by default; falls back to `"memory"` on Cloud per Plan 1.3
  - `cache_max_size_mb` — disk cache cap in megabytes
  - `cache_memory_limit` — max LRU entries in memory (256)
  - `cache_disk_path` — if null, auto-detect Splunk's `var/run/` directory at runtime
  - `timeout_seconds` — upstream fetch timeout
  - `allowed_domains` — empty list means allow all domains (user must explicitly restrict); each entry is a string hostname (no wildcards for Phase 1)
  - `log_level` — Python logging level override
  - **Files modified:** (new) `default/settings.json`
  - **Verification:** JSON parses without errors; Splunk app loads with default config (no startup exceptions in splunkd logs)

- [ ] **T1.2.3: Implement configuration loading in `tile_proxy.py`**
  - Add `_load_config()` function that reads `settings.json`:
    - First tries `local/settings.json` (user overrides) from the app directory
    - Falls back to `default/settings.json` (app defaults)
    - Uses `json.load()` with error handling — if file missing or invalid, fall back to hardcoded safe defaults
  - Read Splunk instance home path via environment variable `SPLUNK_HOME` (standard on all Splunk deployments) or `os.getenv('SPLUNK_HOME', '/opt/splunk')` as fallback
  - Construct paths: `<app_dir>/local/settings.json` and `<app_dir>/default/settings.json` where `<app_dir>` is derived from the module's location (`os.path.dirname(__file__)` walked up to find `bin/` parent)
  - Merge config: user values override defaults (shallow merge for first two levels)
  - Validate types at load time: `enabled` (bool), `cache_max_size_mb` (int > 0), `timeout_seconds` (int > 0) — log warning and use default for invalid values
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (config loading added)
  - **Verification:** Handler loads with only `default/settings.json`; then test with a `local/settings.json` that overrides timeout to 5 seconds — confirm handler uses the overridden value

- [ ] **T1.2.4: Create test infrastructure**
  - This is the **first automated test infrastructure** in the project's history
  - Create `tests/__init__.py` (empty, marks directory as Python package)
  - Create `run_tests.sh` script at repo root that runs pytest with coverage:
    ```bash
    #!/bin/bash
    set -e
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    cd "$SCRIPT_DIR"
    PYTHONPATH="$SCRIPT_DIR/bin:$SCRIPT_DIR/tests" python -m pytest tests/ -v --tb=short
    ```
  - Create `tests/conftest.py` (empty or with shared fixtures if needed)
  - Ensure `tests/test_tile_proxy.py` is importable from the test directory
  - **Files modified:** (new) `tests/__init__.py`, (new) `run_tests.sh`, (new) `tests/conftest.py`, (existing, extended) `tests/test_tile_proxy.py`
  - **Verification:** Running `bash run_tests.sh` exits with code 0 and shows at least the tests from T1.1.9 passing

- [ ] **T1.2.5: Update deploy.sh to include new files**
  - Modify `appserver/static/visualizations/maps-plus/scripts/deploy.sh`:
    - Add `bin` to the staging list (the `for dir in appserver default metadata lookups static README bin; do` loop)
    - After copying, strip development-only content from `bin/rest/maps_plus/` — keep only `.py` files, remove any `__pycache__/` directories
  - Update the strip section to also remove `tests/` directory if present (not needed in deployed app)
  - **Files modified:** (existing) `appserver/static/visualizations/maps-plus/scripts/deploy.sh`
  - **Verification:** Run deploy.sh; verify the generated `.tgz` archive contains `bin/rest/maps_plus/tile_proxy.py`, `bin/rest/maps_plus/__init__.py`, `default/restmap.conf`, and `default/settings.json`

### Verification

1. Deploy fresh package to a Splunk instance
2. Check splunkd logs for route registration confirmation from `restmap.conf`
3. Verify settings.json loads correctly by adding diagnostic logging temporarily
4. Test deploy.sh produces correct `.tgz` with all new files
5. Confirm no system-level files are modified — all config is app-scoped under `default/` and `local/`

---

## Plan 1.3: Disk Cache + LRU Pruning (`bin/rest/maps_plus/tile_proxy.py`)

### Overview
Extend the tile proxy with optional on-disk caching for persistent tile storage across Splunk process restarts. The disk cache uses an LRU eviction policy with a configurable size cap (default 500MB). On each write, if total cache size exceeds the cap, the oldest files are removed until under-cap. The implementation must gracefully degrade on Splunk Cloud where `var/run/` is not writable — falling back to memory-only caching with a logged warning.

### Tasks

- [ ] **T1.3.1: Implement disk cache directory management**
  - Add `_get_cache_dir()` function that determines the disk cache path:
    - If config `cache_disk_path` is explicitly set and non-null, use it (with validation — must be absolute path, resolved via `os.path.realpath()`)
    - If null (default), auto-detect: walk up from the handler module's directory to find Splunk home, then construct `$SPLUNK_HOME/var/run/maps_plus/tile_cache/`
    - Create the directory if it does not exist using `os.makedirs(path, exist_ok=True)`
  - Validate that the resolved path is within expected bounds (not outside the app/Splunk installation)
  - Return the cache directory path string
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (disk cache added)
  - **Verification:** On a local Splunk install, `_get_cache_dir()` returns `$SPLUNK_HOME/var/run/maps_plus/tile_cache/`; on Cloud (where var/run is inaccessible), function raises `PermissionError` which will be caught by T1.3.2

- [ ] **T1.3.2: Implement disk cache write with graceful degradation**
  - Add `_disk_cache_set(url, binary_data)` method:
    - Compute cache filename as `hashlib.sha256(url.encode()).hexdigest()[:64]` (SHA-256 prefix to avoid path traversal; max 64 hex chars = standard SHA-256 length)
    - Write binary data to `<cache_dir>/<hash>.bin` using `with open(path, 'wb') as f: f.write(data)` with exclusive write mode (`'xb'`) to prevent overwrites from concurrent writes (edge case in multi-process Splunk)
    - Update an accompanying metadata JSON file `<cache_dir>/<hash>.meta` storing: `{"url": "<resolved_url>", "cached_at": <epoch>}` — needed for LRU ordering on restart
    - On write failure (PermissionError, OSError), log warning with module tag and silently skip disk cache — memory cache continues to function
  - Add `_disk_cache_get(url)` method:
    - Compute hash from URL, check if `<cache_dir>/<hash>.bin` exists
    - If file exists, read binary data; also read metadata for last-accessed timestamp
    - Update metadata timestamp on access
    - Return `(binary_data, metadata)` or `None` on miss
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (disk read/write methods)
  - **Verification:** Write a tile to disk; restart Python process; confirm `_disk_cache_get()` retrieves the same tile from disk using the hash-based lookup

- [ ] **T1.3.3: Implement auto-prune on write**
  - Add `_prune_disk_cache()` method called after every successful disk write:
    - Scan all `.bin` files in cache directory (excluding `.meta` files)
    - Read corresponding `.meta` files to get `cached_at` timestamps
    - If total size of all `.bin` files exceeds `cache_max_size_mb * 1024 * 1024`:
      - Sort cache entries by `cached_at` ascending (oldest first)
      - Remove oldest entries one at a time until total size is under cap
      - Remove both `.bin` and `.meta` files for each evicted entry
    - Log summary: `"Disk cache pruned: removed N files, freed M MB"` at INFO level
  - Handle the case where directory scan fails (empty dir, missing .meta files) gracefully — log warning but don't crash
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (auto-prune logic)
  - **Verification:** Write enough tiles to exceed 500MB cap; confirm oldest tiles are removed until total size is under cap; verify no `.meta` files are orphaned

- [ ] **T1.3.4: Integrate disk cache with GET handler flow**
  - Modify `get()` method flow to check both caches:
    1. Check in-memory LRU cache (`_cache_get(url)`) — fastest path
    2. If miss, check disk cache (`_disk_cache_get(url)`) — persistent path
    3. If still miss, fetch from upstream (`_fetch_tile(url)`) — slowest path
       - After successful fetch, write to both memory LRU and disk cache
    4. On cache hit (memory or disk), set response headers from cached metadata
  - Wire `cache_enabled` config option: if false in settings, skip all cache checks
  - Add `cache_type` handling: if `"memory"`, skip disk cache entirely; if `"disk"`, use both layers
  - **Files modified:** (new) `bin/rest/maps_plus/tile_proxy.py` (integrated flow)
  - **Verification:** Request a tile that exists only on disk (after process restart); confirm it loads from disk and is then also in memory; request a tile not in any cache; confirm upstream fetch and both caches are populated

- [ ] **T1.3.5: Write unit tests for disk cache operations**
  - Add test functions to `tests/test_tile_proxy.py`:
    - Test `_get_cache_dir()` — verify expected path construction
    - Test `_disk_cache_set()` / `_disk_cache_get()` — write/read roundtrip with temporary directory (use `tempfile.TemporaryDirectory()`)
    - Test auto-prune: simulate writing N tiles exceeding cap; verify evicted entries are removed
    - Test graceful degradation: mock `os.makedirs` to raise `PermissionError`; verify handler logs warning and continues with memory-only
    - Test hash collision resistance: two different URLs produce different cache filenames
  - Use `pytest` fixtures for temp directory management and mock Splunk environment
  - **Files modified:** (existing) `tests/test_tile_proxy.py` (extended with disk cache tests)
  - **Verification:** All disk cache tests pass via `python -m pytest tests/ -v`; confirm graceful degradation test verifies memory-only fallback path

### Verification

1. On a local Splunk Enterprise install, enable disk cache and verify tiles persist across Splunk service restarts
2. On Splunk Cloud (no disk write access), verify handler logs warning and falls back to memory-only — no startup crash
3. Simulate exceeding disk cap by writing large tile data; confirm oldest files are pruned automatically
4. Run full test suite: `bash run_tests.sh` — all tests pass including new disk cache tests

---

## Dependencies Between Plans

```
T1.2.4 (Test infrastructure) ──┐
                               │── Required by T1.1.9, T1.3.5
                               │
T1.2.1 (restmap.conf route) ───┼── Recommended before T1.1.6 integration test
                               │
T1.1.2 (_resolve_tile) ────────┬── Required by: T1.1.3, T1.1.4, tests
T1.1.5 (LRU cache) ────────────┼── Required by: T1.1.6, T1.3.4
T1.1.7 (Error handling) ───────┼── Can run parallel with T1.1.4
T1.1.8 (Logging) ──────────────┴── Can run parallel with T1.1.4, T1.1.7
```

**Recommended execution order:**

1. **T1.2.4** (Test infrastructure) — first, so all subsequent tasks can be tested immediately
2. **T1.2.1** (restmap.conf) + **T1.2.5** (deploy.sh update) — parallel with implementation to ensure deployability
3. **T1.1.1** (package structure) — prerequisite for all handler code
4. **T1.1.2** (_resolve_tile) + **T1.1.8** (logging) — parallel, both are self-contained module additions
5. **T1.1.3** (GET handler entry point) — needs T1.1.2 to work with realistic URLs
6. **T1.1.4** (_fetch_tile) + **T1.1.7** (error handling) — parallel, both enhance the fetch path
7. **T1.1.5** (LRU cache) — standalone data structure addition
8. **T1.1.6** (wire cache into handler) — needs T1.1.3, T1.1.4, T1.1.5, T1.1.7
9. **T1.2.2** (default settings.json) + **T1.2.3** (config loading) — parallel with early implementation; can be done after T1.1.1 but before final wiring
10. **T1.1.9** (unit tests for handler logic) — needs test infra (T1.2.4) and handler code (T1.1.6)
11. **T1.3.1** → **T1.3.2** → **T1.3.3** → **T1.3.4** — sequential dependency chain for disk cache
12. **T1.3.5** (disk cache tests) — needs T1.3.4

**Minimum critical path:** T1.2.4 → T1.1.1 → T1.1.2 → T1.1.5 → T1.1.6 → T1.1.7 → T1.1.9 → T1.2.1 → T1.3.1 → T1.3.2 → T1.3.3 → T1.3.4 → T1.3.5
