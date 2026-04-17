# Phase 1: REST Proxy Backend + Routing — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 01-rest-proxy-backend-routing
**Mode:** `--auto` (Claude selected recommended defaults for every gray area)
**Areas discussed:** Allowlist Policy, Auth & Authorization, Rate Limiting, Feature Toggle Default, Network & Timeouts, Cache Implementation, Error Semantics

---

## Allowlist Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Seeded allowlist | Ship `default/settings.json` with all REQ-DS-05 provider hosts baked in; users extend in `local/` | ✓ |
| Fail-closed empty | Ship with empty `allowed_domains`; every deployment must configure | |
| Allow-all with warn | Accept any `https://` host; log warnings on non-allowlisted hosts | |

**Claude's choice:** Seeded allowlist.
**Rationale:** Satisfies REQ-DS-05 ("all OOTB raster tile providers work out of the
box") while keeping threat T1 mitigation intact — unknown hosts are still denied.
Fail-closed-empty would break OOTB experience; allow-all-with-warn silently
accepts SSRF targets.

---

## Authentication & Authorization

| Option | Description | Selected |
|--------|-------------|----------|
| Session-inherited (no capability) | Any authenticated Splunk user can use the proxy | ✓ |
| Require custom capability | New `maps_plus_tile_proxy` capability, admin-assigned | |
| Require built-in capability (e.g., `search`) | Reuse an existing capability check | |

**Claude's choice:** Session-inherited, matches existing PLAN.md T1.2.1.
**Rationale:** Tile data is public (REQ-DS-05 providers are public CDNs). Adding
a capability gate creates deployment friction (every install requires role
modification) with no threat reduction — a malicious authenticated user could
just call the tile provider directly from their browser.

---

## Rate Limiting Policy

| Option | Description | Selected |
|--------|-------------|----------|
| None in Phase 1 | LRU cache + upstream provider limits + Splunk web worker ceiling | ✓ |
| Per-session quota | Track request count per Splunk session, reject after N/minute | |
| Global token bucket | App-wide request budget shared across all users | |

**Claude's choice:** None in Phase 1.
**Rationale:** MVP scope. Threat model T6 (cache exhaustion) is handled by LRU
auto-eviction. Adding rate-limit state to the handler adds complexity (shared
memory, thread safety in Splunk's WSGI model) that isn't justified without
observed abuse. Deferred to post-release if telemetry shows a problem.

---

## Feature Toggle Default

| Option | Description | Selected |
|--------|-------------|----------|
| `enabled=true` (opt-out) | Proxy route registered and active on install | ✓ |
| `enabled=false` (opt-in) | User must flip flag in `local/settings.json` | |

**Claude's choice:** `enabled=true`.
**Rationale:** Dashboard Studio runtime detection (REQ-DS-01, Phase 2) is what
actually routes traffic through the proxy; Classic dashboards never invoke it.
Shipping disabled would break DS tile rendering on upgrade until users
discover the toggle — a regression vs the advertised feature.

---

## Network & Timeouts

| Option | Description | Selected |
|--------|-------------|----------|
| 5 seconds | Aggressive; fails fast on slow links | |
| 10 seconds (configurable) | Balances UX with worker-release | ✓ |
| 30 seconds | Very tolerant; risks pinning workers | |

**Claude's choice:** 10 seconds, configurable via
`settings.json.maps_plus.tile_proxy.upstream_timeout_seconds`.
**Rationale:** Tile CDNs typically respond in <2s. 10s absorbs transient slow
links (mobile clients, distant POPs) without pinning Splunk web workers longer
than a user would patiently wait.

**Sub-decision:** HTTPS-only; reject `http://` before DNS resolution.

---

## Cache Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| `OrderedDict`-backed LRU | Custom, instance-scoped, evicts by count | ✓ |
| `functools.lru_cache` | Decorator-based, module-level, no memory-pressure eviction | |

**Claude's choice:** `OrderedDict`-backed.
**Rationale:** `functools.lru_cache` is module-global and can't be reset between
handler instances; it also can't evict by size. An explicit LRU class supports
unit testing (cache hit/miss assertions) and future memory-pressure eviction.

| Option | Description | Selected |
|--------|-------------|----------|
| SHA-256 hash of normalized URL | 64-char hex, traversal-safe | ✓ |
| Raw URL as key | Human-readable, risks unsafe chars in disk path | |
| SHA-1 hash | Shorter; sufficient for cache integrity | |

**Claude's choice:** SHA-256.
**Rationale:** Threat T3 (path traversal). Even though the path-traversal risk
requires SSRF to be exploited first, defense-in-depth is cheap here.

---

## Error Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Sanitized JSON error body | `{"error":"<short-code>"}` only | ✓ |
| Pass-through upstream body | Echo upstream response body for debugging | |
| Verbose traceback | Include Python traceback in response (dev-only) | |

**Claude's choice:** Sanitized JSON error body.
**Rationale:** Threat T5 — never leak upstream response bodies or stack traces
to clients.

**Status code mapping:**
| Upstream / Condition | Proxy Response |
|---------------------|----------------|
| Upstream HTTP 403 (rate-limit) | 502 |
| Upstream HTTP 5xx | 502 |
| `socket.timeout` | 504 |
| DNS/connection failure | 504 |
| Bad params / disallowed domain | 400 |
| Unexpected exception | 500 |

---

## Claude's Discretion

- Exact LRU implementation style (class vs closure)
- Unit test framework (`unittest` implied — stdlib only)
- Log message format (standard Python logging patterns)
- Cache directory creation strategy (lazy vs eager)

## Deferred Ideas

- Per-user rate limiting (revisit post-release)
- Admin UI for allowlist management
- Vector tile proxying (Milestone 2)
- `{s}` round-robin subdomain pool
- Build hygiene tweaks (`.gitignore`, tarball cleanup) — separate housekeeping todo
- ETag / `If-None-Match` passthrough for conditional revalidation
