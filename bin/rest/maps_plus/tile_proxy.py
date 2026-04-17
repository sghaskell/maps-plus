"""Splunk REST handler - Dashboard Studio tile proxy.

GET /services/maps_plus/tile/proxy?url=<tmpl>&z=<int>&x=<int>&y=<int>&s=<str>&r=<str>
Fetches the resolved upstream tile and streams bytes back with pass-through
Content-Type. SSRF-protected via scheme+host+injection+IP checks.
Stdlib only - no third-party dependencies (PROJECT constraint).

Plan 01-01 of the Dashboard Studio tile proxy phase. Implements:
  - Pure functions: _validate_url, _host_allowed, _resolve_tile,
    _make_cache_key, _fetch_tile
  - LRUCache (thread-safe OrderedDict-backed)
  - No-redirect urllib opener (SSRF defense against redirect chains)
  - TileProxyHandler (subclass of splunk.rest.BaseRestHandler)
  - Lazy settings loader with hardcoded fallback defaults

Plan 01-02 ships default/settings.json + restmap.conf; this module is
resilient when those are absent (fallback defaults below).
Plan 01-03 adds a DiskCache layer behind the in-memory LRU.
"""

import collections
import errno
import hashlib
import ipaddress
import json
import logging
import os
import re
import socket
import struct
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import splunk.persistconn.application

logger = logging.getLogger('splunk.modules.maps_plus.tile_proxy')

# ---------------------------------------------------------------------------
# Module-level constants (Plan 01-03 will import some of these)
# ---------------------------------------------------------------------------

MAX_TILE_BYTES = 512 * 1024              # 512KB response-size cap (T1-03, A-03)
DEFAULT_TIMEOUT_SECONDS = 10             # D-08
DEFAULT_SUBDOMAIN = "a"                  # {s} default
DEFAULT_PIXEL_RATIO = "1"                # {r} default - NOT "" (A-02, Pitfall 5)
DEFAULT_CACHE_CONTROL = "public, max-age=86400"   # D-16
DEFAULT_CACHE_MAX_MEMORY = 256           # LRU entry cap
DEFAULT_DISK_CACHE_MAX_MB = 500          # DS-CL-02 disk LRU cap
_DISK_CACHE_FORMAT_VERSION = b"MP01"     # 4-byte magic header for disk cache files

# Fallback allowlist used when settings.json is missing or unreadable. Plan 01-02
# ships a default/settings.json mirroring this list; keeping in-code defaults
# ensures the handler never fails open (D-02: empty list = deny-all, but we
# never WANT an empty list in practice - we want a sensible OOTB list).
_FALLBACK_ALLOWED_DOMAINS = [
    "tile.openstreetmap.org",
    "*.tile.openstreetmap.org",
    "*.basemaps.cartocdn.com",
    "server.arcgisonline.com",
    "tile.gbif.org",
    "gibs.earthdata.nasa.gov",
    "*.tile.openstreetmap.fr",
    "*.tile.opentopomap.org",
    "tiles.stadiamaps.com",
]

# Injection sequences rejected in the URL and in z/x/y inputs. The tuple is
# checked with a substring match on the full URL before urlparse, so encoded
# variants of newline/null are also caught.
_INJECTION_CHARS = (
    "@", "..", "\n", "\r", "\x00",
    "%00", "%0a", "%0A", "%0d", "%0D",
    "#",
)

_WILDCARD_RE = re.compile(r"^\*\.")

# AWS/GCP/Azure metadata IP - belt-and-suspenders over ip.is_link_local
_METADATA_IP = "169.254.169.254"


# ---------------------------------------------------------------------------
# Settings loader
# ---------------------------------------------------------------------------

_settings_cache = None
_settings_lock = threading.Lock()


def _get_app_dir():
    """Return $SPLUNK_HOME/etc/apps/leaflet_maps_app, or None if SPLUNK_HOME
    is not set (unit test environment)."""
    splunk_home = os.environ.get("SPLUNK_HOME")
    if not splunk_home:
        return None
    return os.path.join(splunk_home, "etc", "apps", "leaflet_maps_app")


def _read_settings_file(path):
    """Return parsed JSON dict, or {} on any error (with a warning log)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, IOError):
        # Expected when a settings file is absent; no log - _load_settings
        # logs once at module init if BOTH default and local are missing.
        return {}
    except (ValueError, TypeError) as exc:
        logger.warning("settings_parse_error path=%s err=%s", path, type(exc).__name__)
        return {}


def _hardcoded_defaults():
    return {
        "enabled": True,
        "allowed_domains": list(_FALLBACK_ALLOWED_DOMAINS),
        "upstream_timeout_seconds": DEFAULT_TIMEOUT_SECONDS,
        "cache_max_memory": DEFAULT_CACHE_MAX_MEMORY,
        "cache_control": DEFAULT_CACHE_CONTROL,
        "disk_cache_enabled": False,
        "disk_cache_max_mb": DEFAULT_DISK_CACHE_MAX_MB,
    }


def _load_settings():
    """Load settings.json, merging default over hardcoded fallback and local over default.

    Reads (in order):
      $SPLUNK_HOME/etc/apps/leaflet_maps_app/default/settings.json  (Plan 01-02 ships)
      $SPLUNK_HOME/etc/apps/leaflet_maps_app/local/settings.json    (user override)

    Cached after first load. Call `_reset_settings_cache()` in tests to force reload.
    """
    global _settings_cache
    if _settings_cache is not None:
        return _settings_cache
    with _settings_lock:
        if _settings_cache is not None:
            return _settings_cache

        merged = _hardcoded_defaults()
        app_dir = _get_app_dir()
        if app_dir:
            default_path = os.path.join(app_dir, "default", "settings.json")
            local_path = os.path.join(app_dir, "local", "settings.json")
            default_data = _read_settings_file(default_path)
            local_data = _read_settings_file(local_path)
            # Navigate to maps_plus.tile_proxy if nested, else use root
            for src in (default_data, local_data):
                if isinstance(src, dict):
                    node = src.get("maps_plus", {}).get("tile_proxy", src)
                    if isinstance(node, dict):
                        for k in ("enabled", "allowed_domains",
                                  "upstream_timeout_seconds",
                                  "cache_max_memory", "cache_control",
                                  "disk_cache_enabled", "disk_cache_max_mb"):
                            if k in node:
                                merged[k] = node[k]
        _settings_cache = merged
        return _settings_cache


def _reset_settings_cache():
    """Test helper - forces next _load_settings() to re-read disk."""
    global _settings_cache
    with _settings_lock:
        _settings_cache = None


# ---------------------------------------------------------------------------
# Pure function: host allowlist matcher
# ---------------------------------------------------------------------------

def _host_allowed(host, allowed_domains):
    """Leftmost-wildcard matcher.

    '*.foo.com' matches 'a.foo.com', 'x.y.foo.com', and bare 'foo.com'.
    Empty allowed_domains = deny-all (D-02).
    Case-insensitive on both sides.
    """
    host = (host or "").lower()
    if not host:
        return False
    for pattern in (allowed_domains or []):
        p = (pattern or "").lower()
        if not p:
            continue
        if _WILDCARD_RE.match(p):
            suffix = p[2:]   # strip leading "*."
            if not suffix:
                continue
            if host == suffix or host.endswith("." + suffix):
                return True
        elif host == p:
            return True
    return False


# ---------------------------------------------------------------------------
# Pure function: URL validation (SSRF defense)
# ---------------------------------------------------------------------------

def _validate_url(url, allowed_domains):
    """Return (True, None) on success; (False, short_code) on failure.

    Error codes:
      scheme_not_https, invalid_chars, host_not_allowed,
      dns_failed, invalid_ip, private_ip_blocked

    4-layer defense (S-01..S-04):
      1. Scheme must be exactly 'https'
      2. Reject injection chars in full URL (before urlparse)
      3. Host allowlist with leftmost-wildcard (empty = deny-all)
      4. DNS resolve + reject any loopback/private/link-local/reserved/multicast
         IP, plus explicit 169.254.169.254 cloud metadata check
    """
    if not isinstance(url, str) or not url:
        return False, "invalid_chars"

    # Layer 2 (injection chars) - check on full URL BEFORE urlparse to catch
    # embedded nulls/newlines/userinfo-syntax (@) before parsing can normalize
    for bad in _INJECTION_CHARS:
        if bad in url:
            return False, "invalid_chars"

    # Layer 1 (scheme)
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False, "invalid_chars"
    if parsed.scheme != "https":
        return False, "scheme_not_https"

    # Layer 3 (host allowlist)
    host = (parsed.hostname or "").lower()
    if not host:
        return False, "host_not_allowed"
    if not _host_allowed(host, allowed_domains):
        return False, "host_not_allowed"

    # Layer 4 (DNS + private-IP block)
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, OSError):
        return False, "dns_failed"

    for info in infos:
        try:
            ip_str = info[4][0]
        except (IndexError, TypeError):
            continue
        try:
            ip = ipaddress.ip_address(ip_str)
        except (ValueError, TypeError):
            return False, "invalid_ip"
        if (ip.is_loopback or ip.is_private or ip.is_link_local
                or ip.is_reserved or ip.is_multicast
                or str(ip) == _METADATA_IP):
            return False, "private_ip_blocked"

    return True, None


# ---------------------------------------------------------------------------
# Pure function: template resolution
# ---------------------------------------------------------------------------

def _check_zxy_value(name, val):
    """Raise ValueError if val is not a non-negative integer string (no
    injection chars). Returns the int value."""
    sv = str(val)
    for bad in _INJECTION_CHARS:
        if bad in sv:
            raise ValueError("invalid_chars_in_" + name)
    # Also reject raw whitespace/control that isn't in the injection tuple
    if any(c in sv for c in (" ", "\t", "/")):
        raise ValueError("invalid_chars_in_" + name)
    try:
        iv = int(sv)
    except (TypeError, ValueError):
        raise ValueError("not_integer_" + name)
    if iv < 0:
        raise ValueError("negative_" + name)
    return iv


def _resolve_tile(template, z, x, y, s=DEFAULT_SUBDOMAIN, r=DEFAULT_PIXEL_RATIO):
    """Substitute {z}/{x}/{y}/{s}/{r} literally.

    NO auto-swap of {x} and {y} based on URL content (audit A-07). Esri's
    /{z}/{y}/{x} convention is respected by the template itself - the server
    does not rewrite it.

    Raises ValueError if z/x/y are not coercible to non-negative integers
    OR contain any of: @ # .. \\n \\r \\x00 space tab /.
    """
    if not isinstance(template, str):
        raise ValueError("template_not_string")

    iz = _check_zxy_value("z", z)
    ix = _check_zxy_value("x", x)
    iy = _check_zxy_value("y", y)

    s_val = str(s) if s else DEFAULT_SUBDOMAIN
    r_val = str(r) if r else DEFAULT_PIXEL_RATIO

    resolved = (template
                .replace("{z}", str(iz))
                .replace("{x}", str(ix))
                .replace("{y}", str(iy))
                .replace("{s}", s_val)
                .replace("{r}", r_val))
    return resolved


# ---------------------------------------------------------------------------
# Pure function: cache key
# ---------------------------------------------------------------------------

def _make_cache_key(resolved_url):
    """SHA-256 hex digest of normalized URL (lowercase scheme+host).

    Returns full 64 hex chars, no truncation (A-11). Keys are opaque so
    path-traversal chars in the input URL can never escape a cache dir
    (T1-05).
    """
    p = urllib.parse.urlparse(resolved_url)
    normalized = urllib.parse.urlunparse((
        p.scheme.lower(),
        p.netloc.lower(),
        p.path,
        p.params,
        p.query,
        "",
    ))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# No-redirect opener (SSRF defense T1-04)
# ---------------------------------------------------------------------------

class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Disables all redirects. An allowlisted host could otherwise 302 to an
    internal IP, bypassing our allowlist check (Pitfall 4)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

    # Explicit method overrides so all 3xx codes become HTTPError at open time.
    def http_error_301(self, req, fp, code, msg, headers):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)

    http_error_302 = http_error_301
    http_error_303 = http_error_301
    http_error_307 = http_error_301
    http_error_308 = http_error_301


_opener = urllib.request.build_opener(_NoRedirectHandler())


# ---------------------------------------------------------------------------
# Pure function: upstream fetch
# ---------------------------------------------------------------------------

def _fetch_tile(resolved_url, timeout_seconds=DEFAULT_TIMEOUT_SECONDS):
    """Fetch an upstream tile.

    Returns (data: bytes, content_type: str, cache_control: str).

    Raises:
      urllib.error.HTTPError (e.g. 403, 429, 5xx) - caller maps to 502
      urllib.error.URLError / socket.timeout - caller maps to 504
      ValueError('upstream_response_too_large') - response exceeded 512KB
    """
    req = urllib.request.Request(
        resolved_url,
        headers={"User-Agent": "SplunkMapsPlus/1.0 tile-proxy"},
    )
    with _opener.open(req, timeout=timeout_seconds) as resp:
        # Size cap - read MAX+1 and reject if exceeded (S-06)
        data = resp.read(MAX_TILE_BYTES + 1)
        if len(data) > MAX_TILE_BYTES:
            raise ValueError("upstream_response_too_large")

        headers = resp.headers
        ct = headers.get("content-type", "application/octet-stream")
        cc = headers.get("cache-control", DEFAULT_CACHE_CONTROL)
        return data, ct, cc


# ---------------------------------------------------------------------------
# LRUCache - thread-safe, OrderedDict-backed (D-10)
# ---------------------------------------------------------------------------

class LRUCache(object):
    """Bounded LRU cache. Eviction by count, not memory. Thread-safe under
    scripttype=persist which may dispatch requests on multiple threads."""

    def __init__(self, maxsize=DEFAULT_CACHE_MAX_MEMORY):
        if maxsize < 1:
            raise ValueError("maxsize_must_be_positive")
        self._cache = collections.OrderedDict()
        self._maxsize = maxsize
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            if key not in self._cache:
                return None
            self._cache.move_to_end(key)
            return self._cache[key]

    def set(self, key, value):
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = value
            while len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)

    def __len__(self):
        with self._lock:
            return len(self._cache)

    def clear(self):
        with self._lock:
            self._cache.clear()


# Lazy module-level cache instance. Plan 01-03 may wrap this with a disk tier.
_memory_cache = None
_memory_cache_lock = threading.Lock()


def _get_memory_cache():
    global _memory_cache
    if _memory_cache is None:
        with _memory_cache_lock:
            if _memory_cache is None:
                maxsize = _load_settings().get("cache_max_memory",
                                               DEFAULT_CACHE_MAX_MEMORY)
                try:
                    _memory_cache = LRUCache(maxsize=int(maxsize))
                except (TypeError, ValueError):
                    _memory_cache = LRUCache(maxsize=DEFAULT_CACHE_MAX_MEMORY)
    return _memory_cache


def _reset_memory_cache():
    """Test helper - clears the module-level cache instance."""
    global _memory_cache
    with _memory_cache_lock:
        _memory_cache = None


# ---------------------------------------------------------------------------
# DiskCache (Plan 01-03) - size-capped, atomic-write, LRU-pruned, path-confined,
# concurrency-safe, Cloud-resilient on-disk cache.
# ---------------------------------------------------------------------------

class DiskCache(object):
    """Size-capped, atomically-written, path-confined LRU disk cache.

    File format:
        [magic 4B]
        [ct_len 4B BE]  [content_type utf8]
        [cc_len 4B BE]  [cache_control utf8]
        [data ... raw bytes]

    Cache path: <cache_dir>/<key[:2]>/<key>.tile  (sharded by first 2 hex chars)

    Key threat mitigations:
      - T3-01 PathTraversal: _assert_within_cache_dir via realpath check (S-10).
      - T3-02 TornWrite:     tempfile.mkstemp + os.replace (atomic).
      - T3-03 ConcurrencyRace: single threading.Lock around set + prune.
      - T3-04 DiskExhaustion: _prune_locked enforces max_bytes cap via LRU mtime.
      - T3-05 CloudFilesystem: PermissionError / EROFS on makedirs -> enabled=False.
      - T3-06 SerializationFormat: custom length-prefixed binary - no pickle.
    """

    def __init__(self, cache_dir, max_bytes=DEFAULT_DISK_CACHE_MAX_MB * 1024 * 1024):
        self.cache_dir = cache_dir
        self.max_bytes = int(max_bytes)
        self._lock = threading.Lock()
        self.enabled = False
        # Cache the resolved base once. realpath() on Windows can be expensive
        # and, under high concurrency with creating/deleting files in the same
        # directory, can occasionally return case-inconsistent results. We
        # resolve once at init so _assert_within_cache_dir has a stable anchor.
        self._real_base = None
        try:
            os.makedirs(cache_dir, exist_ok=True)
            # Write+delete a probe to confirm the dir is actually writable
            # (on some Cloud images makedirs succeeds on a tmpfs but open fails).
            probe = os.path.join(cache_dir, ".writeprobe")
            with open(probe, "wb") as f:
                f.write(b"ok")
            try:
                os.remove(probe)
            except OSError:
                pass
            self._real_base = os.path.realpath(cache_dir)
            self.enabled = True
        except PermissionError as e:
            logger.info("disk_cache_disabled_permission dir=%s err=%s",
                        cache_dir, type(e).__name__)
            self.enabled = False
        except OSError as e:
            if getattr(e, "errno", None) == errno.EROFS:
                logger.info("disk_cache_disabled_readonly_fs dir=%s", cache_dir)
            else:
                logger.info("disk_cache_disabled reason=%s dir=%s",
                            type(e).__name__, cache_dir)
            self.enabled = False

    # ---- path helpers ----

    def _path_for(self, key):
        # key is an opaque 64-hex SHA-256 digest from _make_cache_key; we
        # still shard by first 2 hex chars to cap dir entry counts.
        return os.path.join(self.cache_dir, key[:2], key + ".tile")

    def _assert_within_cache_dir(self, path):
        """Raise ValueError if path, after realpath(), escapes cache_dir.

        Defense-in-depth for T3-01 / S-10. realpath resolves symlinks so an
        attacker who plants a symlink inside cache_dir cannot escape.

        Uses the base realpath cached at __init__ time so concurrent
        filesystem activity does not disturb the check. On Windows two
        realpath nuances are handled:
          - UNC long-path prefix '\\\\?\\' may be prepended by Python when a
            sibling file is being created/replaced concurrently; normalize it.
          - NTFS is case-insensitive but case-preserving; compare casefold.
        """
        real_path = os.path.realpath(path)
        real_base = self._real_base or os.path.realpath(self.cache_dir)
        if os.name == "nt":
            # Strip Windows long-path prefix if present so \\?\C:\x matches C:\x
            if real_path.startswith("\\\\?\\"):
                real_path = real_path[4:]
            if real_base.startswith("\\\\?\\"):
                real_base = real_base[4:]
            rp_cmp = real_path.lower()
            rb_cmp = real_base.lower()
        else:
            rp_cmp = real_path
            rb_cmp = real_base
        if not (rp_cmp == rb_cmp
                or rp_cmp.startswith(rb_cmp + os.sep)):
            raise ValueError("path_escape_detected")

    # ---- public API ----

    def get(self, key):
        """Return (bytes, content_type, cache_control) or None on miss/error.

        Updates file mtime on hit (LRU touch). Corrupt files return None
        rather than raising (graceful degradation). IOError / OSError also
        degrade to None - the cache is an optimization, never a hard
        dependency.
        """
        if not self.enabled:
            return None
        path = self._path_for(key)
        try:
            self._assert_within_cache_dir(path)
            with open(path, "rb") as f:
                header = f.read(4)
                if header != _DISK_CACHE_FORMAT_VERSION:
                    return None
                ct_len_bytes = f.read(4)
                if len(ct_len_bytes) < 4:
                    return None
                ct_len = struct.unpack(">I", ct_len_bytes)[0]
                if ct_len > 256:
                    return None
                content_type = f.read(ct_len).decode("utf-8", "replace")
                cc_len_bytes = f.read(4)
                if len(cc_len_bytes) < 4:
                    return None
                cc_len = struct.unpack(">I", cc_len_bytes)[0]
                if cc_len > 256:
                    return None
                cache_control = f.read(cc_len).decode("utf-8", "replace")
                data = f.read(MAX_TILE_BYTES + 1)
                if len(data) > MAX_TILE_BYTES:
                    return None
            # LRU touch - best-effort; ignore errors
            try:
                now = time.time()
                os.utime(path, (now, now))
            except OSError:
                pass
            return (data, content_type, cache_control)
        except (FileNotFoundError, IsADirectoryError, ValueError):
            return None
        except OSError:
            return None

    def set(self, key, value):
        """Atomically write value=(bytes, content_type, cache_control).

        Uses tempfile.mkstemp + os.replace for torn-write safety (T3-02).
        Prunes LRU to stay under max_bytes (T3-04). Never raises on disk
        failure - caller sees logged warning, response continues (T3-05).
        """
        if not self.enabled:
            return
        data, content_type, cache_control = value
        if not isinstance(data, bytes):
            raise TypeError("data_must_be_bytes")
        ct_bytes = (content_type or "application/octet-stream").encode("utf-8")[:256]
        cc_bytes = (cache_control or DEFAULT_CACHE_CONTROL).encode("utf-8")[:256]
        path = self._path_for(key)
        # Raise for path-traversal BEFORE the lock/write - cheap check, and
        # we never want to create dirs for an escape-attempting key.
        self._assert_within_cache_dir(path)
        with self._lock:
            try:
                subdir = os.path.dirname(path)
                os.makedirs(subdir, exist_ok=True)
                # Write to a unique tmp file in the SAME dir then atomic replace
                # (same-dir is required for os.replace to be atomic on Windows).
                tmp_fd, tmp_path = tempfile.mkstemp(
                    prefix=".tmp_", suffix=".tile", dir=subdir)
                try:
                    with os.fdopen(tmp_fd, "wb") as f:
                        f.write(_DISK_CACHE_FORMAT_VERSION)
                        f.write(struct.pack(">I", len(ct_bytes)))
                        f.write(ct_bytes)
                        f.write(struct.pack(">I", len(cc_bytes)))
                        f.write(cc_bytes)
                        f.write(data)
                        f.flush()
                        try:
                            os.fsync(f.fileno())
                        except OSError:
                            pass
                    os.replace(tmp_path, path)   # atomic (POSIX + Win py3.3+)
                except Exception:
                    # Clean up orphan tmp; don't hide the original exception
                    try:
                        os.remove(tmp_path)
                    except OSError:
                        pass
                    raise
                self._prune_locked()
            except (PermissionError, OSError) as e:
                logger.warning("disk_cache_set_failed key=%s err=%s",
                               key[:8], type(e).__name__)

    def _prune_locked(self):
        """Caller must hold self._lock. Removes oldest-mtime files until
        total size <= self.max_bytes. LRU by filesystem mtime."""
        entries = []
        total = 0
        try:
            for root, _dirs, files in os.walk(self.cache_dir):
                for name in files:
                    if not name.endswith(".tile"):
                        continue
                    p = os.path.join(root, name)
                    try:
                        st = os.stat(p)
                    except OSError:
                        continue
                    entries.append((st.st_mtime, st.st_size, p))
                    total += st.st_size
        except OSError:
            return
        if total <= self.max_bytes:
            return
        entries.sort()   # ascending mtime = oldest first
        for _mtime, size, p in entries:
            if total <= self.max_bytes:
                break
            try:
                os.remove(p)
                total -= size
            except OSError:
                continue


# Lazy module-level disk cache instance. None means "not yet constructed or
# disk_cache_enabled=False in settings".
_disk_cache = None
_disk_cache_init_lock = threading.Lock()


def _get_disk_cache():
    """Return module-level DiskCache, or None if disk caching is disabled.

    Lazy-init so unit tests that don't touch disk never create a cache dir.
    """
    global _disk_cache
    if _disk_cache is not None:
        return _disk_cache
    with _disk_cache_init_lock:
        if _disk_cache is not None:
            return _disk_cache
        settings = _load_settings()
        if not settings.get("disk_cache_enabled", False):
            return None
        splunk_home = os.environ.get("SPLUNK_HOME", ".")
        cache_dir = os.path.join(
            splunk_home, "var", "run", "maps_plus", "tile_cache")
        max_mb = settings.get("disk_cache_max_mb", DEFAULT_DISK_CACHE_MAX_MB)
        try:
            max_bytes = int(max_mb) * 1024 * 1024
        except (TypeError, ValueError):
            max_bytes = DEFAULT_DISK_CACHE_MAX_MB * 1024 * 1024
        _disk_cache = DiskCache(cache_dir, max_bytes=max_bytes)
        return _disk_cache


def _reset_disk_cache():
    """Test helper - clears the module-level disk cache instance."""
    global _disk_cache
    with _disk_cache_init_lock:
        _disk_cache = None


# ---------------------------------------------------------------------------
# Response builder - adapter between our orchestration logic and the
# persistent-handler return-dict contract. Mimics the old
# handler.response.setStatus/setHeader/write surface so the existing
# orchestration sequence stays intact and unit-testable.
# ---------------------------------------------------------------------------

class _ResponseBuilder(object):
    """Collects status, headers, and body bytes for a single response."""

    def __init__(self):
        self.status = 200
        self.headers = {}
        self._body = b""

    def setStatus(self, code):
        self.status = int(code)

    def setHeader(self, name, value):
        # Header names are compared case-insensitively; normalize to lower.
        self.headers[str(name).lower()] = str(value)

    def write(self, data):
        if data is None:
            return
        if isinstance(data, bytes):
            self._body += data
        else:
            self._body += str(data).encode("utf-8")

    @property
    def body(self):
        return self._body

    def to_persist_response(self):
        """Return the dict shape expected by
        splunk.persistconn.application.PersistentServerConnectionApplication.handle:
            {'payload': str, 'status': int, 'headers': dict}

        `payload` MUST be JSON-serializable (i.e. a string) — bytes cause
        splunkd to drop the key and log 'JSON reply had no payload value'
        (UAT-3). For binary responses (PNG tiles), we latin-1 decode first,
        which losslessly maps each byte 0x00-0xFF to a single-codepoint Unicode
        str. Whether splunkd writes that str back as the original bytes on
        the HTTP wire depends on its internal response encoder; verified
        empirically in UAT-3 retest.
        """
        body = self._body
        if isinstance(body, bytes):
            body = body.decode("latin-1")
        return {
            "payload": body,
            "status": self.status,
            "headers": dict(self.headers),
        }


# ---------------------------------------------------------------------------
# Error response helpers
# ---------------------------------------------------------------------------

def _write_json_error(builder, status, short_code):
    """Uniform sanitized error response (T1-11, D-13).

    Body is always {"error":"<short_code>"} - never echoes upstream body or
    exception stringification. Content-Type set to application/json.
    """
    body = json.dumps({"error": short_code}).encode("utf-8")
    builder.setStatus(status)
    builder.setHeader("content-type", "application/json")
    builder.setHeader("cache-control", "no-store")
    builder.write(body)


def _host_for_log(resolved_url):
    """Extract hostname for structured logging - never log full URL to avoid
    leaking query-string secrets a user may have added to local settings."""
    try:
        return urllib.parse.urlparse(resolved_url).hostname or "?"
    except Exception:
        return "?"


# ---------------------------------------------------------------------------
# Request parsing (persistent-handler contract)
# ---------------------------------------------------------------------------

def _parse_query(query):
    """Normalize the persistent-handler 'query' field into a flat {k: v} dict.

    Splunk delivers query params as a list of [key, value] pairs. We collapse
    to a dict preserving the LAST value per key (Splunk's convention for
    /services/... GETs). Accepts dict input too, for flexibility under test.
    """
    out = {}
    if query is None:
        return out
    if isinstance(query, dict):
        for k, v in query.items():
            out[str(k)] = v if v is None else str(v)
        return out
    if isinstance(query, (list, tuple)):
        for pair in query:
            if not pair:
                continue
            if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                out[str(pair[0])] = (pair[1] if pair[1] is None
                                     else str(pair[1]))
            elif isinstance(pair, (list, tuple)) and len(pair) == 1:
                out[str(pair[0])] = ""
    return out


def _handle_get_internal(builder, args):
    """Run the tile-proxy GET orchestration, writing into `builder`.

    `args` is a flat {name: str-or-None} dict (output of _parse_query).
    This function mirrors the pre-refactor handle_GET body exactly, but
    against a _ResponseBuilder instead of self.response, so the persistent-
    handler dispatcher can convert the result to the required dict shape.
    """
    # 1. Load settings (cached).
    settings = _load_settings()

    # 2. Enabled check (A-09, T1-09).
    if not settings.get("enabled", True):
        _write_json_error(builder, 503, "proxy_disabled")
        return

    # 3. Required query params.
    url_tmpl = args.get("url")
    z = args.get("z")
    x = args.get("x")
    y = args.get("y")
    s = args.get("s")
    r = args.get("r")

    if not url_tmpl:
        _write_json_error(builder, 400, "missing_param_url")
        return
    if z is None or x is None or y is None:
        _write_json_error(builder, 400, "missing_param_zxy")
        return

    # 4. Resolve template (injection checks inside _resolve_tile).
    try:
        resolved = _resolve_tile(url_tmpl, z, x, y, s=s, r=r)
    except ValueError:
        _write_json_error(builder, 400, "invalid_params")
        return

    # 5. Validate the resolved URL (SSRF defense).
    ok, err = _validate_url(resolved, settings.get("allowed_domains", []))
    if not ok:
        _write_json_error(builder, 400, err or "invalid_url")
        return

    # 6. Cache lookup - two-tier (memory LRU -> disk LRU -> upstream).
    key = _make_cache_key(resolved)
    cache = _get_memory_cache()
    cached = cache.get(key)
    if cached is not None:
        data, ct, cc = cached
        builder.setStatus(200)
        builder.setHeader("content-type", ct)
        builder.setHeader("cache-control", cc)
        builder.setHeader("x-maps-plus-cache", "hit")
        builder.write(data)
        return

    # 6b. Disk cache (L2). Promotes to memory on hit.
    disk = _get_disk_cache()
    if disk is not None and disk.enabled:
        try:
            disk_hit = disk.get(key)
        except Exception:
            logger.exception("disk_cache_get_raised")
            disk_hit = None
        if disk_hit is not None:
            data, ct, cc = disk_hit
            try:
                cache.set(key, (data, ct, cc))  # L2 -> L1 promote
            except Exception:
                logger.exception("memory_cache_promote_failed")
            builder.setStatus(200)
            builder.setHeader("content-type", ct)
            builder.setHeader("cache-control", cc)
            builder.setHeader("x-maps-plus-cache", "disk-hit")
            builder.write(data)
            return

    # 7. Upstream fetch (timeout-bounded, size-capped, no-redirect).
    timeout = int(settings.get("upstream_timeout_seconds",
                               DEFAULT_TIMEOUT_SECONDS))
    try:
        data, ct, cc = _fetch_tile(resolved, timeout_seconds=timeout)
    except urllib.error.HTTPError as e:
        logger.warning("upstream_http_error code=%s host=%s",
                       getattr(e, "code", "?"), _host_for_log(resolved))
        _write_json_error(builder, 502, "upstream_error")
        return
    except (socket.timeout, urllib.error.URLError):
        logger.warning("upstream_timeout host=%s", _host_for_log(resolved))
        _write_json_error(builder, 504, "upstream_timeout")
        return
    except ValueError as e:
        # Size cap or other sanitized validation error from _fetch_tile
        code = str(e) if str(e) in ("upstream_response_too_large",) \
            else "upstream_error"
        logger.warning("upstream_oversize host=%s", _host_for_log(resolved))
        _write_json_error(builder, 502, "upstream_oversize"
                          if code == "upstream_response_too_large"
                          else "upstream_error")
        return
    except Exception:
        logger.exception("unexpected_error host=%s", _host_for_log(resolved))
        _write_json_error(builder, 500, "internal_error")
        return

    # 8. Populate cache - both tiers. Disk write is best-effort; any
    # failure is logged and swallowed so the user response is never
    # blocked by a disk problem (T3-05 safety net).
    try:
        cache.set(key, (data, ct, cc))
    except Exception:
        # Cache failure must never break the response path.
        logger.exception("cache_set_error")

    if disk is not None and disk.enabled:
        try:
            disk.set(key, (data, ct, cc))
        except Exception as e:
            logger.warning("disk_cache_set_raised err=%s",
                           type(e).__name__)

    # 9. Write success response. Bytes pass-through (T1-10 Pitfall 2).
    builder.setStatus(200)
    builder.setHeader("content-type", ct)
    builder.setHeader("cache-control", cc)
    builder.setHeader("x-maps-plus-cache", "miss")
    builder.write(data)


# ---------------------------------------------------------------------------
# REST handler - persistent-connection dispatcher
# ---------------------------------------------------------------------------

class TileProxyHandler(
        splunk.persistconn.application.PersistentServerConnectionApplication):
    """Splunk persistent REST handler for /services/maps_plus/tile/proxy.

    Contract (Splunk 9.x):
      - splunkd invokes TileProxyHandler(command_line, command_arg) once per
        long-running process worker.
      - splunkd then calls handle(in_string) for each inbound request, where
        in_string is JSON-encoded with keys: method, path_info, query,
        headers, payload, session, connection, etc.
      - handle() MUST return a dict {'payload', 'status', 'headers'}.

    restmap.conf stanza uses `scripttype = persist` (see default/restmap.conf).
    Inheriting from BaseRestHandler here is WRONG under that stanza - splunkd
    emits "No class implements PersistentServerConnectionApplication" at
    request time (UAT-1 gap-closure, discovered during phase 01 testing).

    All orchestration logic lives in _handle_get_internal() so unit tests can
    drive it directly with a _ResponseBuilder, and the handle() dispatcher
    itself stays thin and easy to reason about.
    """

    def __init__(self, command_line=None, command_arg=None):
        # Two-arg constructor required by the persistent-handler framework —
        # splunkd invokes TileProxyHandler(command_line, command_arg). But the
        # base class's own __init__ takes no args; forwarding them raises
        # "takes 1 positional argument but 3 were given" at first request.
        super(TileProxyHandler, self).__init__()
        self._command_line = command_line
        self._command_arg = command_arg

    def handle(self, in_string):
        # 1. Parse the request envelope.
        try:
            request = (in_string if isinstance(in_string, dict)
                       else json.loads(in_string))
        except (ValueError, TypeError):
            builder = _ResponseBuilder()
            _write_json_error(builder, 400, "invalid_request")
            return builder.to_persist_response()

        method = str(request.get("method", "GET")).upper()

        # 2. Dispatch. Only GET is supported; everything else is 405 so an
        # attacker cannot trigger side effects via POST/PUT/DELETE paths.
        builder = _ResponseBuilder()
        if method == "GET":
            args = _parse_query(request.get("query"))
            try:
                _handle_get_internal(builder, args)
            except Exception:
                # Defense in depth - no orchestration path should raise, but
                # if one does, the user sees a sanitized 500 rather than a
                # traceback-shaped payload (T1-11).
                logger.exception("handle_get_unhandled_exception")
                # Reset any partial state on the builder
                builder = _ResponseBuilder()
                _write_json_error(builder, 500, "internal_error")
        else:
            _write_json_error(builder, 405, "method_not_allowed")

        return builder.to_persist_response()
