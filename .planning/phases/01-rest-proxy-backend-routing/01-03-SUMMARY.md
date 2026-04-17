---
phase: 01-rest-proxy-backend-routing
plan: 03
subsystem: python-rest-handler-disk-cache
tags: [python, disk-cache, lru, concurrency, splunk-cloud, atomic-write, path-confinement]
dependency-graph:
  requires:
    - "Plan 01-01: bin/rest/maps_plus/tile_proxy.py::TileProxyHandler, LRUCache, _get_memory_cache"
    - "Plan 01-02: default/settings.json disk_cache_enabled + disk_cache_max_mb keys"
  provides:
    - "bin/rest/maps_plus/tile_proxy.py: DiskCache class"
    - "bin/rest/maps_plus/tile_proxy.py: _get_disk_cache / _reset_disk_cache lazy module-level accessor"
    - "bin/rest/maps_plus/tile_proxy.py: two-tier handle_GET (memory -> disk -> upstream)"
    - "tests/test_tile_proxy.py: 22 new tests across TestDiskCache, TestDiskCacheConcurrency, TestHandleGetTwoTier"
  affects:
    - "Phase 02 (JS client) sees x-maps-plus-cache: disk-hit header on L2 cache hits"
tech-stack:
  added:
    - "Python stdlib: errno, struct, tempfile (tempfile.mkstemp for atomic write)"
  patterns:
    - "Atomic write-then-rename via tempfile.mkstemp + os.replace (POSIX + Win py3.3+)"
    - "Length-prefixed binary file format with 4-byte magic header (MP01) — NOT pickle"
    - "Two-tier cache with L2->L1 promotion on hit, write-through on miss"
    - "Path confinement via cached realpath + Windows UNC-prefix normalization"
    - "LRU eviction by filesystem mtime (os.utime touch on read)"
    - "Lazy module-level singleton with double-checked locking"
key-files:
  created:
    - ".planning/phases/01-rest-proxy-backend-routing/01-03-SUMMARY.md"
  modified:
    - "bin/rest/maps_plus/tile_proxy.py (580 -> 887 lines; +DiskCache +_get_disk_cache +two-tier handle_GET)"
    - "tests/test_tile_proxy.py (524 -> 902 lines; +22 test methods)"
decisions:
  - "Custom length-prefixed binary format with 4-byte magic header (MP01) — never pickle (T3-06 RCE risk)"
  - "Cache realpath(cache_dir) once at __init__ — cheap stable anchor under concurrency (bug fix, see Deviations)"
  - "Strip Windows long-path UNC prefix \\\\?\\ before path-confinement compare (Windows realpath behavior under contention)"
  - "Case-insensitive path compare on Windows (NTFS is case-preserving but case-insensitive)"
  - "Writability probe (.writeprobe tmp file) in addition to os.makedirs — catches tmpfs surfaces that makedirs-succeed-but-open-fails"
  - "Disk-cache singleton injection via tp._disk_cache = cache in tests (simpler than mocking _get_disk_cache lazy init)"
  - "Handler swallows disk.set exceptions — user response never blocked by disk failure (T3-05)"
metrics:
  duration: "~30 minutes (including resumption from interrupted work + concurrency bug hunt)"
  completed: "2026-04-17"
  task_count: 2
  test_count: 71
  test_pass: 71
  test_fail: 0
  handler_lines: 887
  test_lines: 902
  new_tests: 22
  commits: 3
---

# Phase 01 Plan 03: DiskCache with atomic writes, LRU prune, Cloud fallback Summary

Size-capped, atomically-written, LRU-pruned, path-confined, concurrency-safe, Splunk-Cloud-resilient on-disk cache tier added behind the Plan 01-01 memory LRU; `handle_GET` now performs a two-tier lookup with L2→L1 promotion and write-through-to-both on miss.

## What Was Built

**`DiskCache`** class (`bin/rest/maps_plus/tile_proxy.py`, ~280 new lines) implements the Plan 01-03 interface contract verbatim:

```python
class DiskCache(object):
    def __init__(self, cache_dir, max_bytes=500*1024*1024): ...
    def get(self, key) -> tuple | None        # (bytes, ct, cc) or None
    def set(self, key, value) -> None         # atomic; prunes if over cap
    def _path_for(self, key) -> str           # <cache_dir>/<key[:2]>/<key>.tile
    def _assert_within_cache_dir(self, path)  # raises on escape
    def _prune_locked(self)                   # LRU by mtime, size-capped
    enabled: bool                             # False on Cloud read-only FS
```

**File format** (never pickle — T3-06):

```
[magic 4B "MP01"]
[ct_len 4B BE]  [content_type utf8]
[cc_len 4B BE]  [cache_control utf8]
[raw bytes ...]
```

**Two-tier `handle_GET` integration** (replaces the single `_get_memory_cache()` path from Plan 01-01):

1. Memory LRU hit → `x-maps-plus-cache: hit`
2. Memory miss → disk cache lookup → on hit, promote to memory AND return with `x-maps-plus-cache: disk-hit`
3. Disk miss → upstream fetch → write to BOTH tiers (memory always, disk best-effort)
4. Disk set failure is logged-and-swallowed — never blocks the user response

**`_get_disk_cache()` lazy accessor** respects `settings.disk_cache_enabled` (default `false` in fallback, `true` in shipped `default/settings.json`). Path: `$SPLUNK_HOME/var/run/maps_plus/tile_cache/`.

## Must-Haves Verification

| Truth                                                                            | Status |
| -------------------------------------------------------------------------------- | ------ |
| Sha256 sharded paths under $SPLUNK_HOME/var/run/maps_plus/tile_cache/            | PASS (test_sharded_path_by_first_two_hex) |
| Atomic writes via tmp + os.replace — no torn writes                              | PASS (test_atomic_write_no_tmp_leftovers) |
| LRU prune enforces disk_cache_max_mb cap; oldest mtime removed first             | PASS (test_lru_prune_removes_oldest_when_over_cap) |
| threading.Lock serializes set + prune — no race                                  | PASS (3 concurrency tests) |
| PermissionError / EROFS on makedirs → enabled=False, INFO log, handler continues | PASS (test_disabled_on_permission_error, test_disabled_on_readonly_fs_erofs) |
| Handler cache order: memory → disk → upstream; writes populate both              | PASS (test_miss_writes_both_tiers) |
| Path confinement via realpath().startswith(realpath(cache_dir))                  | PASS (test_path_escape_rejected) |
| disk_cache_enabled=false skips disk paths entirely (no side effects)             | PASS (lazy init in _get_disk_cache returns None) |
| Existing Plan 01-01 test suite still passes; 22 new disk-cache tests             | PASS (Ran 71 tests -- OK) |

## Threat Mitigations Implemented (grep-verifiable)

| Threat                     | Mitigation                                                              |
| -------------------------- | ----------------------------------------------------------------------- |
| T3-01 Path traversal       | `_assert_within_cache_dir` realpath prefix check (S-10)                 |
| T3-02 Torn write           | `tempfile.mkstemp` + `os.replace` (A-08)                                |
| T3-03 Concurrency race     | `threading.Lock` serializes set + prune (A-07)                          |
| T3-04 Disk exhaustion      | `_prune_locked` enforces `max_bytes` cap, LRU by mtime                  |
| T3-05 Cloud read-only FS   | `PermissionError` + `errno.EROFS` → `enabled=False` (A-06)              |
| T3-06 Serialization RCE    | Custom length-prefixed binary, 4-byte magic header, NEVER `pickle`      |
| T3-07 Symlink escape       | `realpath` resolves symlinks before the prefix check                    |
| T3-05 safety net (handler) | `handle_GET` swallows `disk.set` exceptions — response never blocked    |

## Audit Findings Addressed

- **A-06** Splunk Cloud fallback: DiskCache sets `enabled=False` on PermissionError OR `errno.EROFS`, logs one INFO, handler continues memory-only.
- **A-07** Concurrency lock: `threading.Lock` held across set + `_prune_locked` + file replace; concurrent tests pass with zero exceptions.
- **A-08** Atomic writes: `tempfile.mkstemp` + `os.replace`; `test_atomic_write_no_tmp_leftovers` confirms no `.tmp` remnants.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Windows UNC long-path prefix breaks realpath prefix check under concurrency**

- **Found during:** Task 2 — `test_concurrent_set_same_key` failed with 2–5 `ValueError('path_escape_detected')` per run.
- **Issue:** On Windows under contention (8 threads racing on `set` of the same key), `os.path.realpath(path)` for a child file occasionally returns the `\\?\C:\...` long-path form while `os.path.realpath(cache_dir)` returns the bare `C:\...` form. The original `real_path.startswith(real_base + os.sep)` check then fails as a false-positive path-escape. Instrumented debug run confirmed this behaviour:
  ```
  real_path: '\\\\?\\C:\\...\\cache\\xx\\xxx...xxx.tile'
  real_base: 'C:\\...\\cache'
  ```
- **Fix:** (a) Cache `self._real_base = os.path.realpath(cache_dir)` once at `__init__` (cheap stable anchor); (b) In `_assert_within_cache_dir`, strip the `\\?\` prefix from both sides on Windows before comparing; (c) case-insensitive compare on Windows (NTFS is case-preserving but case-insensitive).
- **Files modified:** `bin/rest/maps_plus/tile_proxy.py`
- **Commit:** 3cc4395
- **Rationale:** The guard was over-rejecting legitimate paths on Windows under concurrency — would have intermittently poisoned production writes in Splunk's `scripttype=persist` environment (the exact scenario T3-03 was written to catch). Zero exceptions after fix across 160 concurrent writes in `test_concurrent_set_same_key` + `test_concurrent_set_unique_keys` (400 writes) + `test_prune_under_contention` (80 writes with active eviction).

**2. [Rule 2 - Hardening] Writability probe in addition to os.makedirs**

- **Found during:** Task 1 implementation.
- **Issue:** Plan specified only `os.makedirs(cache_dir)` for the Cloud detection path. On some Cloud images `makedirs` succeeds on a tmpfs-like mount but `open()` subsequently fails with permission error. The handler would then mark `enabled=True` but every write would silently log-and-swallow — wasting CPU resolving settings and attempting writes on every request.
- **Fix:** Added a probe in `__init__` — write 2 bytes to `.writeprobe`, delete it. If that fails, `enabled=False` immediately.
- **Files modified:** `bin/rest/maps_plus/tile_proxy.py`
- **Commit:** 38efb42
- **Rationale:** Fails-fast and cleaner log output. No behavior change for correctly-writable directories.

**3. [Rule 2 - Hardening] Wrong-magic-header guard returns None**

- **Found during:** Task 1 implementation (added for defense-in-depth).
- **Issue:** Plan text says "corrupt file → get returns None" but did not specify what happens if the file has a valid length-prefix structure but wrong 4-byte magic (e.g. an older format version or a foreign file dropped into the cache dir).
- **Fix:** `get()` reads the first 4 bytes and compares against `_DISK_CACHE_FORMAT_VERSION` (`b"MP01"`). Mismatch → return None (treated as miss). Test `test_wrong_magic_header_returns_none` covers this.
- **Files modified:** `bin/rest/maps_plus/tile_proxy.py`, `tests/test_tile_proxy.py`
- **Commit:** 38efb42 + 33f2d8c
- **Rationale:** Lets future format versions be deployed with automatic graceful fallback (old files become misses, not exceptions).

## Concurrency Test Observations

- 8 threads × 20 writes on **same key** (160 writes): completes in ~0.1s; final file is always a valid cache entry with exactly 1024 bytes of a single byte value (one thread's last write wins cleanly, never torn).
- 8 threads × 50 unique keys (400 writes, 2KB each): completes in ~0.8s; prune triggered ~200 times; final size ≤ 2 MiB + 8 × 2 KiB slack.
- 4 threads × 20 writes of 10KB with 200KB cap (80 writes under active eviction): completes in ~0.6s; zero `FileNotFoundError` leaks out of `set()` — the `except OSError: continue` guard in `_prune_locked` absorbs the race cleanly.

## Authentication Gates

None encountered.

## Manual Post-Deploy Verification

In a running Splunk container with the app installed and `disk_cache_enabled = true`:

```bash
# 1. First request -> miss, populates both tiers
curl -ku admin:<pw> 'https://localhost:8089/services/maps_plus/tile/proxy' \
  -G --data-urlencode 'url=https://tile.openstreetmap.org/{z}/{x}/{y}.png' \
  --data-urlencode 'z=5' --data-urlencode 'x=5' --data-urlencode 'y=5' \
  -o /tmp/tile.png -D - | grep -i 'x-maps-plus-cache'
# Expected: x-maps-plus-cache: miss

# 2. Second request -> hit (memory)
# Expected: x-maps-plus-cache: hit

# 3. Bounce splunkd, then repeat. With disk cache ON, expect disk-hit.
# Expected: x-maps-plus-cache: disk-hit

# 4. Confirm disk files present
ls $SPLUNK_HOME/var/run/maps_plus/tile_cache/*/  # sharded dirs
```

## Known Gaps / TODOs for Downstream Plans

- **Phase 02 (JS client)** may log the `x-maps-plus-cache` response header for diagnostic tooling but has no hard dependency on disk vs memory distinction.
- **Splunk Cloud** read-only FS path is covered defensively (EROFS + PermissionError); actual verification requires a Cloud deployment, deferred to real-world test.
- **Optional future work:** async prune (trigger only every N sets instead of every set) — current implementation walks the entire cache dir on every set, which is fine for 500MB ≈ 20k files but could become expensive at >100k files. Not a Phase-1 concern.

## Stubs / Data Wiring

No client-facing stubs. No placeholder data. All behaviour is live and exercised by the 71-test suite.

## Phase 01 Completion

All three plans in Phase 01 are complete:

- **Plan 01-01**: REST handler + 4-layer SSRF defense + memory LRU + 49 unit tests (commits d56566f, 213493d, e3f843f)
- **Plan 01-02**: restmap.conf + settings.json + deploy.sh/build_release.sh packaging (commits 2e356e9, b42f8b7, 59de1db)
- **Plan 01-03**: DiskCache + two-tier handle_GET + 22 new tests (commits 38efb42, 3cc4395, 33f2d8c)

**Ready for `/gsd-verify-phase 1`.**

## Self-Check

- `bin/rest/maps_plus/tile_proxy.py` FOUND (887 lines, ≥ 400 target)
- `tests/test_tile_proxy.py` FOUND (902 lines, 71 tests, ≥ 28 target)
- Commit 38efb42 (DiskCache + integration): FOUND in git log
- Commit 3cc4395 (Windows UNC prefix fix): FOUND in git log
- Commit 33f2d8c (disk cache tests): FOUND in git log
- `bash run_tests.sh` → `Ran 71 tests in 4.163s — OK`
- All 13 grep-acceptance checks in the plan: PASS
- `disk cache OK` printed from the plan's inline verify python script: PASS

## Self-Check: PASSED
