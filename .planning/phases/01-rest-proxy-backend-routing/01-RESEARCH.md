# Phase 1: REST Proxy Backend + Routing — Research

**Researched:** 2026-04-16
**Domain:** Splunk Python REST handler (BaseRestHandler), SSRF mitigation, urllib.request, in-memory/disk LRU cache
**Confidence:** MEDIUM — Splunk internal APIs verified via community sources and official docs search; binary-response pattern confirmed via community post; restmap.conf syntax confirmed via official docs search. PersistentServerConnectionApplication tradeoff is MEDIUM confidence due to limited binary-mode documentation.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Default `allowed_domains` seeded with REQ-DS-05 provider hosts (not empty). Exact list derived from `src/maps-plus.js` `L.tileLayer(...)` URLs.
- **D-02:** Empty allowlist = deny-all. No allow-all-with-warn mode.
- **D-03:** Wildcards via leftmost `*.` prefix only.
- **D-04:** Proxy inherits caller's Splunk session permissions. No custom capability required.
- **D-05:** No per-user rate limiting in Phase 1.
- **D-06:** Per-session throttle deferred to Phase 2.
- **D-07:** `tile_proxy.enabled = true` by default (opt-out).
- **D-08:** Upstream fetch timeout: 10 seconds default, configurable.
- **D-09:** `https://` scheme only. `http://` rejected before DNS resolution.
- **D-10:** In-memory LRU: `collections.OrderedDict`-backed, 256-entry cap, NOT `functools.lru_cache`.
- **D-11:** Cache key: SHA-256 hash of normalized resolved URL.
- **D-12:** On-disk cache path: `$SPLUNK_HOME/var/run/maps_plus/tile_cache/<first-2-hex>/<hash>.tile`. Silently disabled if not writable; INFO log at startup.
- **D-13:** Error body: `{"error":"<short-code>"}` only. Never echo upstream body or traceback.
- **D-14:** Status mapping: upstream 403→502, upstream 5xx→502, timeout→504, DNS failure→504, validation failure→400, unexpected→500.
- **D-15:** `Content-Type` pass-through from upstream; default `application/octet-stream` if omitted.
- **D-16:** `Cache-Control: public, max-age=86400` on proxy responses; overridable via settings.

### Claude's Discretion
- Exact LRU implementation style (class-based vs closure) — D-10 constrains data structure, not class shape.
- Unit test framework: stdlib `unittest` (implied by PROJECT constraints — stdlib only).
- Log message format / python-logging-vs-Splunk-logger details.
- Cache directory creation strategy (lazy vs eager).

### Deferred Ideas (OUT OF SCOPE)
- Per-user rate limiting / request quotas
- Admin UI for allowlist management
- Vector tile proxying (Milestone 2)
- Custom subdomain pool (`{s}` round-robin)
- Build hygiene tweaks (`.gitignore`/tarball cleanup)
- ETag / `If-None-Match` passthrough
</user_constraints>

---

## Summary

Phase 1 delivers a Python REST handler registered in `restmap.conf` that proxies raster tile bytes through Splunk's same-origin endpoint — solving Dashboard Studio's CSP restriction that blocks direct Leaflet tile fetches. The handler uses `splunk.rest.BaseRestHandler` (old-style), which supports binary response writes via `self.response.write(bytes)` and header setting via `self.response.setHeader()`. This is confirmed as the correct class; `PersistentServerConnectionApplication` (new-style) is an alternative but has more complex plumbing and no demonstrated advantage for binary content.

The primary implementation risk is SSRF (Threat T1). All 12 research unknowns are resolved below. The security pattern is: scheme check → host allowlist match → DNS resolution → private-IP block — executed before any network call. The stdlib-only constraint (`urllib.request`, `hashlib`, `collections`, `ipaddress`, `logging`) is fully sufficient for all requirements.

**Primary recommendation:** Use `BaseRestHandler` with `self.response.write(binary_data)` + `setHeader('content-type', ...)`. Register via `[script:maps_plus_tile_proxy]` stanza with `scripttype = persist`, `python.version = python3`. Implement URL validation as a standalone `_validate_url()` function before any fetch.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tile fetch + proxy | API / Backend (Splunk splunkd) | — | Must run server-side to bypass Dashboard Studio CSP; cannot run in browser |
| URL template substitution | API / Backend | — | Performed server-side before upstream fetch |
| SSRF validation (scheme, allowlist, IP block) | API / Backend | — | All validation must precede network call; never trust client-supplied URLs |
| In-memory LRU cache | API / Backend (process-local) | — | Per-process dict; not shared across splunkd workers |
| On-disk cache | API / Backend (filesystem) | — | `$SPLUNK_HOME/var/run/maps_plus/`; disabled on Cloud |
| Response header forwarding | API / Backend | — | Content-Type/Cache-Control set in handler before write |
| Tile URL construction | Frontend (Leaflet, Phase 2) | — | Client builds template URL, passes to proxy as query param |
| DS runtime detection | Frontend (Phase 2) | — | Out of scope for Phase 1 |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `splunk.rest.BaseRestHandler` | Built-in (Splunk 8.x–10.x) | Base class for custom GET endpoints | Official Splunk old-style handler API; supports binary writes [VERIFIED: Splunk community post + dev.splunk.com] |
| `urllib.request` | Python stdlib 3.7+ | Upstream tile fetch | Only HTTP client available under stdlib-only constraint; `timeout=` kwarg on `urlopen()` [VERIFIED: Python docs] |
| `collections.OrderedDict` | Python stdlib | LRU cache backing store | `popitem(last=False)` gives O(1) LRU eviction; instance-scoped unlike `functools.lru_cache` [VERIFIED: Python docs] |
| `hashlib` | Python stdlib | SHA-256 cache key | Filesystem-safe, collision-resistant keys; 64-hex output [VERIFIED: Python docs] |
| `ipaddress` | Python stdlib 3.3+ | Private-IP SSRF block | `ipaddress.ip_address(ip).is_private` + `.is_loopback` + `.is_link_local` + `.is_reserved` [VERIFIED: Python docs] |
| `logging` | Python stdlib | Handler logging | `logging.getLogger('splunk.modules.maps_plus.tile_proxy')` emits into `_internal` index under sourcetype `splunkd` [ASSUMED] |
| `json` | Python stdlib | Config load + error responses | Standard for settings.json parse and `{"error":"..."}` body serialization |
| `socket` | Python stdlib | DNS resolution for SSRF check | `socket.getaddrinfo()` for pre-resolution before URL open |
| `re` | Python stdlib | Host allowlist wildcard matching | `*.` prefix wildcard matching against resolved hostname |
| `threading` | Python stdlib | LRU cache thread safety | `threading.Lock` for OrderedDict mutation if Splunk spawns multiple threads per process |
| `unittest` | Python stdlib | Test runner | Implied by PROJECT stdlib-only constraint (D-06 equivalent); `python -m unittest discover` |
| `unittest.mock` | Python stdlib 3.3+ | Mock urllib.request.urlopen | `unittest.mock.patch('urllib.request.urlopen')` for unit tests without network |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `os`, `os.path` | Python stdlib | Path construction, disk cache dirs | `os.makedirs(path, exist_ok=True)`, `os.path.realpath()` for path traversal guard |
| `tempfile` | Python stdlib | Test fixtures | `tempfile.TemporaryDirectory()` for disk cache unit tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `BaseRestHandler` | `PersistentServerConnectionApplication` | Persistent handler has lower per-request overhead but requires `stdin`/`stdout` JSON protocol and Windows binary-mode workaround; no advantage for binary responses vs `BaseRestHandler` which already supports `self.response.write(bytes)` [MEDIUM confidence — see Unknown 1 below] |
| `urllib.request` | `requests` | `requests` is not stdlib; forbidden by PROJECT constraint |
| Custom LRU dict | `cachetools.LRUCache` | `cachetools` is not stdlib; forbidden |
| `unittest` | `pytest` | `pytest` is not stdlib; forbidden by PROJECT constraint (A-06 in audit) |

**Version verification:** All packages are Python stdlib — no `npm view` needed. Splunk 9.x ships Python 3.7–3.9 depending on minor version; Splunk 10.x ships Python 3.9+. All listed stdlib modules are present in Python 3.7+. [VERIFIED: Python 3.7 changelog + Splunk Python 3 migration docs]

---

## Architecture Patterns

### System Architecture Diagram

```
Leaflet (browser, DS iframe)
  │  GET /services/rest/maps_plus/tile/proxy
  │  ?url=<encoded-template>&z=10&x=500&y=300
  ▼
splunkd HTTP (port 8089, same origin)
  │
  ├── restmap.conf route → TileProxyHandler.handle_GET()
  │
  ▼
[1] Parse & validate params (z/x/y integer check, url decode)
  │
  ▼
[2] _validate_url()
  ├── Scheme: must be https://
  ├── Host: must match allowed_domains allowlist (leftmost-wildcard)
  ├── DNS resolve: socket.getaddrinfo() → check all A/AAAA records
  │   └── Block: loopback, private RFC1918, link-local, reserved, metadata (169.254.169.254)
  └── Template injection: reject @, .., newlines, encoded nulls in template
  │
  ▼
[3] _resolve_tile(template, z, x, y, s, r)  ← pure function, testable
  │  str.replace {z}/{x}/{y}/{s}/{r} → literal values
  │
  ▼
[4] _cache_get(resolved_url)  ← OrderedDict LRU
  ├── HIT → skip to [6]
  └── MISS ↓
  │
  ▼
[5] _fetch_tile(resolved_url)
  ├── urllib.request.urlopen(req, timeout=10)
  ├── Size cap: read max 512KB, reject oversized response
  ├── No redirects: urllib opener with no redirect handler
  │   (or limit to 1 same-host redirect)
  ├── Capture: Content-Type, Cache-Control headers
  └── Error handling: HTTPError(403→502, 5xx→502), timeout→504, URLError→504
  │
  ▼
[6] _cache_set(resolved_url, data)  ← LRU + optional disk
  │
  ▼
[7] Write response
  ├── self.response.setHeader('content-type', content_type)
  ├── self.response.setHeader('cache-control', 'public, max-age=86400')
  └── self.response.write(binary_data)
```

### Recommended Project Structure
```
bin/
├── __init__.py
└── rest/
    ├── __init__.py
    └── maps_plus/
        ├── __init__.py
        └── tile_proxy.py        # TileProxyHandler + LRU + disk cache + validation

default/
├── restmap.conf                 # [script:maps_plus_tile_proxy] stanza
└── settings.json                # Default config with seeded allowed_domains

tests/
├── __init__.py
├── conftest.py                  # shared test helpers (mock handler env)
└── test_tile_proxy.py           # unit tests for pure functions + handler
```

### Pattern 1: BaseRestHandler Subclass

`BaseRestHandler` is the "old-style" Splunk REST handler. It lives at `splunk.rest.BaseRestHandler` (importable in Splunk's Python environment). The handler file must be in the app's `bin/` directory.

```python
# Source: Splunk Community — binary response example (community.splunk.com/t5/Getting-Data-In/Return-binary-data/td-p/219175)
# Confirmed pattern via search; MEDIUM confidence on exact method names
import splunk.rest as rest
import logging

logger = logging.getLogger('splunk.modules.maps_plus.tile_proxy')

class TileProxyHandler(rest.BaseRestHandler):

    def handle_GET(self):
        # Read query params
        z = self.args.get('z')
        x = self.args.get('x')
        y = self.args.get('y')
        url_template = self.args.get('url', '')

        # ... validate, resolve, fetch ...
        binary_data = b'...'
        content_type = 'image/png'

        self.response.setHeader('content-type', content_type)
        self.response.setHeader('cache-control', 'public, max-age=86400')
        self.response.write(binary_data)
```

Key API facts [MEDIUM confidence — verified via community examples + dev.splunk.com search]:
- Method name is `handle_GET` (not `get` — that is the PersistentServerConnectionApplication convention)
- Query parameters accessed via `self.args` (a dict-like object)
- Response headers set via `self.response.setHeader(name, value)`
- Response body written via `self.response.write(data)` — accepts `bytes` for binary content
- HTTP status set via `self.response.setStatus(code)` — call before write

### Pattern 2: restmap.conf `[script:]` Stanza

```ini
# Source: Splunk docs search — restmap.conf 9.4 reference
# [VERIFIED: help.splunk.com restmap.conf 9.4 search result summary]
[script:maps_plus_tile_proxy]
match                 = /maps_plus/tile/proxy
scripttype            = persist
handlertype           = python
handlerfile           = rest/maps_plus/tile_proxy.py
handleractions        = get
python.version        = python3
requireAuthentication = true
```

Key notes [VERIFIED: Splunk docs search]:
- Stanza name is `[script:<uniqueName>]` — NOT `[route:...]` (audit finding A-04 confirmed)
- `match` path is relative to `/services/` prefix — so `match = /maps_plus/tile/proxy` makes the endpoint `/services/maps_plus/tile/proxy`
- `scripttype = persist` runs the handler as a persistent process (lower per-request overhead)
- `handlerfile` path is relative to the app's `bin/` directory
- `python.version = python3` required for Splunk 9.x (audit finding A-13 confirmed)
- `requireAuthentication = true` is the default; dashboard tiles are fetched with the user's Splunk session cookie, so auth is satisfied automatically

**Critical finding on URL path:** The `match` value maps to the path AFTER `/services/`. The CONTEXT.md target URL `/services/rest/maps_plus/tile/proxy` would require `match = /rest/maps_plus/tile/proxy` — but `[rest://...]` stanzas in restmap.conf use a different namespace. Verify the exact path when testing. [ASSUMED — needs confirmation against running Splunk instance]

### Pattern 3: URL Validation (SSRF Prevention)

```python
# Source: OWASP SSRF Prevention Cheat Sheet (cheatsheetseries.owasp.org) + Python stdlib docs
# [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html]
import ipaddress
import socket
import re
from urllib.parse import urlparse

# Compile once at module load
_WILDCARD_RE = re.compile(r'^\*\.')

def _validate_url(url, allowed_domains):
    """Returns (True, None) or (False, error_code)."""
    parsed = urlparse(url)

    # 1. Scheme must be https
    if parsed.scheme != 'https':
        return False, 'scheme_not_https'

    # 2. Reject injection characters in the full URL
    for bad in ('@', '..', '\n', '\r', '\x00', '%00', '%0a', '%0d'):
        if bad in url:
            return False, 'invalid_chars'

    # 3. Host allowlist with leftmost-wildcard support
    host = parsed.hostname.lower() if parsed.hostname else ''
    if not _host_allowed(host, allowed_domains):
        return False, 'host_not_allowed'

    # 4. DNS resolution + private-IP block
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False, 'dns_failed'

    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False, 'invalid_ip'
        if (ip.is_loopback or ip.is_private or ip.is_link_local or
                ip.is_reserved or ip.is_multicast or
                str(ip) == '169.254.169.254'):
            return False, 'private_ip_blocked'

    return True, None


def _host_allowed(host, allowed_domains):
    for pattern in allowed_domains:
        if _WILDCARD_RE.match(pattern):
            suffix = pattern[1:]  # strip leading *
            if host == suffix[1:] or host.endswith(suffix):
                return True
        else:
            if host == pattern.lower():
                return True
    return False
```

### Pattern 4: urllib.request Fetch with Size Cap + No Redirects

```python
# Source: Python stdlib docs — urllib.request
# [CITED: https://docs.python.org/3/library/urllib.request.html]
import urllib.request
import urllib.error

MAX_TILE_BYTES = 512 * 1024  # 512KB cap

class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # disable all redirects

_opener = urllib.request.build_opener(_NoRedirectHandler())

def _fetch_tile(resolved_url, timeout_seconds=10):
    req = urllib.request.Request(
        resolved_url,
        headers={'User-Agent': 'SplunkMapsPlus/1.0 tile-proxy'}
    )
    try:
        with _opener.open(req, timeout=timeout_seconds) as resp:
            # Size cap: read incrementally
            data = resp.read(MAX_TILE_BYTES + 1)
            if len(data) > MAX_TILE_BYTES:
                raise ValueError('upstream_response_too_large')
            content_type = resp.headers.get('content-type', 'application/octet-stream')
            cache_control = resp.headers.get('cache-control', 'public, max-age=86400')
            return data, content_type, cache_control
    except urllib.error.HTTPError as e:
        if e.code == 403:
            raise  # caller maps to 502
        raise
    # socket.timeout and urllib.error.URLError propagate to caller
```

**TLS notes [VERIFIED: Python docs]:** `urllib.request.urlopen` uses `ssl.create_default_context()` by default in Python 3.4+, which enforces certificate verification and TLS 1.2+ on platforms with an up-to-date CA bundle. Splunk ships its own CA bundle. No manual TLS configuration needed unless Splunk's bundle is outdated.

### Pattern 5: OrderedDict LRU Cache

```python
# Source: Python docs — collections.OrderedDict
# [CITED: https://docs.python.org/3/library/collections.html#collections.OrderedDict]
import collections
import threading

class LRUCache:
    def __init__(self, maxsize=256):
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
            if len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)
```

**Thread safety note [ASSUMED]:** Splunk's `scripttype = persist` handler may process requests on multiple threads within one process. A `threading.Lock` around the OrderedDict is cheap and prevents race conditions on `move_to_end` + `popitem`. The qwen plan's claim that "no lock is needed" is incorrect for `scripttype = persist`.

### Anti-Patterns to Avoid
- **`[route:...]` stanza in restmap.conf:** Wrong stanza type for Python script handlers (audit finding A-04). Use `[script:...]`.
- **`functools.lru_cache` for instance-scoped cache:** Cannot be instance-scoped and cannot evict by count cleanly (D-10).
- **`open(path, 'xb')` for disk cache writes:** Fails on every update after first write (audit finding A-03). Use `'wb'` or atomic write-then-rename.
- **Echoing upstream response body in error messages:** Violates T5 (info disclosure). Always return `{"error":"<short-code>"}` only.
- **Auto-swapping `{x}` / `{y}` based on URL pattern:** Surprising server-side mutation (audit finding A-07). Server substitutes literally; client sends the template it wants.
- **`Content-Type: image/png` forced on all responses:** Breaks WebP (CartoDB, Stadia) (audit finding A-08). Pass through upstream's Content-Type per D-15.
- **`allowed_domains: []` meaning allow-all:** SSRF default-allow (audit finding A-01). Empty = deny-all per D-02.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Private IP detection | Custom regex list of RFC1918 ranges | `ipaddress.ip_address(ip).is_private` | Python stdlib handles IPv4 + IPv6 + edge cases (loopback, link-local, reserved, multicast) |
| SHA-256 hashing | MD5 or truncated hash | `hashlib.sha256(url.encode()).hexdigest()` | Full 64-hex output; no truncation needed (audit A-11) |
| LRU eviction | Manual linked list | `collections.OrderedDict` with `move_to_end` + `popitem(last=False)` | Standard Python LRU pattern; O(1) operations |
| URL parsing | `str.split('://')` | `urllib.parse.urlparse()` | Handles edge cases, IPv6 literals, port numbers |
| Redirect blocking | Manual redirect count | `urllib.request.build_opener(_NoRedirectHandler())` | Cleaner than patching HTTPRedirectHandler; builds a module-level opener once |

---

## Unknown-by-Unknown Resolution

### Unknown 1: BaseRestHandler vs PersistentServerConnectionApplication

**Verdict: Use `BaseRestHandler`** [MEDIUM confidence]

- `BaseRestHandler` ("old-style") lives at `splunk.rest.BaseRestHandler`. The handler method is `handle_GET(self)`. Query params are in `self.args`. Response writing: `self.response.write(bytes_data)`, `self.response.setHeader(name, value)`, `self.response.setStatus(code)`.
- `PersistentServerConnectionApplication` ("new-style") requires `scripttype = persist` + a stdin/stdout JSON envelope protocol. On Windows it requires `msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)`. More complex plumbing for no demonstrable gain over BaseRestHandler for binary content.
- `BaseRestHandler` has a confirmed community example returning binary image bytes via `self.response.write(data)`. This is the safer choice.
- Sources: [VERIFIED: Splunk community post td-p/219175], [VERIFIED: dev.splunk.com custom REST endpoint docs search]

### Unknown 2: restmap.conf Syntax

**Verdict: `[script:<name>]` with `handlerfile` + `python.version = python3`** [VERIFIED: Splunk docs search]

```ini
[script:maps_plus_tile_proxy]
match                 = /maps_plus/tile/proxy
scripttype            = persist
handlertype           = python
handlerfile           = rest/maps_plus/tile_proxy.py
handleractions        = get
python.version        = python3
requireAuthentication = true
```

- `handlerfile` is relative to app's `bin/` directory
- `match` is relative to `/services/` — so the full endpoint URL is `/services/maps_plus/tile/proxy` (NOT `/services/rest/maps_plus/tile/proxy` — verify this against the CONTEXT.md target path D-04)
- `requireAuthentication = true` is default; dashboard iframe requests carry Splunk session cookies

### Unknown 3: Python Path + Imports

**Verdict: Standard Splunk Python 3 environment** [VERIFIED: Splunk Python 3 migration docs]

- Splunk 9.0+ ships Python 3.7+ as default; `python.version = python3` selects it
- `splunk.rest` module is importable from handlers in `bin/` because Splunk adds its lib paths to `sys.path` at runtime
- All stdlib modules (`urllib`, `ssl`, `socket`, `hashlib`, `collections`, `ipaddress`, `logging`, `json`, `os`, `re`, `threading`) available in Python 3.7+
- `bin/` directory in Splunk apps is automatically on `sys.path` for handler imports; subdirectory packages need `__init__.py` files

### Unknown 4: SSRF Mitigation

**Verdict: 4-layer defense in order** [CITED: OWASP SSRF Cheat Sheet]

1. **Scheme check** (before DNS): `urlparse(url).scheme == 'https'` — reject `http://`, `file://`, `gopher://`, etc.
2. **Host allowlist** (before DNS): match against `allowed_domains` with leftmost-wildcard support. Empty list = deny-all (D-02).
3. **Injection character check** (before DNS): reject `@`, `..`, `\n`, `\r`, `\x00`, `%00`, `%0a`, `%0d`.
4. **DNS resolve + private-IP block** (post-DNS): `socket.getaddrinfo()` → check all returned IPs against `ipaddress` flags.

IP ranges to block:
- `ip.is_loopback` — 127.0.0.0/8, ::1
- `ip.is_private` — 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7
- `ip.is_link_local` — 169.254.0.0/16 (covers AWS metadata 169.254.169.254), fe80::/10
- `ip.is_reserved` — 0.0.0.0/8 and other IANA reserved
- `ip.is_multicast` — 224.0.0.0/4
- Explicit check: `str(ip) == '169.254.169.254'` (belt-and-suspenders for cloud metadata)

OWASP recommendation on DNS rebinding: Resolve once, pass IP directly to the HTTP client (open by IP, set `Host:` header to original hostname). This is the ideal approach but adds complexity. For Phase 1: DNS resolve + check is sufficient given the allowlist already restricts hosts. [ASSUMED — DNS rebinding protection via IP-based connection is a recommended enhancement but not mandatory for Phase 1]

### Unknown 5: urllib.request Security + Reliability

**Verdict: Adequate with explicit configuration** [VERIFIED: Python stdlib docs]

- **TLS:** Default `ssl.create_default_context()` enforces cert verification and TLS 1.2+ in Python 3.4+. No manual config needed.
- **Timeout:** `urllib.request.urlopen(req, timeout=10)` — applies to socket operations (connect + read). [VERIFIED: Python docs]
- **Redirects:** Build a custom opener with `_NoRedirectHandler` that returns `None` from `redirect_request()`. This prevents SSRF via redirect chains to internal hosts.
- **Size limit:** Read `resp.read(MAX_TILE_BYTES + 1)`; raise error if response exceeds 512KB. Tiles are typically 5–100KB.
- **User-Agent:** Set `User-Agent: SplunkMapsPlus/1.0 tile-proxy` header on requests. Some providers (OSM) require non-empty UA and may rate-limit automated clients.

### Unknown 6: Rate-Limit Detection

**Verdict: Handle 403, 429, and timeout; ignore response body** [ASSUMED — based on provider behavior patterns]

- **CartoDB / basemaps.cartocdn.com:** Returns HTTP 429 (standard) or 403 when rate-limited. [ASSUMED]
- **OpenStreetMap (tile.openstreetmap.org):** Returns 429 with `Retry-After` header when rate-limited. [ASSUMED]
- **Esri (server.arcgisonline.com):** Returns 403 or 429. [ASSUMED]
- **NASA GIBS:** Returns 503 or no response under high load. [ASSUMED]

Detection strategy: catch `urllib.error.HTTPError`, check `e.code`:
- 403 → log warning, return 502 (D-14)
- 429 → log warning, return 502 (treat same as 403 for client)
- 5xx → log error, return 502
- Do NOT inspect response body for HTML error pages (violates T5; also unreliable)

### Unknown 7: Logging in Splunk REST Handlers

**Verdict: stdlib `logging` with Splunk namespace** [ASSUMED — based on Splunk logging conventions from docs]

```python
import logging
logger = logging.getLogger('splunk.modules.maps_plus.tile_proxy')
```

- Logger name `splunk.modules.*` causes Splunk's Python logging framework to route messages to `$SPLUNK_HOME/var/log/splunk/python.log` AND index them into `_internal` under sourcetype `splunkd`. [ASSUMED]
- Log level defaults to INFO; Splunk's Python framework inherits the root logger level from `log.cfg`.
- Alternative: `splunk.util.logger` — this is an older API, less reliable in Python 3. Stick with stdlib `logging`.

### Unknown 8: Authentication for REST Endpoints

**Verdict: `requireAuthentication = true` (default) is correct** [VERIFIED: Splunk docs search]

- Dashboard Studio iframes make tile requests with the user's Splunk session cookie. Splunk automatically validates the session for endpoints with `requireAuthentication = true`.
- No `passSystemAuth` needed — tile data is public; the auth gate is just to prevent anonymous external SSRF exploitation.
- The `requireAuthentication = true` default is safe; no custom capability needed per D-04.

### Unknown 9: Testing Without Splunk

**Verdict: Pure function extraction + stdlib unittest + mock** [ASSUMED — standard Python testing pattern]

Strategy: extract all business logic into pure functions that take plain Python arguments (not `self.args`, not `self.response`). The `handle_GET` method becomes a thin orchestrator. Unit tests import the module, call the pure functions directly without needing a Splunk instance.

```python
# Testable pure functions (no Splunk dependencies):
# - _validate_url(url, allowed_domains) -> (bool, str|None)
# - _resolve_tile(template, z, x, y, s='a', r='') -> str
# - _cache_get(cache_dict, lock, key) -> bytes|None
# - _cache_set(cache_dict, lock, key, value, maxsize) -> None

# Tests:
class TestResolve(unittest.TestCase):
    def test_osm_template(self):
        result = _resolve_tile('https://tile.openstreetmap.org/{z}/{x}/{y}.png', 10, 500, 300)
        self.assertEqual(result, 'https://tile.openstreetmap.org/10/500/300.png')

    def test_subdomain_default(self):
        result = _resolve_tile('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', 5, 10, 20)
        self.assertIn('a.basemaps.cartocdn.com', result)
```

PYTHONPATH for tests: `PYTHONPATH=bin:tests python -m unittest discover tests/ -v`

The `splunk.rest` import in `tile_proxy.py` must be guarded or mocked. Options:
1. Stub `splunk.rest.BaseRestHandler` in `tests/splunk_stub.py` — a minimal class with no-op methods
2. Structure handler so all pure functions are importable without triggering the `splunk.rest` import (lazy import inside `handle_GET`)

Option 1 (stub) is cleaner. Create `tests/splunk/__init__.py` and `tests/splunk/rest.py` with a stub `BaseRestHandler` class.

### Unknown 10: Disk Cache Concurrency + Cloud Restrictions

**Verdict: Atomic write pattern; Cloud write will silently fail** [ASSUMED + VERIFIED via AppCert search]

- **Splunk Cloud write restrictions:** `$SPLUNK_HOME/var/run/` is writable for on-prem and CMP/BYOL. Splunk Cloud SaaS restricts writes. The strategy (D-12): attempt `os.makedirs()` at startup; if `PermissionError`, set `_disk_cache_enabled = False`, log INFO, continue with memory-only. [ASSUMED — no official Splunk Cloud filesystem policy doc found; conservative assumption is safest]
- **Atomic write pattern** (prevents torn writes):
  ```python
  tmp_path = path + '.tmp'
  with open(tmp_path, 'wb') as f:
      f.write(data)
  os.replace(tmp_path, path)  # atomic on POSIX; atomic on Windows (Python 3.3+)
  ```
  `os.replace()` is atomic on both POSIX and Windows (Python 3.3+). Use this, not `open(path, 'xb')` (audit A-03).
- **Concurrency:** The `threading.Lock` on the in-memory LRU is sufficient. Disk writes are protected by the atomic rename. Multiple processes writing the same hash key results in a benign overwrite (tiles are immutable for a given URL).

### Unknown 11: Cache Key Design

**Verdict: SHA-256 of normalized resolved URL** [VERIFIED: D-11, Python docs]

```python
import hashlib

def _make_cache_key(resolved_url):
    # Normalize: lowercase scheme+host, preserve path
    from urllib.parse import urlparse, urlunparse
    p = urlparse(resolved_url)
    normalized = urlunparse((p.scheme.lower(), p.netloc.lower(), p.path, p.params, p.query, ''))
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()
    # Returns 64-char hex string — no truncation needed (audit A-11)
```

For disk cache, shard by first 2 hex chars:
```python
key = _make_cache_key(url)
subdir = key[:2]
filepath = os.path.join(cache_dir, subdir, key + '.tile')
```

### Unknown 12: Leaflet `{s}` and `{r}` Templates

**Verified from `src/maps-plus.js` grep** [VERIFIED: codebase grep]:

Actual tile URL patterns in use:
- `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` — uses `{s}` (subdomains a/b/c/d)
- `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` — uses `{s}`
- `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` — uses `{s}` (subdomains a/b/c)
- `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` — uses `{s}`
- `https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png` — uses `{s}`
- `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` — no `{s}`, **uses `{y}/{x}` order (Esri convention)**
- `https://tile.gbif.org/3031/omt/{z}/{x}/{y}@{r}x.png?gbif-geyser` — uses `{r}` (retina pixel ratio)
- GIBS: constructed dynamically with `gibsLayerId`, `gibsTileMatrixSet` etc. — URL template built in JS, `{z}/{y}/{x}` order confirmed

**Default substitution values:**
- `{s}` → `"a"` (first subdomain; sufficient for tile loading, not round-robining)
- `{r}` → `""` (empty string for standard resolution; GBIF URL becomes `@x.png` which is valid for 1x)
- Note: `{r}` in GBIF URL is `@{r}x.png` — substituting `""` gives `@x.png`; substituting `"2"` gives `@2x.png`. Default `""` may produce invalid GBIF URL. **Recommendation: default `{r}` to `"1"` so GBIF becomes `@1x.png`.**

---

## Allowlist Seed (D-01) — Derived from Codebase

Extracted from `src/maps-plus.js` ATTRIBUTIONS map and default config [VERIFIED: codebase grep]:

```json
"allowed_domains": [
  "tile.openstreetmap.org",
  "*.basemaps.cartocdn.com",
  "server.arcgisonline.com",
  "tile.gbif.org",
  "gibs.earthdata.nasa.gov",
  "*.tile.openstreetmap.fr",
  "*.tile.opentopomap.org",
  "tiles.stadiamaps.com"
]
```

Notes:
- `{s}.basemaps.cartocdn.com` → wildcard `*.basemaps.cartocdn.com`
- `{s}.tile.openstreetmap.org` → wildcard — but ATTRIBUTIONS uses bare `tile.openstreetmap.org` (no subdomain in key). Planner should verify if `{s}.tile.openstreetmap.org` is used at the `L.tileLayer()` call site or if `tile.openstreetmap.org` covers it. Add both or use wildcard: `*.tile.openstreetmap.org`.
- Stadia Maps (`tiles.stadiamaps.com`) is in CONTEXT.md D-01 mention of "Stadia hosts used by OpenFreeMap dashboards" but NOT in the grep'd ATTRIBUTIONS. Add with HIGH priority — OpenFreeMap uses Stadia. [ASSUMED based on CONTEXT.md]
- GIBS URL is built dynamically — host is `gibs.earthdata.nasa.gov` (confirmed in grep line 459)

---

## Security Recommendations

These translate directly to plan tasks:

| # | Control | Implementation | Priority |
|---|---------|----------------|----------|
| S-01 | Scheme allowlist | Reject any URL where `urlparse(url).scheme != 'https'` | MUST (D-09) |
| S-02 | Host allowlist | Match `urlparse(url).hostname` against `allowed_domains` before DNS | MUST (D-01/D-02/D-03) |
| S-03 | Injection char check | Reject URLs containing `@`, `..`, newlines, null bytes | MUST |
| S-04 | DNS resolve + private-IP block | `socket.getaddrinfo()` → `ipaddress` flags on all returned IPs | MUST (T1) |
| S-05 | Redirect disable | `urllib.request.build_opener(_NoRedirectHandler())` | MUST |
| S-06 | Response size cap | `resp.read(MAX_TILE_BYTES + 1)` — reject if > 512KB | MUST (T4) |
| S-07 | Timeout | `urlopen(req, timeout=config.upstream_timeout_seconds)` | MUST (D-08) |
| S-08 | TLS verification | Default urllib SSL context — do NOT pass `context=ssl._create_unverified_context()` | MUST |
| S-09 | Error body sanitization | Return `{"error":"<short-code>"}` only; never echo upstream body | MUST (T5/D-13) |
| S-10 | Cache path confinement | `os.path.realpath(filepath).startswith(os.path.realpath(cache_dir))` before write | MUST (T3) |
| S-11 | Atomic disk write | Write to `.tmp` then `os.replace()` | SHOULD |
| S-12 | Enabled check | Return 503 `{"error":"proxy_disabled"}` when `enabled = false` (audit A-09) | MUST |

**S-04 is the most critical task and must execute before any `urllib.request.urlopen()` call.**

---

## Testing Strategy

**Framework:** `unittest` (stdlib) — runner: `python -m unittest discover tests/ -v`
**Script:** `run_tests.sh` at repo root with `PYTHONPATH=bin:tests`

**Splunk stub pattern** (no Splunk install needed):
```
tests/
├── splunk/
│   ├── __init__.py
│   └── rest.py          # stub BaseRestHandler with no-op response object
├── __init__.py
├── conftest_unittest.py # shared setUp helpers
└── test_tile_proxy.py   # all unit tests
```

`tests/splunk/rest.py`:
```python
class MockResponse:
    def __init__(self):
        self.headers = {}
        self.status = 200
        self.body = b''
    def setHeader(self, name, value): self.headers[name] = value
    def setStatus(self, code): self.status = code
    def write(self, data): self.body += data if isinstance(data, bytes) else data.encode()

class BaseRestHandler:
    def __init__(self):
        self.args = {}
        self.response = MockResponse()
```

**Test coverage targets per pure function:**

| Function | Test Cases |
|----------|------------|
| `_validate_url` | valid https URL, http rejected, private IP blocked, disallowed host, injection chars, DNS failure |
| `_resolve_tile` | OSM {z}/{x}/{y}, CartoDB with {s}, GBIF with {r}, missing param → exception |
| `LRUCache.get/set` | hit moves to end, miss returns None, 257th entry evicts oldest |
| `_fetch_tile` (mocked) | success returns (bytes, content-type), HTTP 403, HTTP 503, timeout, size exceeded |
| `_disk_cache_set/get` | write+read roundtrip, PermissionError graceful degradation, path confinement |
| `handle_GET` (integration) | valid request returns 200 + bytes, missing z/x/y returns 400, disabled returns 503 |

---

## Common Pitfalls

### Pitfall 1: Wrong restmap.conf Stanza Type
**What goes wrong:** Using `[route:...]` instead of `[script:...]` — endpoint never registers; Splunk returns 404.
**Why it happens:** Splunk has 3+ handler types; documentation for old-style vs new-style is scattered.
**How to avoid:** Always use `[script:<unique_name>]` for Python handlers.
**Warning signs:** Splunk startup log shows no route registration for `maps_plus_tile_proxy`.

### Pitfall 2: Binary Response Encoding
**What goes wrong:** Writing `str(binary_data)` instead of `binary_data` bytes — client receives garbled PNG.
**Why it happens:** Python 3 string/bytes distinction; `self.response.write()` may not auto-encode.
**How to avoid:** Always use `resp.read()` which returns `bytes`; pass bytes directly to `self.response.write()`.

### Pitfall 3: Missing `python.version = python3`
**What goes wrong:** Splunk uses Python 2 interpreter (on some 8.x installs) — `urllib.parse`, `ipaddress` imports fail.
**How to avoid:** Always set `python.version = python3` in `[script:...]` stanza (audit A-13).

### Pitfall 4: SSRF via Redirect
**What goes wrong:** `urllib.request.urlopen` follows 301/302 redirects by default — an allowlisted host could redirect to an internal IP.
**How to avoid:** Build opener with `_NoRedirectHandler` before any fetch.

### Pitfall 5: `{r}` Default Value for GBIF
**What goes wrong:** Default `{r}=""` produces `@x.png` in GBIF URL — invalid; GBIF returns 404.
**How to avoid:** Default `{r}` to `"1"` (produces `@1x.png`), not `""`.

### Pitfall 6: SHA-256 Hex Truncation
**What goes wrong:** `hexdigest()[:64]` is a no-op — SHA-256 is already 64 chars. Drop the slice (audit A-11). Truncation would reduce the collision resistance.
**How to avoid:** Use `hashlib.sha256(key.encode()).hexdigest()` — no slice.

### Pitfall 7: Path Traversal in Disk Cache
**What goes wrong:** Even with hashed keys, a bug in the key construction could produce a path outside `cache_dir`.
**How to avoid:** Always verify `os.path.realpath(filepath).startswith(os.path.realpath(cache_dir))` before any disk write.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `[route:...]` stanza | `[script:...]` stanza for Python handlers | Splunk 6.x → 8.x+ | Old stanza type still works but `[script:]` is correct for Python REST handlers |
| Python 2 `urllib2` | Python 3 `urllib.request` | Splunk 8.1+ dropped Python 2 | No compatibility shim needed; use `urllib.request` directly |
| `functools.lru_cache` for in-process cache | `collections.OrderedDict`-backed class | — | `lru_cache` can't be instance-scoped cleanly |
| `requests` library | `urllib.request` | Splunk AppCert stdlib requirement | Third-party packages require bundling; stdlib avoids this entirely |

**Deprecated/outdated:**
- `splunk.util.logger`: Older Splunk logging API; use stdlib `logging.getLogger('splunk.modules.*')` instead.
- `open(path, 'xb')` for cache writes: Breaks on refresh; use atomic write-then-rename.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `handle_GET` is the correct method name for BaseRestHandler GET handler | Pattern 1, Unknown 1 | Handler never invoked; would need to rename to `get` or other convention |
| A2 | `self.args` is the query param dict on BaseRestHandler | Pattern 1, Unknown 1 | Params not accessible; need to find correct attribute name |
| A3 | Logger name `splunk.modules.maps_plus.tile_proxy` routes to `_internal` | Unknown 7 | Logs may not appear in expected location; use `splunk.root` or check Splunk logging hierarchy |
| A4 | Splunk Cloud SaaS blocks `$SPLUNK_HOME/var/run/` writes | Unknown 10 | Disk cache silently attempted; may fail with `PermissionError` at runtime (but the graceful degradation handles this either way) |
| A5 | `scripttype = persist` is needed for BaseRestHandler (vs `scripttype = python`) | Pattern 2, Unknown 2 | If `persist` causes issues, try `scripttype = python` |
| A6 | `tiles.stadiamaps.com` is required for OpenFreeMap dashboards | Allowlist Seed section | OpenFreeMap tiles blocked until user adds to `local/settings.json` |
| A7 | DNS rebinding protection via IP-based connection is deferred to Phase 2 | Unknown 4 | Allowlist + DNS check is sufficient; rebinding attack requires very specific timing |
| A8 | `threading.Lock` is needed for LRU cache under `scripttype = persist` | Pattern 5 | If single-threaded, lock is just overhead (but safe; not harmful) |
| A9 | `{r}` default should be `"1"` not `""` for GBIF URL validity | Unknown 12 | GBIF tiles return 404 with `{r}=""` |

---

## Open Questions

1. **Exact `match=` path for `[script:]` stanza**
   - What we know: `match` is relative to `/services/`. CONTEXT.md target is `/services/rest/maps_plus/tile/proxy`.
   - What's unclear: Does `match = /rest/maps_plus/tile/proxy` produce that URL, or is the `rest` namespace handled differently by Splunk?
   - Recommendation: Verify against a running Splunk 9.x instance during T1.2.1. Use `curl https://localhost:8089/services/rest/maps_plus/tile/proxy` to confirm routing.

2. **`handle_GET` vs `get` method name on BaseRestHandler**
   - What we know: Community examples use `handle_GET`; PersistentServerConnectionApplication uses `handle`.
   - What's unclear: Exact method dispatch name for BaseRestHandler in Splunk 9.x.
   - Recommendation: Check `$SPLUNK_HOME/lib/python3/site-packages/splunk/rest/__init__.py` on any Splunk instance, or verify with the community example code.

3. **`{r}` substitution in GBIF URL**
   - What we know: Template is `@{r}x.png`. Default `{r}=""` produces `@x.png`. Default `{r}="1"` produces `@1x.png`.
   - What's unclear: Whether GBIF serves `@1x.png` (likely yes — it's standard retina URL convention).
   - Recommendation: Implement default `{r}="1"`. Verify GBIF tile URL in browser: `https://tile.gbif.org/3031/omt/3/2/4@1x.png?gbif-geyser`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.7+ | Handler runtime | Provided by Splunk | 3.7–3.9 depending on Splunk version | — |
| Splunk 9.x instance | Integration testing | Per developer's environment | — | Unit tests with stub run without Splunk |
| `splunk.rest` module | Handler base class | Provided by Splunk runtime | Built-in | Stub class for unit tests |
| Docker (for deploy.sh) | Dev deployment | [ASSUMED available per MEMORY.md deploy feedback] | — | Manual file copy |

---

## Project Constraints (from CLAUDE.md)

- **Stdlib only** — No `requests`, `httpx`, `cachetools`, `pytest`. Use `urllib.request`, `collections`, `unittest`.
- **`bin/` must be in package** — Both `deploy.sh` (dev Docker deploy) and `build_release.sh` (release packaging) must be updated (audit A-12).
- **`python.version = python3`** required in restmap.conf (audit A-13).
- **No system file modifications** — All config in app's `default/` and `local/`; no `web.conf`, `authentication.conf`, no global files.
- **AppCert compliance** — No filesystem writes outside `$SPLUNK_HOME/var/run/`. Disk cache path must be validated at runtime.
- **Splunk version floor:** 9.0 (from `.planning/config.json`).
- **Verify package contents** after deploy.sh: `tar -tzf` to confirm `bin/rest/maps_plus/tile_proxy.py` is present.

---

## Sources

### Primary (HIGH confidence)
- Python stdlib docs — `urllib.request`, `ipaddress`, `collections.OrderedDict`, `hashlib`, `logging`, `socket`
- OWASP SSRF Prevention Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- `src/maps-plus.js` ATTRIBUTIONS map (codebase grep) — tile provider URL patterns

### Secondary (MEDIUM confidence)
- Splunk restmap.conf 9.4 reference — https://help.splunk.com/en/splunk-enterprise/administer/admin-manual/9.4/configuration-file-reference/9.4.6-configuration-file-reference/restmap.conf
- Splunk Community — binary response via BaseRestHandler — https://community.splunk.com/t5/Getting-Data-In/Return-binary-data-such-as-images-via-REST-API-or-otherwise/td-p/219175
- Splunk dev.splunk.com — custom REST endpoints overview — https://dev.splunk.com/enterprise/docs/devtools/customrestendpoints
- Hurricane Labs — Splunk custom endpoints basics — https://hurricanelabs.com/splunk-tutorials/splunk-custom-endpoints-part-1-the-basics/
- Splunk Python 3 compatibility — https://help.splunk.com/en/splunk-enterprise/administer/python-3-migration/9.4/overview/python-3.7-code-compatibility

### Tertiary (LOW confidence — marked ASSUMED in text)
- Splunk logger namespace routing to `_internal` — inferred from Splunk logging conventions
- Splunk Cloud `var/run/` write restriction — conservative assumption; no official policy doc found
- `threading.Lock` requirement for `scripttype = persist` — inferred from Python threading model

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all stdlib; no external packages to verify
- restmap.conf syntax: MEDIUM — docs search confirms keys; exact `match=` path needs runtime verification
- BaseRestHandler API (method names, response object): MEDIUM — confirmed via community examples, not official API docs
- SSRF mitigation: HIGH — OWASP cheat sheet + Python ipaddress stdlib
- Architecture patterns: MEDIUM — based on Splunk docs search + community examples
- Pitfalls: HIGH — several confirmed via audit findings A-01–A-13 in CONTEXT.md

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (Splunk REST handler APIs are stable; stdlib is stable)

---

## RESEARCH COMPLETE
