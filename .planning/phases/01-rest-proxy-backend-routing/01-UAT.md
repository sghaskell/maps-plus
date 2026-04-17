---
status: testing
phase: 01-rest-proxy-backend-routing
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
started: 2026-04-17T07:15:00Z
updated: 2026-04-17T07:42:00Z
---

## Current Test

number: 3
name: Endpoint returns a tile
expected: |
  Hitting `curl -k -u admin:<pw> "https://<splunk>:8089/services/maps_plus/tile/proxy?url=https%3A%2F%2Ftile.openstreetmap.org%2F0%2F0%2F0.png"`
  returns HTTP 200 with Content-Type `image/png` and a PNG-signature binary body (~20KB).
awaiting: user response

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
result: issue
reported: "FileNotFoundError: [Errno 2] No such file or directory: '' at os.chdir(scriptDir) in /opt/splunk/bin/runScript.py:72"
severity: blocker
retry_history: |
  UAT-1 retry-1: {"error":"No class implements PersistentServerConnectionApplication"} → fixed by subclassing PersistentServerConnectionApplication (commit ec167a1, test 7a422d5, 85 tests passed)
  UAT-2 retry-2: "__init__() takes 1 positional argument but 3 were given" → fixed by not forwarding (command_line, command_arg) to the zero-arg base __init__ (commit 7e9dae3)
  UAT-3 retry-3: {"error":"JSON reply had no 'payload' value"} → caused by bytes payload failing json.dumps in the persist pipe (commit da60f26 latin-1 decoded payload as workaround, but next retry showed binary was UTF-8-transcoded on wire → broken-image icon in browser)
  UAT-4 retry-5: User chose Option A (scripttype=python + BaseRestHandler revert). Commits c2b12f7, 0f89b04, e96239c. 74 tests pass.
  UAT-5 retry-5 live: FileNotFoundError 'rest/maps_plus' at os.chdir → flattened bin/tile_proxy.py (commit da? → 0b8d480)
  UAT-5b retry-6 live: **CURRENT — FileNotFoundError: '' at os.chdir** → runScript.py is receiving an EMPTY scriptDir despite script = tile_proxy.py. New hypothesis: scripttype=python expects a different `script` key format entirely (perhaps an absolute path, or no directory component at all, or a different key name like `script.py_file`).
open_questions:
  - What is the correct restmap.conf key format for scripttype=python in Splunk 9.x? Is `script = filename.py` supposed to work, or is it a different convention?
  - Is there a `script.py_file` / `scriptbin` / alternate key we should be using?
  - Should we go back to scripttype=persist but accept a JSON-wrapped base64 response format (Option B from the earlier decision), coupled with Phase 2 JS that decodes the base64?
  - Or: is there a third framework — `scripttype = python_standalone` or similar — that supports binary native AND has a different script path resolution?
next_actions_for_fresh_session:
  - Consult Splunk 9.x restmap.conf.spec authoritatively for scripttype=python script key semantics
  - Look at a known-working Splunk app (e.g. Splunk Add-on Builder output, splunk/splunk-app-examples) that uses scripttype=python to return binary — see how they configure script path
  - Alternative: pivot to Option B (persist + base64) since we already did ~3 hours of persist work and have regression tests in place
  - Budget: 2026-04-17; phase 02 (JS client) is blocked on this.

### 4. SSRF defense blocks private IP
expected: `curl -k -u admin:<pw> "https://<splunk>:8089/services/maps_plus/tile/proxy?url=http%3A%2F%2F127.0.0.1%2Fadmin"` returns HTTP 403 with a sanitized JSON error body (no internal IP or stack trace leak).
result: [pending]

### 5. SSRF defense blocks non-allowlisted host
expected: `curl -k -u admin:<pw> "https://<splunk>:8089/services/maps_plus/tile/proxy?url=https%3A%2F%2Fevil.example.com%2Ftile.png"` returns HTTP 403.
result: [pending]

### 6. Two-tier cache — memory hit
expected: Request the same OSM tile URL twice in quick succession. Second response should return faster (sub-10ms server-side) because the memory LRU hits — verifiable in splunkd_access.log response times, or by watching that the upstream tile server is NOT contacted a second time.
result: [pending]

### 7. Disk cache persists across Splunk restart
expected: With `disk_cache_enabled: true` in default/settings.json, hit a tile URL once. Restart splunkd. Hit the same URL again — served from disk cache at `$SPLUNK_HOME/var/run/maps_plus/tile_cache/` without re-fetching from upstream. Atomic `.tmp` files should not linger in the cache dir.
result: [pending]

### 8. Disabled flag returns 503
expected: Setting `enabled: false` in default/settings.json (or via local/settings.json override), restart splunkd, hit the endpoint — returns HTTP 503 with a "service disabled" JSON body.
result: [pending]

## Summary

total: 8
passed: 2
issues: 0
pending: 6
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
