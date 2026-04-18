# Phase 3: DS Parent-Frame Auth Bridge — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning (research recommended — load-point empirical question is real)
**Mode:** Interactive — Claude-judgement defaults on all 6 gray areas, per user direction that UAT will drive adaptation

<domain>
## Phase Boundary

Close the cross-origin authentication gap that Phase 02 UAT-2 uncovered. The
Splunk Dashboard Studio legacy custom-viz adapter hosts Maps+ inside an
`about:srcdoc` iframe whose origin is the string `null`. The browser enforces
`SameSite=Lax` cookie policy on Splunk's session cookie, which means every
cross-site subresource `fetch`/`<img src>` from origin `null` arrives at
Splunk Web with no `Cookie:` header, and Splunkweb's session middleware
redirects each tile request to `/en-US/account/login`. **This is a browser
security boundary, not a client bug — no amount of cookie-flag, CORS-header,
`fetch(credentials:'include')`, or ServiceWorker trickery can make the
browser send the cookie.** (MDN reference for null-origin SameSite behavior
must be cited in 03-RESEARCH.md.)

Phase 3 delivers:

- A parent-window shim (`appserver/static/parent-auth-bridge.js`) that runs
  in the top-level Splunk Web frame, is same-origin with Splunkweb, has the
  session cookie, and exposes exactly one postMessage RPC: on receipt of a
  `maps-plus:fetch-tile` request whose URL matches a single pinned URL
  shape, it performs an authenticated same-origin `fetch(url,
  { credentials: 'same-origin' })` and returns the response `Blob` as a
  `maps-plus:tile-result` message.
- Splunk Web load-point wiring so the shim is actually loaded on pages that
  host DS dashboards (empirical question — see D-01).
- An iframe-side `DsProxyTileLayer.createTile` override (extending the
  Phase 2 subclass at `maps-plus.js:135–167`) that issues postMessage
  requests to `window.top`, awaits a `Blob` response, and assigns
  `URL.createObjectURL(blob)` to `img.src`.
- A Jest cross-window RPC harness in `tests/` that exercises both ends of
  the protocol with faked `MessageEvent` `origin`/`source`.
- Manual UAT replay of UAT-2 through UAT-7 in `splunk-10-dev`.

**In scope:**
- Parent-window shim loaded in the Splunk Web top frame (DS-AUTH-01)
- Frozen two-message-type postMessage RPC: `maps-plus:fetch-tile` /
  `maps-plus:tile-result`; `maps-plus:ping` / `maps-plus:pong` reserved in
  the literal allow-list but **not implemented** this phase (DS-AUTH-02)
- Bidirectional exact-origin validation (`===`), both ends (DS-AUTH-03)
- URL-shape allow-list of one, anchored regex, shared literally between
  iframe and parent with a Jest drift-guard test (DS-AUTH-04)
- Zero-auth-material payload schemas, enforced by code review + Jest
  structural assertions (DS-AUTH-05)
- Graceful fallback when parent shim is absent — exactly one
  `[maps-plus:ds-proxy]` warning per iframe lifetime, blank tiles, no
  retry storm, DS dashboard does not crash (DS-AUTH-06)
- Per-iframe rate limit on the parent side, 500 requests per 1000ms
  fixed-window, silent drop + one warning per breach window
- Iframe-side per-request timeout + in-flight concurrency cap

**Out of scope (new phases or not shipping at all):**
- Any RPC type beyond the four pinned literals — future features
  (cache warming, telemetry, non-tile fetches, style JSON, KML proxying)
  are new phases with their own threat models (`.continue-here.md`
  blocking constraint 2).
- Changing Splunk's session cookie to `SameSite=None; Secure` — not
  shippable from a Splunk app (REQ-DS-07: no system config modifications).
- Cross-browser auth-bridge variants for browsers outside the supported
  matrix (Chrome/Firefox/Safari/Edge last 2 per CLAUDE.md).
- Vector tiles / KML / Bing — remain deferred to Milestone 2.
- Modifications to the Phase 1 server endpoint, SSRF allow-list, cache,
  or settings schema — Phase 1 SSRF allow-list remains authoritative for
  outbound fetches (`.continue-here.md` blocking constraint 4).
- Ping/pong active health-check implementation — literals reserved for a
  future phase if UAT data justifies it.

</domain>

<decisions>
## Implementation Decisions

### Trust Boundary & Non-Negotiables (inherited from `.continue-here.md` blocking constraints)

- **D-NN-1:** Browser security boundary is not a client bug. All solutions
  are parent-frame-bridge solutions. Any proposal to fix this with cookie
  flags, CORS headers, fetch credentials mode, `crossorigin` attributes,
  or ServiceWorker interception is rejected by construction. 03-RESEARCH.md
  must cite at least one MDN / HTML-spec reference confirming null-origin
  `SameSite=Lax` subresource cookie suppression.
- **D-NN-2:** postMessage message-type allow-list is exactly four literals:
  `maps-plus:fetch-tile`, `maps-plus:tile-result`, `maps-plus:ping`,
  `maps-plus:pong`. `ping`/`pong` are RESERVED for a future phase — Phase 3
  ships them as ignored literals. Any fifth type added by any plan fails
  Plan review.
- **D-NN-3:** No authentication material in payloads in either direction.
  Request schema: `{ type, requestId, url, z, x, y, s?, r? }`. Response
  schema (success): `{ type, requestId, ok: true, tileData, contentType }`.
  Response schema (failure): `{ type, requestId, ok: false, code,
  httpStatus? }`. Field name `tileData` is representation-agnostic (see
  D-03) so the schema survives a future transport swap.
- **D-NN-4:** Exact-origin validation (`===`) on both ends. No
  `String.prototype.includes`, `startsWith`, `endsWith`, regex substring,
  or wildcard. Jest acceptance requires negative tests against
  close-but-not-equal origins (e.g., `splunkweb-evil.example.com` vs
  target `splunkweb.example.com`, trailing-slash variants, port-differing
  variants) — all must be rejected.
- **D-NN-5:** Phase 1 server-side SSRF allow-list is authoritative. The
  bridge performs an authenticated same-origin `fetch` against a URL the
  iframe has already constructed — the server still validates the
  upstream host. The client-side URL-shape regex (D-04) is defense-in-depth
  shape-rejection only, not a second allow-list.
- **D-NN-6:** Graceful fallback on bridge absence → exactly ONE
  `[maps-plus:ds-proxy] parent bridge absent — tiles disabled` warning
  per iframe lifetime, blank tiles rendered, no retry storm, DS adapter
  does not receive an exception.

### D-01: Parent-Shim Load Point

**Decision — candidate order (authoritative resolution requires Plan 03-01
research step against `splunk-10-dev`):**

1. **Primary:** `appserver/static/parent-auth-bridge.js` included via
   `app.conf` `[ui]` stanza / standard Splunk-app static-JS resource
   mechanism (app-scoped; REQ-DS-07 compliant).
2. **Fallback A:** Nav XML include (per-app; still app-scoped).
3. **Fallback B:** Per-dashboard HTML panel drop-in, documented in the
   README as a manual opt-in for environments where app-scoped injection
   doesn't fire on DS routes.
4. **Escalation:** If none of the above reach DS dashboard view pages in
   Splunk 9.0+/10.x, Phase 3 documents a manual `local/web.conf` override
   the admin (not the app) can add, recorded as an accepted risk with a
   Phase 4 follow-up to track Splunk platform evolution.

**Why:** The app.conf/static path is the standard Splunk-app loading
mechanism, doesn't touch system config, and is verified empirically to
inject into Splunk Web pages in 9.x/10.x. DS page injection is the
empirical unknown Plan 03-01 research must confirm.

**Research matrix for Plan 03-01:** For each candidate mechanism, load
target `splunk-10-dev` and confirm whether the shim's IIFE runs on:
(i) Classic SimpleXML dashboard page, (ii) DS dashboard listing, (iii) DS
dashboard editor, (iv) DS dashboard view. Mechanism that covers at least
(iv) wins. If the first-choice mechanism doesn't cover (iv), the planner
walks down the fallback list.

**UAT adaptation:** None at UAT time — load point is resolved at research
time, not UAT time. If UAT reveals the chosen mechanism intermittently
fails to load on certain Splunk configurations, that's a bug against Plan
03-01, not a design-level swap.

### D-02: Parent-Shim Presence Detection

**Decision:** **First-fetch timeout, 1500ms, per-iframe-lifetime latch.**
No ping handshake on layer construction.

**Flow (iframe side):**
1. First `DsProxyTileLayer.createTile` call after DS detection issues its
   postMessage normally and starts a 1500ms bridge-absence timer.
2. If any `maps-plus:tile-result` arrives before the timer fires →
   bridge-present state latched for the iframe's lifetime. Timer cleared.
3. If the timer fires before any tile-result arrives → bridge-absent
   state latched. All in-flight request promises resolve as
   `{ ok: false, code: 'bridge_absent' }`. One
   `[maps-plus:ds-proxy] parent bridge absent — tiles disabled` warning
   is logged at latch time (not per abandoned request). All subsequent
   `createTile` calls synchronously return a blank `<img>` element
   without sending any postMessage.

**Ping/pong:** Literals reserved in the four-type allow-list. Parent shim
receives `maps-plus:ping` messages and silently ignores them (no pong
response in Phase 3). Iframe never sends pings. This preserves future
design space without opening the message-type threat surface.

**Why:** Ping adds a mandatory round-trip latency on every DS dashboard
load whether or not the bridge is absent; first-fetch-timeout pays zero
extra cost in the common case (bridge present) and only accumulates a
~1.5s delay when the bridge is actually missing, which is the rare case.
1500ms is well above p95 Splunk Web same-origin `fetch` latency on
typical LAN-deployed Splunk and below the point where a user perceives a
hung map.

**UAT adaptation:**
- If bridge-present tile responses routinely exceed 1500ms under load →
  bump timeout to 3000ms (one-line change).
- If the 1.5s "first tile blank" is perceivable and disruptive → switch
  to ping-handshake or hybrid (ping + concurrent first fetch). The
  detection logic is encapsulated in the `DsProxyTileLayer` instance,
  so this is a contained swap.

### D-03: postMessage Transport for Tile Bytes

**Decision:** **`Blob` via structured clone.**

**Parent:**
```js
const response = await fetch(url, { credentials: 'same-origin' });
const blob = await response.blob();
source.postMessage({
  type: 'maps-plus:tile-result',
  requestId,
  ok: true,
  tileData: blob,
  contentType: blob.type
}, expectedOrigin);
```

**Iframe:**
```js
const objectUrl = URL.createObjectURL(evt.data.tileData);
img.src = objectUrl;
img.onload = () => URL.revokeObjectURL(objectUrl);
img.onerror = () => URL.revokeObjectURL(objectUrl);
```

**Why:**
- Zero encode/decode CPU overhead vs. base64's ~33% size inflation and
  double encode/decode tax.
- `URL.createObjectURL(blob)` → `img.src` is the canonical
  Leaflet-compatible path. No `data:` URL memory bloat.
- Structured clone of `Blob` is supported in every target browser
  (Chrome/Firefox/Safari/Edge last 2 per CLAUDE.md).
- Smaller rate-limit byte budget per tile → the 500/s per-iframe limit
  (D-05) maps more directly to real network impact.
- Jest harness is cleaner: `new Blob([uint8array], { type: 'image/png' })`
  is one line, no base64 round-tripping in assertions.

**Blob lifecycle guarantee:** The iframe MUST revoke the object URL on
BOTH `img.onload` AND `img.onerror` to prevent object-URL accumulation
during pan-zoom storms. Jest pins this: mock `URL.createObjectURL` /
`URL.revokeObjectURL`, assert exactly one revoke per create.

**UAT adaptation:** If UAT uncovers a specific browser/Splunk Web
combination where structured-clone `Blob` in postMessage fails (very
unlikely given the target matrix), fall back to `ArrayBuffer` (iframe
wraps it back into a Blob before `createObjectURL`). Base64 is the
last-resort option and is explicitly documented as such. The schema field
name `tileData` is transport-agnostic, so all three representations are
schema-compatible — no RPC-level change needed for a fallback.

### D-04: URL-Shape Regex Sharing Strategy

**Decision:** **Exported constant in `ds-tile-proxy-helpers.js`,
literal-copy in `parent-auth-bridge.js`, Jest drift-guard test.**

**Regex (starting point — to be re-verified empirically in Plan 03-01
against a live UAT-2 captured URL):**

```js
// Pinned URL shape for the Phase 2 tile-proxy endpoint. Anchored, with
// fixed query-param order and fixed optional-param order. Drift-guard
// Jest test compares this literal source against the duplicate in
// parent-auth-bridge.js — any divergence fails CI.
var PROXY_URL_SHAPE = /^https?:\/\/[^/]+\/[\w\-\/]+\/services\/maps_plus\/tile\/proxy\?url=[^&]+&z=\d+&x=\d+&y=\d+(&s=[a-z])?(&r=[12])?$/;
```

Note: the starting regex above is a specification intent. The exact
URL-prefix anchor (e.g., `/en-US/splunkd/__raw/services/` vs.
`/servicesNS/{user}/{app}/`) must be confirmed by Plan 03-01 research
against a real UAT-2 captured request line and pinned to what
`buildTileProxyUrl` at `ds-tile-proxy-helpers.js:60–76` actually produces
at runtime via `_resolveSplunkRestRoot()`. The planner MUST verify the
regex matches real Phase 2 output before committing Plan 03-02.

**Sharing mechanism:**
1. `ds-tile-proxy-helpers.js` exports `PROXY_URL_SHAPE` as an exported
   constant on the module object.
2. `appserver/static/parent-auth-bridge.js` defines an identical
   `PROXY_URL_SHAPE` as an IIFE-local `var` — literal copy-paste, not
   dynamic loading.
3. A Jest test (`tests/parent-bridge-drift.test.js` or similar) reads
   both source files with `fs.readFileSync`, extracts the regex literal
   via a fenced marker comment pair (`// BEGIN_PROXY_URL_SHAPE` /
   `// END_PROXY_URL_SHAPE`), and `expect(parentRegexSource).toBe(
   iframeRegexSource)`. Any edit to one without the matching edit to
   the other fails CI.

**Why:** The parent shim is a stand-alone Splunk-Web-loaded `<script>`
IIFE — it cannot `require` the Webpack-bundled helper module, and
standing up a second Webpack entry for a ~150-LOC shim is disproportionate
ceremony. Copy-paste with a drift-guard is the honest version of "shared"
and produces exactly the same defense as a synthetic "build step that
generates the parent from the helper."

**What the regex does:** Pin that the URL has the correct prefix,
endpoint path, query-param names, and param order. Pin that optional
params are the expected shape (`s` is one lowercase letter, `r` is 1 or
2). Reject anything else before the parent dispatches `fetch`.

**What the regex does NOT do:** Does not validate the `url=` query-param
value (that's opaque percent-encoded data at this layer; the Phase 1
server decodes and SSRF-validates it). Does not block path traversal or
malicious upstream hosts — those are server concerns. This is defense-
in-depth shape-rejection only, not authorization.

**UAT adaptation:** If UAT-2 replay shows the real URL prefix doesn't
match the anchor (for example, Splunk returns `/en-US/splunkd/__raw/...`
on one install and `/servicesNS/nobody/leaflet_maps_app/...` on another),
update the regex anchor, copy-paste to both files, rerun the Jest drift
test, rebuild `visualization.js`. The regex is intentionally narrow:
fail-closed on unexpected shape and learn about it in UAT, rather than
fail-open on a looser regex that accepts malformed URLs that happen to
contain the right substrings.

### D-05: Parent-Side Rate Limit

**Decision:** **Fixed-window counter. 500 requests per 1000ms. Keyed on
`event.source` (`WindowProxy`). Silent drop on breach. One
`console.warn` per breach window.**

**Implementation:**
```js
// Parent shim, pseudocode
var rateMap = new Map(); // WindowProxy → { windowStart, count, warned }

function rateCheck(source, now) {
  var entry = rateMap.get(source);
  if (!entry || now - entry.windowStart >= 1000) {
    rateMap.set(source, { windowStart: now, count: 1, warned: false });
    return true; // allow
  }
  entry.count++;
  if (entry.count > 500) {
    if (!entry.warned) {
      console.warn('[maps-plus:parent-bridge] rate limit exceeded for iframe origin=' + evt.origin);
      entry.warned = true;
    }
    return false; // silently drop
  }
  return true;
}
```

**Stale-entry GC:** On each check, if `now - entry.windowStart > 60000`
for ANY map entry, the entry is deleted. (Cheap, no WeakRefs needed;
avoids unbounded map growth if an iframe sends one message then closes.)

**Breach response:** No `postMessage` sent at all. From the iframe's
perspective, rate-limited requests look identical to timeouts (D-06).
They become blank tiles after the 8s per-request timeout.

**Why:**
- Fixed-window is simpler (one integer + one timestamp per iframe) and
  the 2× boundary-burst worst case is 1000 tiles over 2 seconds, well
  within Splunk Web's request ceiling and uninteresting from an abuse
  perspective. A token bucket adds complexity and saves nothing.
- `event.source` (`WindowProxy`) is the correct identity key: it's
  stable across messages from the same iframe and correctly distinguishes
  multiple Maps+ iframes on the same page (which would all share origin
  `null` and could not be distinguished by origin alone).
- Silent drop denies an abuser any signal about when throttling engages,
  and the legitimate case (Leaflet pan-zoom fan-out) never hits the
  limit, so silent drop is indistinguishable from normal operation under
  normal use.
- One-warning-per-window on the parent side mirrors D-15's console
  hygiene on the iframe side: there IS a signal when something is
  wrong, but no log flood.

**Why 500/s:** A full-screen Leaflet redraw at max zoom across a 4K
display tops out at roughly 120–180 visible tiles. 500/s gives 3–4×
headroom to absorb pan-zoom burst without ever throttling legitimate
use. The target also matches DS-AUTH's stated security property in
REQUIREMENTS.md (`~500 requests/second, matching worst-case Leaflet
pan/zoom fan-out`).

**UAT adaptation:** The rate limit is a tuning dial, not a security
boundary. The security boundary is "there IS a limit and it is
per-iframe." If UAT shows legitimate use on dense retina displays or
multi-panel DS dashboards actually exceeds 500/s → bump the limit but
only after measuring the observed rate, never speculatively. If UAT
shows debugging would benefit from `{ ok: false, code: 'rate_limited' }`
signaling → add it in a follow-up phase; Phase 3 ships silent drop.

### D-06: `requestId`, Per-Request Timeout, In-Flight Cap

**`requestId` format:** Monotonic integer per `DsProxyTileLayer`
instance, starting at 1, incremented on each `createTile`. Stored on
`this._nextRequestId`. No randomness — `requestId`s never leave the
page and carry zero authority; they are correlation nonces only.

**Per-request timeout:** **8000ms** from iframe → parent postMessage send
to response-or-abandon. Rationale: Phase 1 server's `upstream_timeout`
is 10s (01-D-08); the bridge needs a 2s budget for network +
Splunk-Web-middleware + postMessage round-trip on top of the server
timeout.

**Timeout behavior:** Pending promise resolves as `{ ok: false, code:
'timeout' }`. Blank tile rendered. **First** timeout per iframe lifetime
is logged as `[maps-plus:ds-proxy] tile timeout (further suppressed
until next page load)`. Subsequent timeouts silently drop with no log.
(Leaflet cancels in-flight tile requests on pan/zoom, producing
legitimate timeout-like events; logging each would flood the console
and violate D-15's "one line per problem" intent.)

**In-flight concurrency cap:** **256 requests in flight per
`DsProxyTileLayer` instance**. Match Phase 1's in-memory cache size —
not coincidence, same natural working-set for a viewport.

**Cap-breach behavior:** New `createTile` calls while at cap resolve
immediately as `{ ok: false, code: 'inflight_cap' }` → blank tile. No
log (Leaflet may re-request on next pan/zoom, which is fine).

**Never-responding parent vs timeouts:** Orthogonal concerns.
- The 1500ms bridge-absence timer (D-02) fires ONCE per iframe lifetime
  based on the first request's outcome and latches the layer into
  "bridge absent" mode. Once latched, `createTile` returns a blank
  `<img>` synchronously without sending any postMessage — no timeouts
  can accrue.
- The 8000ms per-request timeout (D-06) applies to individual requests
  when the bridge is present-but-slow. Multiple of these can fire over
  the iframe's lifetime.

**Why:**
- Monotonic integer is the smallest possible correlation nonce and
  avoids any `Math.random()`/UUID dependency for a value that serves
  zero security purpose.
- 8s per-request timeout prevents accumulated in-flight promises from
  leaking memory during long idle periods or when the parent is
  silently rate-limiting (D-05).
- 256 in-flight cap prevents an attacker who controls iframe JS (the
  threat model assumes this possibility) from asking the parent to open
  100,000 simultaneous `fetch`es. D-05 bounds rate; D-06 bounds
  concurrency.
- First-timeout-logged + subsequent-suppressed matches D-15's "one line
  per problem, no flood" intent while still surfacing the first
  occurrence.

**UAT adaptation:**
- Splunk Cloud backend latencies exceed 8s at p99 → bump to 15s.
- Legitimate multi-panel DS dashboards genuinely need more than 256
  concurrent in flight → bump to 512 BUT investigate Leaflet cancellation
  first (hitting 256 usually indicates Leaflet is not cancelling on
  pan/zoom as it should).

### Claude's Discretion (per user direction)

Per the user's explicit direction ("I'll defer to your judgement... UAT
will make or break any of these decisions"), all six decisions above
were selected by Claude on the user's behalf rather than conversationally.
The user retains final authority at UAT: each decision has an explicit
**"UAT adaptation"** subsection identifying the concrete signal that
would flip it and the swap cost. Downstream agents (researcher, planner)
should treat the defaults above as starting points and Plan 03-01 /
03-02 SHOULD preserve the decision points as well-encapsulated so swaps
remain cheap.

Additional items left to Claude's discretion within Plan 03-01 / 03-02:

- Exact file placement of `parent-auth-bridge.js` within
  `appserver/static/` (root vs subfolder — deferred to planner).
- Exact Jest file naming/placement (`tests/parent-bridge.test.js`,
  `tests/parent-bridge-drift.test.js`, or consolidation with existing
  `tests/ds-tile-proxy-helpers.test.js` — deferred to planner).
- jsdom vs node environment choice for the RPC Jest suite (deferred —
  jsdom gives `MessageEvent` / `URL.createObjectURL`; node requires a
  small polyfill. Either works).
- Minor IIFE / module-boundary style in `parent-auth-bridge.js` as long
  as it does not require Webpack bundling (the shim ships as a
  hand-edited JS file, not a build output).
- Any sub-150-LOC code-organization choice inside the shim (one big
  IIFE vs small helper functions inside it).

### Folded Todos

_No pending todos matched Phase 3 scope — `todo match-phase 03`
returned zero matches._

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before
planning or implementing Phase 3.**

### Phase 3 Control Documents (read first)

- `.planning/phases/03-ds-parent-frame-auth-bridge/.continue-here.md` —
  Six BLOCKING anti-patterns (1: no client-side cookie/CORS "fix";
  2: no generic RPC surface; 3: no secrets in payloads; 4: no origin
  substring matching; 5: no retry storm on bridge absence; 6: no nested
  discuss-phase invocation). Infrastructure state, critical resume
  prompt. **Every downstream agent must check the six blocking rows
  before proposing anything.**
- `.planning/HANDOFF.json` — Structured state as of pause, decisions
  log from bootstrap session.
- `.planning/ROADMAP.md` §Phase 3 — Authoritative scope: 2-plan outline
  (03-01 parent shim + load-point wiring, 03-02 iframe override + Jest
  harness + UAT re-run), security properties list, out-of-scope list.
- `.planning/REQUIREMENTS.md` §DS Parent-Frame Auth Bridge (DS-AUTH) —
  DS-AUTH-01 through DS-AUTH-06 requirement IDs with acceptance notes
  and cross-cutting security properties.
- `.planning/STATE.md` §Accumulated Context / Roadmap Evolution — Why
  Phase 3 exists (late discovery during Phase 02 UAT-2, not scope creep).

### Phase 02 Origin Documents (bind Phase 3 design)

- `.planning/phases/02-maps-plus-js-integration-testing/02-UAT.md` —
  UAT-2 root-cause diagnosis (the null-origin `SameSite=Lax` browser
  boundary), request header capture, §Follow-ups design sketch (Option
  A). THIS IS THE AUTHORITATIVE SOURCE for the browser-boundary paragraph
  the research agent must cite in 03-RESEARCH.md per D-NN-1.
- `.planning/phases/02-maps-plus-js-integration-testing/02-CONTEXT.md` —
  All 23 Phase 02 decisions. Phase 3 MUST honor all of them; especially
  D-07 (URL shape is query-param), D-09 (client pre-merges non-server
  tokens like `{gibsLayerId}`), D-15 (console hygiene / `[maps-plus:ds-
  proxy]` prefix), D-18/D-19/D-20 (Jest + babel-jest harness layout),
  D-22 (rebuild & commit `visualization.js` on every source change).
- `.planning/phases/02-maps-plus-js-integration-testing/02-UAT-MATRIX.md` —
  34-row reference matrix for UAT replay.
- `.planning/phases/02-maps-plus-js-integration-testing/02-01-SUMMARY.md`
  and `02-02-SUMMARY.md` — Implementation summaries for the
  `DsProxyTileLayer` subclass, `ds-tile-proxy-helpers.js` helpers, and
  Jest harness that Phase 3 extends.

### Phase 01 Server Contract (unchanged — Phase 3 is client-only)

- `.planning/phases/01-rest-proxy-backend-routing/01-CONTEXT.md` §D-04 —
  Proxy inherits caller's Splunk session permissions (the root reason
  Phase 3 exists: server requires cookie, null-origin iframe can't send
  it, parent frame bridges).
- `.planning/phases/01-rest-proxy-backend-routing/01-SECURITY.md` — SSRF
  allow-list is authoritative for all outbound tile fetches. Phase 3
  does NOT duplicate, extend, or weaken it (per blocking anti-pattern 4
  from `.continue-here.md`).
- `bin/tile_proxy.py` `_resolve_tile` (lines ~291–316) — Server
  substitutes only `{z}, {x}, {y}, {s}, {r}`. This is why Phase 02 D-09
  errata pre-merges other tokens client-side, and the URL-shape regex
  in Phase 3 (D-04) must match the result.
- `default/restmap.conf` — Confirms the final `/maps_plus/tile/proxy`
  route and `requireAuthentication = true`.

### Project-Level

- `.planning/PROJECT.md` — REQ-DS-01 (DS detection), REQ-DS-07 (app-scoped
  only, no system config modifications — THIS RULES OUT `web.conf`
  changes in Phase 3 and shapes D-01 load-point candidate order), Key
  Decisions table.
- `CLAUDE.md` — Build/deploy rules: `npm install --ignore-scripts` in
  `appserver/static/visualizations/maps-plus/`, commit
  `visualization.js` + `visualization.css` after every source change,
  release checklist. The `--ignore-scripts` requirement is non-optional
  (leaflet-measure fork has transitive node-sass that fails modern Node).

### Codebase Maps

- `.planning/codebase/ARCHITECTURE.md` — AMD/RequireJS bundle layout,
  Splunk Web integration, how static JS files are loaded by Splunk Web.
  Especially relevant to D-01 load-point research.
- `.planning/codebase/STACK.md` — Webpack 5 + Babel 7 build chain; why
  the parent shim ships as a hand-edited IIFE rather than a Webpack
  entry (D-04 rationale).
- `.planning/codebase/CONVENTIONS.md` — JS style for the parent shim.
  Phase 3's shim is new stand-alone code; should match surrounding style.
- `.planning/codebase/TESTING.md` — Current Jest posture from Phase 02;
  Phase 3 extends this harness.
- `.planning/codebase/INTEGRATIONS.md` — Splunk Web /
  `SplunkVisualizationBase` lifecycle; how DS's legacy custom-viz
  adapter loads the iframe.

### Existing Code Phase 3 Extends / Reads

- `appserver/static/visualizations/maps-plus/src/maps-plus.js`
  lines 88–111 (`_detectSplunkOrigin()`) — Source of truth for the
  iframe's expected top-frame origin. Used for bidirectional origin
  validation per DS-AUTH-03.
- `appserver/static/visualizations/maps-plus/src/maps-plus.js`
  lines 135–167 (`DsProxyTileLayer`) — Existing subclass. Phase 3 adds
  a `createTile` override to this class (override the method Leaflet
  calls to build the `<img>` element — not just `getTileUrl`).
- `appserver/static/visualizations/maps-plus/src/maps-plus.js`
  lines 169–187 (`_createMapsPlusTileLayer`) — Factory that instantiates
  `DsProxyTileLayer` in DS mode; includes the existing `tileerror`
  instrumentation Phase 3 preserves.
- `appserver/static/visualizations/maps-plus/src/ds-tile-proxy-helpers.js` —
  `isDashboardStudio`, `normalizeTileTemplate`, `buildTileProxyUrl`,
  `SERVER_RESOLVED_TOKENS`. Phase 3 adds `PROXY_URL_SHAPE` regex export
  here per D-04.
- `appserver/static/visualizations/maps-plus/tests/ds-tile-proxy-helpers.test.js` —
  Existing Jest suite. Phase 3 adds new test files alongside (parent-
  bridge RPC harness + drift guard).
- `appserver/static/visualizations/maps-plus/package.json` — Jest and
  babel-jest already in devDependencies from Phase 02; no dep changes
  expected for Phase 3 unless jsdom environment is chosen (planner's
  discretion).
- `appserver/static/visualizations/maps-plus/webpack.config.js` — No
  change expected. The parent shim is NOT a Webpack entry.

### Splunk Platform References (external — researcher fetches)

- Splunk docs on `app.conf` `[ui]` stanza and `appserver/static/`
  resource loading mechanism — primary candidate for D-01 load point.
- Splunk docs on Dashboard Studio legacy custom-viz adapter iframe
  lifecycle — confirmation that `about:srcdoc` is the stable runtime
  shape across Splunk 9.x / 10.x.
- Splunk docs on nav XML include mechanisms — D-01 fallback candidate.

### Web Platform References (external — researcher fetches at least one)

- **MDN / HTML Living Standard reference on `SameSite=Lax` behavior for
  cross-site subresource requests from null origins** — REQUIRED citation
  in 03-RESEARCH.md per D-NN-1 (blocking anti-pattern 1 prevention
  mechanism). Without this citation, the research step fails its own
  acceptance criterion and the planner should reject the research
  output.
- MDN `Window.postMessage()` — `event.origin` / `event.source` semantics,
  structured-clone algorithm behavior for `Blob`.
- MDN `URL.createObjectURL()` / `URL.revokeObjectURL()` — object-URL
  lifecycle, memory implications for D-03.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`isDashboardStudio(window)`** at
  `appserver/static/visualizations/maps-plus/src/ds-tile-proxy-helpers.js:11–25` —
  Hardened DS-runtime detection covering four signals (the flag, two
  `about:srcdoc` URL checks, and null-origin iframe check). Phase 3
  uses this unchanged; the iframe side does not re-implement DS detection.
- **`_detectSplunkOrigin()`** at
  `appserver/static/visualizations/maps-plus/src/maps-plus.js:88–111` —
  Parses Splunk Web origin from the `visualization.js` script-tag `src`.
  This is THE source of truth for the iframe's expected top-frame
  origin, used by DS-AUTH-03 bidirectional exact-origin validation.
  The parent shim's expected origin is its own `window.location.origin`
  (it's same-origin with Splunk Web by construction).
- **`DsProxyTileLayer`** at
  `appserver/static/visualizations/maps-plus/src/maps-plus.js:135–167` —
  Existing Phase 02 subclass overrides `initialize`, `setUrl`,
  `getTileUrl`. Phase 3 adds a `createTile` override to this class. The
  `setUrl` override that stores `_innerTemplate` is why cross-instance
  template updates (lines 437/443/445 in `maps-plus.js`) continue to
  work transparently.
- **`_createMapsPlusTileLayer(viz, template, tileOptions)`** factory at
  `maps-plus.js:169–187` — Attaches `_dsRestRoot` to each instance and
  wires the `tileerror` handler with the `[maps-plus:ds-proxy]` prefix.
  Phase 3 preserves all of this; the `createTile` override is additive.
- **`buildTileProxyUrl`** and **`normalizeTileTemplate`** in
  `ds-tile-proxy-helpers.js:38–76` — Already produce the exact URL
  shape the D-04 regex must match. The regex should be defined in this
  file (new export) and literal-copied into `parent-auth-bridge.js`.
- **Existing Jest harness** at
  `appserver/static/visualizations/maps-plus/tests/ds-tile-proxy-helpers.test.js` —
  24 tests covering detection, normalization, URL construction. Phase 3
  adds new test files alongside (shares `jest.config.*` and
  `babel.config.*`, no test-infrastructure setup needed).

### Established Patterns

- **AMD `define([...], function(...) { ... })` module boundary** — Any
  new dependencies on the iframe side (inside `maps-plus.js`) must be
  listed in both the `define` array AND the factory's parameter list
  at the same position (UAT-1 defect: position-42 AMD param bound to
  position-42 factory arg). Jest harness doesn't exercise AMD wiring,
  so this must be verified manually via a smoke load in `splunk-10-dev`
  — noted as a UAT-1 regression check in Plan 03-02.
- **Console hygiene via `[maps-plus:ds-proxy]` prefix** — Phase 02 D-15.
  Phase 3 reuses the exact same prefix on the iframe side and adds
  `[maps-plus:parent-bridge]` on the parent side. Body shape: stable
  prefix + short message, no PII, no stack trace, no URL, no secrets.
  One line per distinct condition per iframe lifetime (or per rate-limit
  window, parent side).
- **`this._isDashboardStudio` boolean guard** — Phase 02 D-04. Every
  new Phase-3 code path on the iframe side lives behind this guard;
  Classic mode must remain byte-identical (DS-JS-04 hard constraint
  carried forward).
- **Rebuild + commit `visualization.js`** — Phase 02 D-22, CLAUDE.md.
  Any edit to `src/maps-plus.js` or `src/ds-tile-proxy-helpers.js` ends
  with `npm run build` + committing `visualization.js` and
  `visualization.css`. Plan 03-02 must include this as an explicit task.
- **`npm install --ignore-scripts`** — CLAUDE.md. If Plan 03-01 or
  03-02 introduce any dep (unlikely — jsdom for Jest is the only
  candidate), the install step must use this flag.

### Integration Points

- **`DsProxyTileLayer.createTile(coords, done)`** — Phase 3's main
  iframe-side addition. Current subclass uses Leaflet's default
  `createTile` (which calls `getTileUrl` + creates `<img>`). Phase 3
  replaces this with a version that issues a postMessage to `window.top`
  with exact-origin validation, awaits the `tileData` Blob response,
  creates an object URL, and assigns to the `img.src`. The `done`
  callback is invoked on load/error for Leaflet's internal tracking.
- **Top-frame window reference** — `window.top` in the iframe is the
  top-level Splunk Web window. In the `about:srcdoc` case,
  `window.parent === window.top` (no nested iframes between). The shim
  listens on `window.addEventListener('message', handler)` at the top
  frame.
- **Expected origin derivation on parent side** — Parent shim uses
  `window.location.origin` (it is same-origin with Splunk Web by
  construction; this is its single expected-origin value for iframe-
  origin validation during postMessage response delivery, which is
  `source.postMessage(..., expectedOrigin)`). Since iframe origin is
  `null`, the parent's target-origin parameter is the string `'null'`.
  This is a counterintuitive but correct postMessage usage: the target
  origin match is against the `WindowProxy`'s actual origin, which is
  `null` for the srcdoc iframe.
- **Iframe-side expected-origin** — `_detectSplunkOrigin()` at
  `maps-plus.js:88`. Iframe validates `event.origin === _detectSplunkOrigin()`
  (exact string equality) before trusting any message.
- **Leaflet `createTile(coords, done)` signature** — Standard Leaflet
  TileLayer hook. Returns a DOM element; calls `done(error, tile)` on
  async load completion. Phase 3's override must honor this contract
  exactly for Leaflet's internal tile-lifecycle bookkeeping.

### Creative Constraints

- **No new runtime deps in the Webpack bundle** — Phase 02 established
  this. Phase 3 uses only browser-native `postMessage`, `URL`, `fetch`
  — no library additions.
- **Parent shim is NOT in the Webpack bundle** — It ships as
  `appserver/static/parent-auth-bridge.js`, hand-edited, IIFE-scoped,
  no build step. This is why D-04's URL-shape regex is copy-pasted
  rather than imported.
- **Classic Splunk mode unchanged** — Same rule as Phase 02. The Phase
  3 `createTile` override lives inside `DsProxyTileLayer`, which is
  only instantiated when `_isDashboardStudio === true`. No code path
  outside that boolean gate is touched in `maps-plus.js`.
- **Splunk AppCert compliance** — REQ-DS-07. No `web.conf`, no
  `authentication.conf`, no system-level file writes. The shim loads
  via standard Splunk-app static-resource mechanism only (D-01 primary
  path).

</code_context>

<specifics>
## Specific Ideas

- **Starting reference for the postMessage protocol:** 02-UAT.md §
  Follow-ups, "Design sketch for Phase 03 (Option A from the UAT
  conversation)." Phase 3 implements that sketch with the six decisions
  above locking its open points. Treat the sketch as starting input,
  not finished design — every field, every message type, every behavior
  is refined by D-NN-1 through D-06.
- **Leaflet `createTile` API:** Direct override of the method, not a
  wrapper. Use `L.TileLayer.extend({ createTile: function(coords, done)
  { ... } })`. Inside the override: construct the `<img>` element
  manually (or reuse Leaflet's `L.DomUtil.create('img')`), register
  load/error handlers, issue the postMessage request, and — on response
  — assign `URL.createObjectURL(blob)` to `img.src`. Blob revocation
  happens in both `img.onload` and `img.onerror`.
- **Structured-clone `Blob` across postMessage:** This is well-supported
  but subtle — the receiving side gets a fresh `Blob` object, not a
  reference. No `fetch(url).then(r => r.blob())` indirection needed on
  the iframe side; the Blob arrives complete and `createObjectURL` is
  synchronous.
- **First-fetch timeout vs abort:** The iframe does NOT cancel
  postMessage requests in transit (there is no cancellation primitive
  for postMessage). The 8s per-request timeout (D-06) and 1500ms
  bridge-absence timer (D-02) are iframe-side bookkeeping: pending
  promises resolve with error codes; if the parent eventually does
  respond after the timeout, the response is matched against a missing
  request-id and dropped silently.
- **Jest test for drift-guard:** `fs.readFileSync(helpersPath,
  'utf-8').match(/BEGIN_PROXY_URL_SHAPE[\s\S]*?END_PROXY_URL_SHAPE/)[0]`
  vs same extraction from `parent-auth-bridge.js`, then `expect(a).toBe(
  b)`. The marker comments are the extraction anchor; the regex between
  them is the drift target. Example marker pair:
  ```js
  // BEGIN_PROXY_URL_SHAPE — drift-guarded, must match parent-auth-bridge.js
  var PROXY_URL_SHAPE = /.../;
  // END_PROXY_URL_SHAPE
  ```

</specifics>

<deferred>
## Deferred Ideas

- **Active ping/pong health check** — Literals `maps-plus:ping` and
  `maps-plus:pong` are reserved in Phase 3's four-type allow-list but
  not implemented. Future phase can add active health checks (periodic
  ping from iframe, with pong timeout signaling bridge failure
  mid-lifetime) without re-opening the message-type threat surface. Do
  NOT implement in Phase 3.
- **Cache warming from the parent** — Out of scope. The parent shim
  does one thing: serve tile-fetch requests. Pre-warming the server
  cache is a new capability and would require a new message type.
- **Telemetry / error reporting over postMessage** — Out of scope.
  Parent shim errors are `console.warn`'d with the `[maps-plus:parent-
  bridge]` prefix; iframe errors are `console.warn`'d with the
  `[maps-plus:ds-proxy]` prefix. No structured telemetry channel.
- **Cross-browser auth-bridge variants** — Target is Chrome/Firefox/
  Safari/Edge last 2 (CLAUDE.md matrix). Other browsers are not
  supported.
- **Changing Splunk's session cookie to `SameSite=None; Secure`** — Not
  shippable from an app (REQ-DS-07). Would close the root cause but
  requires system-config modification and would be a platform decision,
  not an app decision.
- **Non-tile RPCs over the same bridge** — MapLibre vector tiles, KML/
  KMZ proxying, style-JSON proxying, any other cross-origin fetch
  need inside the DS iframe. All new phases with their own threat
  models. Do NOT extend the message-type allow-list in Phase 3 to
  "make it easier later."
- **`{ ok: false, code: 'rate_limited' }` signaling** — Phase 3 ships
  silent drop on rate-limit breach (D-05). If UAT or later operational
  experience shows a debugging use case for explicit signaling, add it
  in a follow-up phase.
- **jsdom vs node Jest environment decision** — Deferred to Plan 03-02
  planner. Both work for testing postMessage semantics with mocks;
  jsdom gives more native DOM APIs but is heavier. Either is
  acceptable.
- **Exact `PROXY_URL_SHAPE` anchor** — The starting regex in D-04 is
  specification intent. Plan 03-01 research must empirically confirm
  the URL-prefix anchor against a captured UAT-2 request line from
  `splunk-10-dev` before committing the final regex.

### Reviewed Todos (not folded)

_`todo match-phase 03` returned zero matches — no todos to review._

</deferred>

---

*Phase: 03-ds-parent-frame-auth-bridge*
*Context gathered: 2026-04-18*
*Mode: interactive — Claude-judgement on all 6 gray areas per user direction (UAT-adaptable defaults)*
*Next: `/gsd-plan-phase 3` (answer YES to research prompt — load-point question and URL-prefix empirical confirmation both require research)*
