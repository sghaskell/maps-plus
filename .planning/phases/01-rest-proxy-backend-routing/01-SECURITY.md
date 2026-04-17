---
phase: 01
slug: rest-proxy-backend-routing
status: verified
threats_open: 0
asvs_level: 2
created: 2026-04-17
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Auditor: `gsd-security-auditor` (agent run `53f9e8df-3bf6-4f00-901a-91f846581b2d`, 2026-04-17).
> Verification method: grep-against-source for every `mitigate` threat declared in the three plan threat models; rationale-recording for `accept` threats.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → Splunkweb | Dashboard Studio iframe requesting `/servicesNS/.../maps_plus/tile_proxy/{z}/{x}/{y}` | Splunk session cookie, z/x/y path params |
| Splunkweb → splunkd REST | `TileProxyHandler` (BaseRestHandler) dispatch | Authenticated user context, request path |
| splunkd → Upstream tile host | `urllib.request` GET to allowlisted HTTPS tile provider (e.g. tile.openstreetmap.org) | Outbound HTTPS, no credentials attached |
| splunkd → Local disk | `DiskCache` under `$SPLUNK_HOME/var/run/maps_plus/tile_cache/` | Tile bytes + content-type + cache-control headers |
| Operator → `default/settings.json` vs `local/settings.json` | Allowlist / cache tuning edits | Plaintext JSON under app dir |

---

## Threat Register

### Plan 01-01 — REST handler (`bin/tile_proxy.py`)

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T1-01-SSRF | Tampering / InfoDisclosure | `_validate_url` | mitigate | HTTPS-only, host allowlist, `getaddrinfo` + `ipaddress` block private/link-local/loopback/multicast/metadata ranges (IPv4 + IPv6). `bin/tile_proxy.py:207-265` | closed |
| T1-02-InjectionZXY | Tampering | `_check_zxy_value` / `_resolve_tile` | mitigate | Int coercion, `iv < 0` rejected, whitespace/injection rejected. Errors → HTTP 400. `bin/tile_proxy.py:272-288`, `:291-317`, `:791-796` | closed |
| T1-03-ResponseSize | DoS | Upstream fetch | mitigate | `resp.read(MAX_TILE_BYTES + 1)` with length cap (`MAX_TILE_BYTES`). `bin/tile_proxy.py:46`, `:386-389` | closed |
| T1-04-Redirect | Tampering | `_NoRedirectHandler` | mitigate | Custom opener refuses 3xx redirects entirely. `bin/tile_proxy.py:347-361`, `:364` | closed |
| T1-05-CachePoisoning | Tampering | `_make_cache_key` | mitigate | SHA-256 over server-side-resolved URL; client never supplies cache key. `bin/tile_proxy.py:324-340`, `:827-828` | closed |
| T1-07-RateLimitAmp | DoS | Handler | accept | See Accepted Risks Log. | closed |
| T1-08-UnauthAccess | Spoofing | `TileProxyHandler` | mitigate | `requireAuthentication = true` in `default/restmap.conf:18`; handler extends `splunk.rest.BaseRestHandler` (`bin/tile_proxy.py:920-921`). | closed |
| T1-09-Disabled | Misuse | `enabled` flag | mitigate | Disabled flag honored → HTTP 503 `proxy_disabled`. `bin/tile_proxy.py:771-774`; default value in `default/settings.json:5-6`. | closed |
| T1-10-BinaryEncoding | Integrity | Response path | mitigate | `resp.read()` returns bytes; `response.write(data)` writes bytes (no UTF-8 decode). `bin/tile_proxy.py:385`, `:913`. | closed |
| T1-11-ErrorLeak | InfoDisclosure | `_write_json_error` | mitigate | Short-code JSON errors only; unhandled exceptions → sanitized 500. `bin/tile_proxy.py:735-747`, `:941-948`. | closed |

### Plan 01-02 — restmap + settings + packaging

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T2-01-AuthBypass | Spoofing | `default/restmap.conf` | mitigate | `requireAuthentication = true`. `default/restmap.conf:18`. | closed |
| T2-02-WrongStanza | Configuration error | `default/restmap.conf` | mitigate | `[script:maps_plus_tile_proxy]`, `scripttype = python`, `handler = tile_proxy.TileProxyHandler`. `script =` key **absent** (lines 6-11 document why it must be absent; commit 13fd7cd). `default/restmap.conf:13-17`. | closed |
| T2-03-Python2Fallback | Tampering | `default/restmap.conf` | mitigate | `python.version = python3`. `default/restmap.conf:17`. | closed |
| T2-04-AllowlistWeakening | Tampering | `local/settings.json` | accept | See Accepted Risks Log. | closed |
| T2-05-MissingFromPackage | Availability | `build_release.sh`, `scripts/deploy.sh` | mitigate | `git archive` stage + fail-fast presence checks for `bin/tile_proxy.py` and `default/restmap.conf` (`build_release.sh:54-76`); `default/settings.json` included + operator-hinted (`build_release.sh:42-46,98`); dev deploy copies `bin/`, `restmap.conf`, `settings.json` (`appserver/static/visualizations/maps-plus/scripts/deploy.sh:24-38`). | closed |
| T2-06-SystemFileWrite | Integrity | `DiskCache` root | mitigate | Cache confined under `$SPLUNK_HOME/var/run/maps_plus/tile_cache/` — never `etc/` or other system paths. `bin/tile_proxy.py:712-714`. | closed |

### Plan 01-03 — DiskCache

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T3-01-PathTraversal | Tampering | `_assert_within_cache_dir` | mitigate | `os.path.realpath` + prefix check before any read/write. `bin/tile_proxy.py:530-558`. | closed |
| T3-02-TornWrite | Integrity | `DiskCache.set` | mitigate | `tempfile.mkstemp` in-same-dir + `os.replace` atomic rename. `bin/tile_proxy.py:632-647`. | closed |
| T3-03-ConcurrencyRace | Integrity | `DiskCache._lock`, `LRUCache._lock` | mitigate | `threading.Lock` wraps `set` + `_prune_locked` (`bin/tile_proxy.py:491,626-655`); in-memory LRU has its own lock (`bin/tile_proxy.py:411-426`, per `01-01-SUMMARY.md`). | closed |
| T3-04-DiskExhaustion | DoS | `_prune_locked` | mitigate | LRU prune by mtime with `max_bytes` cap. `bin/tile_proxy.py:660-689`. | closed |
| T3-05-CloudFilesystem | Availability | Cache write path | mitigate | `PermissionError` / `EROFS` on init → `enabled=False` (`bin/tile_proxy.py:511-521`); handler swallows disk `set` failures so user response is never blocked (`bin/tile_proxy.py:898-904`). | closed |
| T3-06-SerializationFormat | Integrity | `MP01` format | mitigate | Custom `MP01` magic header + length-prefixed binary (`bin/tile_proxy.py:53`, `:636-641`). **No `pickle` import** — only a comment explaining its rejection (`bin/tile_proxy.py:485`). | closed |
| T3-07-SymlinkEscape | Tampering | `_assert_within_cache_dir` | mitigate | `os.path.realpath` resolves symlinks before the prefix compare — satisfies the "at minimum realpath" clause in `01-03-PLAN.md`. `bin/tile_proxy.py:543-557`. | closed |
| T3-08-MtimeUpdateRace | Reliability | `os.utime` touch-on-read | accept | See Accepted Risks Log. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T1-07-RateLimitAmp | Per-session rate limiting deferred per decisions D-05/D-06 (out-of-scope for the raster-tile MVP). Mitigated indirectly by the two-tier LRU cache, which drops repeat upstream load under a hot-tile workload. Revisit when vector tiles / KML land in milestone 2 (larger payloads, fewer cache hits). | Shaskell (project owner) | 2026-04-17 |
| AR-02 | T2-04-AllowlistWeakening | Operator edits to `local/settings.json` are an intended configuration workflow (decision D-01). Filesystem permissions on `$SPLUNK_HOME/etc/apps/leaflet_maps_app/local/` plus AppCert packaging scope prevent unprivileged edits. Defense-in-depth: `_validate_url` IP-block still blocks RFC1918 / link-local / metadata ranges even if an operator adds a private hostname to `allowed_hosts` — the SSRF guard never trusts the allowlist alone. | Shaskell (project owner) | 2026-04-17 |
| AR-03 | T3-08-MtimeUpdateRace | `os.utime()` touch-on-read is a best-effort signal for the LRU pruner. Two concurrent readers racing on `utime` both set `mtime` to near-now — the outcome is benign (a few-millisecond delta in eviction order). Adding a lock around every cache read to eliminate the race would cost ~orders-of-magnitude more than the harm it prevents. | Shaskell (project owner) | 2026-04-17 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-17 | 24 | 24 | 0 | gsd-security-auditor (agent `53f9e8df-3bf6-4f00-901a-91f846581b2d`) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-17
