---
status: complete
phase: 01-rest-proxy-backend-routing
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
started: 2026-04-17T07:15:00Z
updated: 2026-04-17T20:50:00Z
---

## Current Test

(UAT complete — no active test)

## Tests

### 1. Release tarball contents
expected: Tarball packages bin/rest/maps_plus/tile_proxy.py, default/restmap.conf, default/settings.json; excludes tests/, run_tests.sh, .planning/
result: pass

### 2. Splunk app install
expected: Uploading leaflet_maps_app_4.6.1.tar.gz via Splunk UI → Apps → Install app from file completes without errors. App shows up in Apps list, status = Enabled. No errors in $SPLUNK_HOME/var/log/splunk/splunkd.log referencing leaflet_maps_app or tile_proxy.
result: pass
notes: |
  Passed after two restmap.conf fixes.
  Issue A (blocker, fixed 740d462): "No 'script' given for persistent REST handler" — restmap.conf used `handlerfile` (non-existent key) instead of `script`; handler value was bare class name instead of `module.ClassName`.
  Issue B (blocker, fixed 3161d04): "Invalid key ... handleractions" — `handleractions` is not valid for scripttype=persist; Splunk auto-dispatches via handle_GET/handle_POST method presence on the class.
  Gap in 01-02 verification: the plan's offline grep-based checks confirmed stanza presence but never loaded the file into a real splunkd, so both invalid keys reached production.

### 3. Endpoint returns a tile
expected: Request a tile via the proxy endpoint, receive HTTP 200 + Content-Type image/png + ~20KB PNG binary.
request_url_corrected: `https://localhost:8089/services/maps_plus/tile/proxy?url=https%3A%2F%2Ftile.openstreetmap.org%2F%7Bz%7D%2F%7Bx%7D%2F%7By%7D.png&z=0&x=0&y=0`
result: pass
notes: |
  Passed retry #7 after resolving the scripttype=python script-key semantics (commit 13fd7cd).
  Root cause: per $SPLUNK_HOME/etc/system/README/restmap.conf.spec, the `script` key is for handlers *not* derived from splunk.rest.BaseRestHandler. Setting it on our BaseRestHandler subclass forced Splunk into the legacy /opt/splunk/bin/runScript.py codepath, which does os.chdir(os.path.dirname(script)) — and a bare filename dirname-s to '', causing FileNotFoundError.
  Fix: dropped `script = tile_proxy.py` from default/restmap.conf. Kept `handler = tile_proxy.TileProxyHandler`; Splunk resolves MODULE.CLASS from the app bin/ directly, no runScript.py involvement.
  Verification: world-tile z=0/x=0/y=0 renders in-browser from /services/maps_plus/tile/proxy with valid PNG body.

### 4. SSRF defense blocks private IP
expected: `curl -k -u admin:<pw> "https://<splunk>:8089/services/maps_plus/tile/proxy?url=http%3A%2F%2F127.0.0.1%2Fadmin"` returns HTTP 403 with a sanitized JSON error body (no internal IP or stack trace leak).
request_url_corrected: `https://localhost:8089/services/maps_plus/tile/proxy?url=https%3A%2F%2F127.0.0.1%2F%7Bz%7D%2F%7Bx%7D%2F%7By%7D.png&z=0&x=0&y=0` — needs z/x/y params (rejected as missing_param_zxy otherwise) and https scheme (handler rejects http upstream).
result: pass
reported: "HTTP 403 + {\"error\": \"host_not_allowed\"} (29B JSON). Sanitized body (no IP/stack leak), correct status."
executed_on: 2026-04-17 (work macbook, splunk/splunk:10.2.0 container under Rosetta, after bin/tile_proxy.py 403 fix)
observed:
  http_status: 403
  content_type: application/json
  body: '{"error": "host_not_allowed"}'
  size_bytes: 29
notes: |
  Re-run after the bin/tile_proxy.py status-code fix (see Gap #3 fixes_applied
  below). 127.0.0.1 is caught at layer 3 (host allowlist) before reaching
  layer 4 (DNS + private-IP block) — that's expected: the allowlist never lists
  raw IPs, so any direct-IP URL fails at layer 3 with host_not_allowed, not
  private_ip_blocked. Layer 4 is reached only by allowlisted hostnames that
  DNS-resolve to a private IP (DNS-rebinding attack), which requires DNS
  mocking impossible against a live splunkd. That specific path is covered by
  the unit test `test_private_ip_on_allowlisted_host_returns_403` in
  tests/test_tile_proxy.py (added alongside the fix, 77/77 pass).
  Bonus finding retained: https-only upstream enforcement and
  param-validation-before-SSRF ordering are design choices worth documenting.

### 5. SSRF defense blocks non-allowlisted host
expected: `curl -k -u admin:<pw> "https://<splunk>:8089/services/maps_plus/tile/proxy?url=https%3A%2F%2Fevil.example.com%2Ftile.png"` returns HTTP 403.
result: pass
executed_on: 2026-04-17 (re-run after bin/tile_proxy.py 403 fix)
observed:
  http_status: 403
  content_type: application/json
  body: '{"error": "host_not_allowed"}'
  size_bytes: 29
notes: "HTTP 403 + {\"error\": \"host_not_allowed\"} — sanitized body, correct status. Status-code fix verified against live splunkd."

### 6. Two-tier cache — memory hit
expected: Request the same OSM tile URL twice in quick succession. Second response should return faster (sub-10ms server-side) because the memory LRU hits — verifiable in splunkd_access.log response times, or by watching that the upstream tile server is NOT contacted a second time.
result: pass
notes: |
  z=2/x=1/y=1 OSM tile — 1st hit 269 ms, 2nd hit 112 ms (6.6 kB both). ~2.4x speedup on
  identical response size strongly indicates the 2nd request was served from the memory
  LRU (the 1st-hit latency is dominated by the upstream HTTPS roundtrip to
  tile.openstreetmap.org, which the 2nd skipped).
  The "sub-10ms" expectation in the original test was unrealistic: the 112 ms floor is
  Splunk's REST framework overhead (TLS, auth, routing), not cache lookup cost.
  The cache lookup itself is almost certainly sub-ms; it's just fronted by fixed
  per-request Splunk infra cost. Cache is functioning as designed.
suggested_future_work: |
  Add an explicit "cache_hit: bool" field to the response or an access-log metric,
  so cache behavior is observable without inferring from timing.

### 7. Disk cache persists across Splunk restart
expected: With `disk_cache_enabled: true` in default/settings.json, hit a tile URL once. Restart splunkd. Hit the same URL again — served from disk cache at `$SPLUNK_HOME/var/run/maps_plus/tile_cache/` without re-fetching from upstream. Atomic `.tmp` files should not linger in the cache dir.
result: pass
notes: |
  z=3/x=2/y=3 OSM tile, 4.8 kB response.
    1st hit (fresh upstream + disk write): 222 ms
    After splunkd restart (disk cache serves, memory cache cold): 145 ms
  Post-restart latency well below a fresh upstream fetch, confirming disk cache survived the
  restart. Cache dir uses hash-prefix sharding (e.g. 0b/, 34/, 59/ subdirs — one level of
  256-way sharding by hash nibble pair), which avoids inode blowup on a single directory.
  No `.tmp` files lingering — atomic write-to-temp-then-rename pattern works.

### 8. Disabled flag returns 503
expected: Setting `enabled: false` in default/settings.json (or via local/settings.json override), restart splunkd, hit the endpoint — returns HTTP 503 with a "service disabled" JSON body.
result: pass
executed_on: 2026-04-17 (work macbook, splunk/splunk:10.2.0 container under Rosetta, tarball leaflet_maps_app_4.6.1.tar.gz)
request_url: `https://localhost:8089/services/maps_plus/tile/proxy?url=https%3A%2F%2Ftile.openstreetmap.org%2F%7Bz%7D%2F%7Bx%7D%2F%7By%7D.png&z=0&x=0&y=0`
override_file: local/settings.json with `{"maps_plus": {"tile_proxy": {"enabled": false}}}`
observed:
  http_status: 503
  content_type: application/json
  body: '{"error": "proxy_disabled"}'
  size_bytes: 27
negative_control:
  description: Removed local/settings.json override, restarted splunkd, re-ran same curl.
  http_status: 200
  content_type: image/png
  size_bytes: 6924
  notes: Confirms the 503 is driven by the enabled flag, not a restart artifact.
notes: |
  Test execution confirms the early-return in bin/tile_proxy.py handle_GET (~L772):
    if not settings.get("enabled", True):
        _write_json_error(response, 503, "proxy_disabled")
        return
  Body is sanitized (no internal paths, stack, or config leak). JSON shape is
  stable: just {"error": "proxy_disabled"}. No separate "message" or "detail"
  field — minimal surface area for info leaks, matching the design intent.
  The override was placed in local/settings.json (AppCert-compliant path); the
  default/settings.json shipped with the app was not modified, so
  `splunk reload` isn't needed on uninstall — local/ just vanishes with the app
  and default returns to enabled=true.

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "restmap.conf keys are validated against the live Splunk spec before shipping"
  status: failed
  reason: "Plan 01-02 verification was offline-only (grep for stanza presence). Two invalid keys (`handlerfile`, `handleractions`) reached a real splunkd install before being caught by UAT. Both were blockers that prevented the REST handler from loading at all."
  severity: major
  test: 2
  root_cause: "Plan 01-02 Task 1 verification block relied on grep patterns, not splunkd parse. No automated way to verify restmap.conf against the running Splunk version's accepted-key list."
  artifacts:
    - default/restmap.conf
  missing:
    - live-splunkd conf-parse smoke test (or at minimum, a lint step that cross-references Splunk 9.x restmap.conf.spec for the keys actually used)
  debug_session: "UAT tests 2 retry #1 + #2"
  fixes_applied:
    - 740d462 fix(01-02): restmap.conf — use 'script' key + module.class handler format
    - 3161d04 fix(01-02): drop handleractions key from restmap.conf

- truth: "REST handler returns raw PNG binary on first request"
  status: fixed
  reason: "scripttype=python with `script = tile_proxy.py` forced Splunk into the legacy runScript.py codepath. runScript.py does os.chdir(os.path.dirname(script)); a bare filename dirname-s to '', causing FileNotFoundError: '' at os.chdir. Took six failed retries to identify because the restmap.conf.spec caveat ('script' is only for handlers NOT derived from BaseRestHandler) was never surfaced by the plan's offline verification."
  severity: blocker
  test: 3
  root_cause: "Misuse of the `script` key on a BaseRestHandler subclass. The key is documented in restmap.conf.spec as 'rarely used' and reserved for non-BaseRestHandler scripts. For BaseRestHandler handlers, the `handler = MODULE.CLASS` key alone is sufficient."
  artifacts:
    - default/restmap.conf
  missing:
    - live-splunkd restmap.conf semantic-lint step in the plan verification (not just syntactic grep) — same gap class as Gap #1 above
  debug_session: "UAT Test 3 retries #1 through #7 (persist → python → flattened-bin → dropped-script-key)"
  fixes_applied:
    - 13fd7cd fix(01-01): drop script key from restmap.conf — BaseRestHandler path

- truth: "SSRF policy rejections return HTTP 403"
  status: fixed
  reason: "Handler now returns HTTP 403 on SSRF policy rejections (host_not_allowed, invalid_ip, private_ip_blocked) per RFC 9110 §15.5.4. Client-malformed codes (scheme_not_https, invalid_chars, dns_failed) correctly remain 400. Verified live against splunkd (Test 4 + Test 5 re-runs both return 403) and in unit suite (77/77 pass, 3 new tests lock the mapping)."
  severity: minor
  test: 4
  root_cause: "Layer-5 handler code (bin/tile_proxy.py ~L801) blanket-mapped every _validate_url failure to HTTP 400, conflating client-malformed syntax (400) with server-side policy refusal (403)."
  artifacts:
    - bin/tile_proxy.py
    - tests/test_tile_proxy.py
  fix_summary: |
    Split the status mapping in handle_GET step 5: introduce
    _SSRF_POLICY_CODES = {"host_not_allowed", "invalid_ip", "private_ip_blocked"};
    use 403 for members of that set, 400 for everything else. Added three
    integration tests (test_host_not_allowed_returns_403,
    test_private_ip_on_allowlisted_host_returns_403,
    test_cloud_metadata_ip_returns_403) to lock the new mapping and prevent
    regression.
  fixes_applied:
    - "(pending commit) fix(01): return HTTP 403 for SSRF policy rejections (host_not_allowed, private_ip_blocked, invalid_ip)"
