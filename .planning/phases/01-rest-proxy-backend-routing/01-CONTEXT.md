# Phase 1: REST Proxy Backend + Routing — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning (replan informed by this context)
**Mode:** `--auto` (Claude selected recommended defaults)

<domain>
## Phase Boundary

Deliver a same-origin Splunk REST endpoint `/services/rest/maps_plus/tile/proxy`
that receives tile requests from Leaflet running inside a Dashboard Studio iframe,
resolves the tile URL template, fetches the upstream tile (OSM/CartoDB/Esri/GBIF/
GIBS/HOTOSM/OpenTopoMap), caches it, and streams the raw bytes back with correct
`Content-Type` and `Cache-Control` headers — bypassing Dashboard Studio's CSP.

**In scope:**
- Python REST handler (`bin/rest/maps_plus/tile_proxy.py`)
- `default/restmap.conf` route registration
- `default/settings.json` configuration schema + sensible defaults
- In-memory LRU cache (256 tiles) — mandatory for all deployments
- Optional on-disk LRU cache (500 MB cap) — Enterprise/CMP/BYOL only
- SSRF protections (domain allowlist, private-IP rejection, scheme restriction)
- Error handling (403 rate-limit, 5xx, timeout, unreachable — sanitized error bodies)
- Deploy script update (`bin/` inclusion in package)

**Out of scope (deferred to later phases):**
- Client-side Leaflet interception / DS-runtime detection (Phase 2)
- Vector tile proxying (Milestone 2)
- KML/GeoJSON proxying (Milestone 2)
- Per-user rate limiting / quota enforcement
- Admin UI for allowlist management

</domain>

<decisions>
## Implementation Decisions

### Allowlist Policy
- **D-01:** Default `allowed_domains` list is **seeded** with the full REQ-DS-05
  provider host set so OOTB providers work without manual config. Users extend
  in `local/settings.json` for custom tile servers.
  - Seed hosts (minimum set): `tile.openstreetmap.org`, `*.basemaps.cartocdn.com`,
    `server.arcgisonline.com`, `tile.gbif.org`, `gibs.earthdata.nasa.gov`,
    `*.tile.openstreetmap.fr` (HOTOSM), `*.tile.opentopomap.org`, Stadia hosts
    used by OpenFreeMap dashboards.
  - Exact host list is finalized during research by extracting from
    `src/maps-plus.js` existing `tileLayer(...)` URLs.
- **D-02:** Empty allowlist = **deny-all** (fail-closed). No "allow-all with warn"
  mode. Rationale: threat model T1 — SSRF is HIGH severity; explicit denial is
  the safer posture.
- **D-03:** Wildcards supported via leftmost `*.` prefix only (e.g.,
  `*.basemaps.cartocdn.com`). Full-regex not supported in Phase 1 — reduces
  validation surface.

### Authentication & Authorization
- **D-04:** Proxy inherits the caller's Splunk session permissions
  (`restmap.conf` route has no `[rest://...]` auth stanza, no custom capability
  required). Rationale: tile data is already-public (REQ-DS-05 providers are
  public CDNs); gating behind a capability adds deployment friction with no
  threat reduction. Matches PLAN.md Task T1.2.1.

### Rate Limiting
- **D-05:** No per-user or per-session rate limiting in Phase 1. Relying on
  (a) LRU auto-eviction for cache-exhaustion resilience (threat T6), (b)
  upstream provider's own rate limits (provider returns 403 → we return 502
  sanitized), (c) Splunk web worker request ceiling.
- **D-06:** If observed abuse emerges post-release, per-session throttle is
  deferred to Phase 2 or a patch phase — see Deferred Ideas.

### Feature Toggle Default
- **D-07:** `settings.json.maps_plus.tile_proxy.enabled = true` (opt-out).
  Rationale: Dashboard Studio detection (REQ-DS-01, Phase 2) determines whether
  the client routes through the proxy; Classic dashboards never hit it. Shipping
  disabled would require every DS user to flip a config flag before tiles load —
  a regression vs current behavior.

### Network & Timeouts
- **D-08:** Upstream fetch timeout: **10 seconds** default, configurable via
  `settings.json.maps_plus.tile_proxy.upstream_timeout_seconds`. Rationale:
  tile CDNs typically respond in <2s; 10s absorbs transient slow links without
  pinning Splunk web workers longer than a user would tolerate anyway.
- **D-09:** Only `https://` schemes accepted. `http://` is rejected before any
  DNS resolution. Rationale: threat T1 mitigation + modern provider policy.

### Cache Implementation
- **D-10:** In-memory LRU: custom `collections.OrderedDict`-backed implementation
  (256-entry cap, configurable). NOT `functools.lru_cache` — the latter can't
  be instance-scoped cleanly and can't eject by memory pressure.
- **D-11:** Cache key: **SHA-256 hash of the normalized resolved URL** (after
  `{z}/{x}/{y}/{s}/{r}` substitution, scheme/host lowercased, query-string
  canonicalized). Rationale: threat T3 — prevents path-traversal character
  sequences from ever reaching the disk cache path.
- **D-12:** On-disk cache path:
  `$SPLUNK_HOME/var/run/maps_plus/tile_cache/<first-2-hex>/<hash>.tile`
  (sharded to avoid huge dir listings). If the path isn't writable (Splunk
  Cloud), on-disk cache is silently disabled and a single INFO log emitted at
  startup. Memory-only LRU still functions.

### Error Semantics
- **D-13:** Error body format: `{"error":"<short-code>"}` — never echo upstream
  body or Python traceback. Rationale: threat T5 (log/error injection).
- **D-14:** Status mapping: upstream 403→502, upstream 5xx→502, socket
  timeout→504, DNS/connection failure→504, validation failure (bad params,
  disallowed domain)→400, unexpected exception→500.

### Response Headers
- **D-15:** `Content-Type` pass-through from upstream (common values:
  `image/png`, `image/webp`, `image/jpeg`). If upstream omits it, default to
  `application/octet-stream`.
- **D-16:** `Cache-Control: public, max-age=86400` on proxy responses so the
  browser can cache across page loads. Overridable via settings.

### Claude's Discretion
The following are flagged for the planner/executor to choose without further
user input:
- Exact LRU implementation style (class-based vs closure) — D-10 constrains
  the data structure, not the class shape
- Unit test framework for the Python handler (unittest vs pytest) — stdlib
  only per PROJECT constraints, so `unittest` is implied
- Log message format / `python-logging`-vs-Splunk-logger details
- Cache directory creation strategy (lazy vs eager)

### Folded Todos
_No pending todos matched this phase's scope._

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Dashboard Studio compatibility project vision,
  Key Technical Constraints, AppCert compliance requirements
- `.planning/REQUIREMENTS.md` — REQ-DS-01..REQ-DS-07 (Active), must-have vs
  nice-to-have tile providers (REQ-DS-05)
- `.planning/ROADMAP.md` — Milestone 1 scope, phase boundary, Milestone 2
  deferred capabilities

### Phase Plan & Prior Work
- `.planning/phases/01-rest-proxy-backend-routing/01-PLAN.md` — Existing plan
  with 22 tasks across Plan 1.1 (handler) and Plan 1.2 (config); includes full
  threat model (T1–T6). **Replan should preserve the threat model and task
  intent but may restructure ordering based on decisions D-01..D-16 above.**

### Codebase Maps (existing)
- `.planning/codebase/ARCHITECTURE.md` — AMD/RequireJS bundle layout, runtime
  integration with Splunk Web
- `.planning/codebase/STACK.md` — JavaScript-only codebase today; this phase
  introduces the first Python surface (`bin/`)
- `.planning/codebase/STRUCTURE.md` — where `bin/` sits, how `default/`
  configuration is layered by Splunk
- `.planning/codebase/CONVENTIONS.md` — coding style for JS; no Python
  precedent in repo
- `.planning/codebase/CONCERNS.md` — known technical debt & risk surfaces
- `.planning/codebase/INTEGRATIONS.md` — how maps-plus integrates with
  Splunk Web / RequireJS
- `.planning/codebase/TESTING.md` — current test posture (none)

### Source Code to Read Before Implementing
- `appserver/static/visualizations/maps-plus/src/maps-plus.js` — **specifically
  the existing `L.tileLayer(...)` URL patterns** used across OOTB providers.
  The allowlist seed (D-01) must be derived from these exact hosts, not guessed.

### Build & Deploy
- `appserver/static/visualizations/maps-plus/scripts/deploy.sh` — must be
  updated to stage `bin/` and the new `default/` configs into the `.tgz`
  (T1.2.3 in existing plan). See memory note: staging dir + `docker cp`,
  not tar pipe.
- `build_release.sh` — release packaging entry point
- `CLAUDE.md` — release checklist (version bump, changelog, verify package
  contents before upload)

### Splunk Platform Reference (external — fetch via Context7 or docs)
- Splunk `BaseRestHandler` API (`rest.BaseRestHandler`) — subclassing
  contract, `self.response` usage, `self.in_system_file_context`
- Splunk `restmap.conf` syntax — `[script:]` vs `[route:]` stanzas,
  `handlerfile` vs `source` keys
- Splunk `$SPLUNK_HOME/var/run/` write permissions in Cloud vs on-prem
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None directly reusable** — this phase introduces the first Python handler
  in the repo. JavaScript client-side work is Phase 2+.
- `deploy.sh` staging pattern is established and must be extended (not
  reinvented) to include `bin/`.

### Established Patterns
- **Splunk app layout** already in place (`default/`, `metadata/`, `appserver/`).
  The new `bin/rest/maps_plus/` fits the standard Splunk app Python package
  convention with no novel directory structure.
- **Configuration layering** — Splunk's `default/` → `local/` override pattern
  is idiomatic; `settings.json` follows the same convention some newer Splunk
  apps use for structured config vs `.conf`.
- **Logging** — no existing Python logger in repo; use
  `logging.getLogger('splunk.modules.maps_plus.tile_proxy')` per standard
  Splunk convention (emits into `_internal` index).

### Integration Points
- **Build pipeline:** `scripts/deploy.sh` + `build_release.sh` must include
  `bin/` (currently excluded — verified 2026-04-16 on broken branch).
- **`.gitignore`:** no changes required for Phase 1. `*.tar.gz` hygiene is
  already-handled in qwen3.6 abandoned work but is **out of Phase 1 scope**.
- **No existing REST surface** in the app — `/services/rest/maps_plus/*` is a
  greenfield namespace. No conflict risk.

### Creative Constraints
- **Python stdlib only** (`urllib.request`, `collections`, `hashlib`, `logging`,
  `json`, `os`, `socket`, `re`). No `requests`, no `httpx`, no `cachetools`.
- **Must work under Splunk Cloud** (no disk write access) — on-disk cache is
  strictly optional and falls back silently.
- **AppCert compliance** — no modifications to `web.conf`, no global
  `authentication.conf` touches, no filesystem writes outside `$SPLUNK_HOME/var/run/`.

</code_context>

<specifics>
## Specific Ideas

- **Retry context:** This phase was previously attempted on
  `feature/dashboard-studio-tile-proxy` using a local LLM (qwen3.6). That
  run produced only an empty `bin/rest/maps_plus/__init__.py` before derailing
  (history-rewrite attempt). The PLAN.md was clean and is preserved
  unchanged; CONTEXT.md captures the decisions needed to make execution
  repeatable by a different agent (Claude Code).
- **Derive the allowlist from actual code**, not from a guessed list. The
  planner/executor should `grep "L.tileLayer" src/maps-plus.js` and extract
  every host from every baked-in provider URL before committing the seed
  list to `default/settings.json`.
- **Threat model T1–T6 in PLAN.md is authoritative.** Do not weaken any
  mitigation during replan/execute.

</specifics>

<deferred>
## Deferred Ideas

- **Per-user rate limiting / request quotas** — deferred (D-06). Surface if
  post-release telemetry shows abuse.
- **Admin UI for allowlist management** — out of Phase 1 scope; can live in
  a future "admin settings" phase once multiple configurable knobs exist.
- **Vector tile proxying** — Milestone 2, Phase 2.
- **Custom subdomain pool (`{s}` round-robin)** — plan defaults `{s}` to
  `"a"`; a round-robin pool could be added later if specific providers
  require it for load distribution.
- **Build hygiene tweaks** (`.gitignore`/tarball cleanup/`build_release.sh`
  clean step) — trialed by qwen3.6, not Phase 1 scope. Capture as a separate
  housekeeping todo if still desired after Phase 1 ships.
- **ETag / `If-None-Match` passthrough** — response headers currently set
  a flat `max-age`; supporting conditional revalidation with upstream ETags
  is a performance win but not required for MVP.

### Reviewed Todos (not folded)
_None — no backlog todos matched Phase 1 scope._

</deferred>

---

*Phase: 01-rest-proxy-backend-routing*
*Context gathered: 2026-04-16*
*Mode: `--auto` — 7 gray areas auto-resolved to recommended defaults; user may
revise by editing this file before `/gsd-plan-phase 1`.*
