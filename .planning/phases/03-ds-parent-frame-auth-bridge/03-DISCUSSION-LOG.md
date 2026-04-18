# Phase 3: DS Parent-Frame Auth Bridge — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or
> execution agents. Decisions are captured in
> `03-CONTEXT.md` — this log preserves the alternatives considered
> alongside the user's delegation of judgement to Claude.

**Date:** 2026-04-18
**Phase:** 03-ds-parent-frame-auth-bridge
**Areas discussed:** Load point, Presence detection, Transport, URL-shape
regex sharing, Rate limit, `requestId` + timeout + in-flight cap

**Session mode:** Interactive with user delegation. User was presented
with six identified gray areas and replied: *"I'll defer to your
judgement on how we should proceed with all of these gray areas. My gut
tells me UAT will make or break any of these decisions and cause us to
adapt one way or another."*

Claude selected defaults for all six areas with explicit UAT-adaptation
notes embedded in each decision. Each area's table below records the
alternatives considered and Claude's selection rationale.

---

## Area 1: Parent-Shim Load Point

| Option | Description | Selected |
|--------|-------------|----------|
| `app.conf` / `appserver/static/` | Standard Splunk-app static-resource mechanism. App-scoped, REQ-DS-07 compliant. Empirical question: does it fire on DS dashboard view pages? | ✓ (primary) |
| Nav XML include | Per-app, still app-scoped. Possible path if static JS doesn't fire on DS routes. | ✓ (fallback A) |
| Per-dashboard HTML panel drop-in | Works for sure but requires dashboard authors to opt in. Documented in README. | ✓ (fallback B) |
| `web.conf` `custom_javascript_url` | Global, fires on every page. **Ruled out** by REQ-DS-07 (no system config modifications from the app). | ✗ |
| Admin-initiated `local/web.conf` override | Last-resort escalation path. Not shipped by the app; admin adds the resource line manually. Recorded as accepted risk if nothing else works. | ✓ (escalation only) |

**Claude's choice:** Candidate order (primary → fallback A → fallback B
→ escalation), with Plan 03-01 research resolving the empirical question
against `splunk-10-dev`. Research matrix must verify loading on Classic
SimpleXML, DS listing, DS editor, DS view — mechanism that covers at
minimum "DS view" wins.

**Rationale:** Standard Splunk-app mechanism first. `web.conf`
rejected at requirements level, not design level. Fallbacks are
planner's escalation ladder if research shows the primary path doesn't
reach DS view pages.

**UAT adaptation:** None at UAT time. Load-point resolution happens at
research time; UAT failures would indicate bugs against Plan 03-01
rather than design-level swaps.

---

## Area 2: Parent-Shim Presence Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit ping handshake on layer construction | `maps-plus:ping` → `maps-plus:pong` before first tile fetch, with timeout. Adds a mandatory round-trip on every DS dashboard load (~50–200ms) whether or not the bridge is absent. | ✗ |
| First-fetch timeout | First tile fires normally; iframe starts a timer. If no response within N ms, bridge marked absent for iframe lifetime. Common case (bridge present) pays zero extra cost. | ✓ (1500ms) |
| Hybrid (ping + concurrent first fetch) | Whichever responds first cancels the other. More code, more tests. | ✗ (Phase 3) |

**Claude's choice:** First-fetch timeout, 1500ms, per-iframe-lifetime
latch. `ping`/`pong` literals RESERVED in the four-type message allow-
list (parent ignores, iframe never sends) so a future phase can add
active health-checks without re-opening the message-type threat model.

**Rationale:** Common case (bridge present) pays zero extra round-trip
cost. Failure case (bridge absent) accumulates a single ~1.5s delay
before the iframe falls through to blank tiles. 1500ms is above p95
Splunk Web same-origin `fetch` latency on typical LAN-deployed Splunk
and below the point where a user perceives a stuck map.

**UAT adaptation:** If bridge-present responses routinely exceed 1500ms
under load, bump timeout to 3000ms (one-line change). If first-tile-
blank is perceivable and disruptive, switch to ping handshake or hybrid.
The detection logic is encapsulated in the `DsProxyTileLayer` instance
so the swap is contained.

---

## Area 3: Tile-Byte Transport

| Option | Description | Selected |
|--------|-------------|----------|
| Base64 string | Option A sketch default. Universally serializable. ~33% size overhead + encode/decode CPU cost on both sides. | ✗ |
| `ArrayBuffer` structured clone | Zero encode cost. Requires parent to convert `fetch` response to ArrayBuffer, iframe to wrap back into Blob before `createObjectURL`. Slightly more code than Blob. | ✗ (fallback) |
| `Blob` structured clone | Simplest: parent does `response.blob()` + postMessage; iframe does `URL.createObjectURL(blob)` directly. Supported in all target browsers. | ✓ |

**Claude's choice:** `Blob` via structured clone. Schema field name is
`tileData` (representation-agnostic) so a future swap to `ArrayBuffer`
or base64 doesn't require an RPC schema change.

**Rationale:**
- Zero encode/decode CPU overhead vs. base64's ~33% inflation.
- `URL.createObjectURL(blob)` → `img.src` is canonical Leaflet-compatible.
- Supported in Chrome/Firefox/Safari/Edge last 2 (CLAUDE.md matrix).
- Smaller rate-limit byte budget per tile (D-05).
- Cleaner Jest harness: `new Blob([uint8array], { type: 'image/png' })`
  is one line, no base64 round-trip in assertions.

**UAT adaptation:** If UAT uncovers a browser/Splunk Web combination
where structured-clone Blob fails (very unlikely given the matrix),
fall back to ArrayBuffer. Base64 is last-resort and explicitly
documented as such. All three representations are schema-compatible
because `tileData` is the field name.

---

## Area 4: URL-Shape Regex Sharing

| Option | Description | Selected |
|--------|-------------|----------|
| Exported constant + literal copy-paste + Jest drift-guard | Regex defined in `ds-tile-proxy-helpers.js`, literal-copied to `parent-auth-bridge.js`, Jest test compares both source files for literal-string match via marker comments. Simple, honest. | ✓ |
| Shared module loaded by both | Would require either a second Webpack entry for the parent shim or a build-step codegen. Disproportionate ceremony for a ~150-LOC shim. | ✗ |
| Regex duplicated silently (no drift guard) | Rejected — invites silent drift where the parent's regex stops matching the iframe's emitted URL. | ✗ |

**Claude's choice:** Option 1 (copy-paste with Jest drift guard). Marker
comments (`// BEGIN_PROXY_URL_SHAPE` / `// END_PROXY_URL_SHAPE`) bracket
the regex in both files; Jest extracts and string-compares.

**Rationale:** The parent shim is a stand-alone Splunk-Web-loaded
`<script>` IIFE — it cannot `require` the Webpack-bundled helper.
Standing up a second Webpack entry for a ~150-LOC shim is more
machinery than the sharing-by-copy-paste with a drift-guard test. Same
defense either way.

**Starting regex (specification intent — Plan 03-01 must verify
empirically against real UAT-2 URL):**
```
/^https?:\/\/[^/]+\/[\w\-\/]+\/services\/maps_plus\/tile\/proxy\?url=[^&]+&z=\d+&x=\d+&y=\d+(&s=[a-z])?(&r=[12])?$/
```

**UAT adaptation:** If UAT-2 replay shows the real URL prefix doesn't
match the anchor, update the regex, copy to both files, rerun drift
test, rebuild bundle. Narrow-and-fail-closed intentional: better to
learn in UAT that the regex is too strict than to ship a loose regex
that accepts malformed URLs containing the right substrings.

---

## Area 5: Rate Limit (Parent Side)

| Dimension | Option | Selected |
|-----------|--------|----------|
| **Algorithm** | Fixed-window counter | ✓ |
| | Sliding window / token bucket | ✗ (more code, no meaningful benefit) |
| **Window** | 1000ms | ✓ |
| | 100ms (finer granularity) | ✗ |
| **Limit** | 500 requests/window | ✓ (matches security property in REQUIREMENTS.md) |
| **Identity key** | `event.source` (`WindowProxy`) via `Map` | ✓ |
| | `event.origin` + client-generated nonce | ✗ (wrong: multiple iframes share origin `null`) |
| | `WeakMap` keyed on `event.source` | ✗ (not needed; manual stale-entry GC is simpler) |
| **Breach response** | Silent drop | ✓ |
| | `{ ok: false, code: 'rate_limited' }` | ✗ (gives abuser a signal; defer to follow-up phase if debugging demands it) |
| **Parent log** | One `console.warn` per breach window | ✓ |
| | One per dropped request | ✗ (log flood) |
| | Silent | ✗ (no diagnostic signal) |

**Claude's choice:** Fixed-window counter, 500 req/1000ms, keyed on
`event.source`, silent drop on breach, one `console.warn` per breach
window, stale entries GC'd at 60s idle.

**Rationale:**
- Fixed-window simpler code; 2× boundary burst is 1000 tiles over 2s,
  within Splunk Web's request ceiling and uninteresting from an abuse
  perspective.
- `event.source` identity correctly distinguishes multiple Maps+ iframes
  on the same page (which all share origin `null`).
- Silent drop denies abuser any signal about throttle engagement;
  legitimate case never hits the limit.
- One warn-per-window parallels iframe-side D-15 "one line per problem,
  no flood."
- 500/s gives 3–4× headroom over worst-case Leaflet pan-zoom fan-out
  (~120–180 tiles at max zoom, 4K display).

**UAT adaptation:** Rate limit is a tuning dial, not a security
boundary. If UAT shows legitimate use exceeds 500/s, bump the limit —
but only after measuring the observed rate. If debugging demands
`{ ok: false, code: 'rate_limited' }` signaling, add it in a follow-up
phase; Phase 3 ships silent drop.

---

## Area 6: `requestId` + Per-Request Timeout + In-Flight Cap

| Dimension | Option | Selected |
|-----------|--------|----------|
| **`requestId` format** | Monotonic integer per layer instance | ✓ |
| | Random string / UUID | ✗ (no security purpose; unnecessary dep/RNG) |
| **Per-request timeout** | 8000ms | ✓ |
| | 5000ms | ✗ (too tight vs Phase 1 upstream timeout) |
| | 15000ms | ✗ (UAT adaptation if Splunk Cloud needs it) |
| **Timeout log behavior** | First-logged, subsequent-suppressed | ✓ |
| | Every timeout logged | ✗ (flood on Leaflet pan-zoom cancellations) |
| | Silent | ✗ (no first-occurrence signal) |
| **In-flight cap** | 256 per layer | ✓ (matches Phase 1 cache working set) |
| | Uncapped | ✗ (DoS vector: compromised iframe opens 100K `fetch`es) |
| | 512 | ✗ (UAT adaptation if genuinely needed) |
| **Cap-breach response** | `{ ok: false, code: 'inflight_cap' }` → blank tile, no log | ✓ |
| | Queue and wait | ✗ (unbounded memory) |
| **Never-responding parent** | Orthogonal — bridge-absence timer (D-02) latches at first request; per-request timeout (D-06) covers slow responses | ✓ |

**Claude's choice:**
- `requestId` = monotonic int per `DsProxyTileLayer` instance.
- Per-request timeout = 8000ms (Phase 1 upstream = 10s, leaves 2s for
  network + middleware + postMessage).
- First timeout per iframe lifetime logged, subsequent suppressed with
  a one-line marker at suppression start.
- In-flight cap = 256 per layer instance.
- Cap breach → immediate `{ ok: false, code: 'inflight_cap' }`, no log.
- Bridge-absence (D-02) and per-request timeout (D-06) are orthogonal:
  absence latches once and stops sending postMessages; timeout covers
  individual slow responses while bridge is present.

**Rationale:**
- Monotonic int = smallest correlation nonce; zero security purpose so
  zero reason to use randomness.
- 8s buffer below Phase 1's 10s server timeout.
- Leaflet cancels tiles on pan/zoom, producing legitimate timeout-like
  events — logging each would violate D-15's "one line per problem."
- 256 in-flight cap = DoS mitigation. D-05 bounds rate; D-06 bounds
  concurrency.

**UAT adaptation:**
- Splunk Cloud p99 > 8s → bump to 15s.
- Legitimate multi-panel DS dashboards > 256 concurrent → bump to 512
  BUT investigate Leaflet cancellation first (usually indicates Leaflet
  is not cancelling on pan/zoom as it should).

---

## Claude's Discretion

Per user direction, Claude selected defaults for all six areas. User
retains final authority via the explicit UAT-adaptation notes on each
decision. Additional items left to Claude's discretion at plan-authoring
time:

- Exact file placement of `parent-auth-bridge.js` within
  `appserver/static/`.
- Exact Jest file naming (separate `parent-bridge.test.js` +
  `parent-bridge-drift.test.js` vs consolidation).
- jsdom vs node Jest environment for RPC suite (both work with mocks).
- IIFE/module-boundary style inside `parent-auth-bridge.js` as long as
  it does not require Webpack bundling.
- Sub-150-LOC code organization inside the shim.

## Deferred Ideas

All deferred ideas are captured in `03-CONTEXT.md` `<deferred>` section.
Summary:

- Active ping/pong health check (future phase; literals reserved).
- Cache warming from parent (new capability, new phase).
- Telemetry / error reporting over postMessage (not shipping).
- Cross-browser auth variants outside CLAUDE.md matrix (not supported).
- `SameSite=None; Secure` Splunk cookie change (not shippable from app).
- Non-tile RPCs over the bridge (new phases with new threat models).
- `{ ok: false, code: 'rate_limited' }` signaling (follow-up phase if
  UAT demands).
- jsdom vs node Jest environment (planner's call).
- Exact `PROXY_URL_SHAPE` anchor (planner empirically verifies in Plan
  03-01 against UAT-2 captured URL).

---

*End of Phase 3 discussion log.*
