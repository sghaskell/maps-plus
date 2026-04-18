# Phase 3: DS Parent-Frame Auth Bridge — Research

**Researched:** 2026-04-18  
**Domain:** Browser cookies (`SameSite`), `postMessage` / `MessageEvent`, Leaflet 1.9 `TileLayer` / `GridLayer`, Splunk Web static-asset injection, Jest in Node  
**Confidence:** MEDIUM (web platform: HIGH; Splunk load-point matrix: MEDIUM–LOW pending live `splunk-10-dev` verification)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Trust Boundary & Non-Negotiables (inherited from `.continue-here.md` blocking constraints)

- **D-NN-1:** Browser security boundary is not a client bug. All solutions are parent-frame-bridge solutions. Any proposal to fix this with cookie flags, CORS headers, fetch credentials mode, `crossorigin` attributes, or ServiceWorker interception is rejected by construction. 03-RESEARCH.md must cite at least one MDN / HTML-spec reference confirming null-origin `SameSite=Lax` subresource cookie suppression.
- **D-NN-2:** postMessage message-type allow-list is exactly four literals: `maps-plus:fetch-tile`, `maps-plus:tile-result`, `maps-plus:ping`, `maps-plus:pong`. `ping`/`pong` are RESERVED for a future phase — Phase 3 ships them as ignored literals. Any fifth type added by any plan fails Plan review.
- **D-NN-3:** No authentication material in payloads in either direction. Request schema: `{ type, requestId, url, z, x, y, s?, r? }`. Response schema (success): `{ type, requestId, ok: true, tileData, contentType }`. Response schema (failure): `{ type, requestId, ok: false, code, httpStatus? }`. Field name `tileData` is representation-agnostic (see D-03) so the schema survives a future transport swap.
- **D-NN-4:** Exact-origin validation (`===`) on both ends. No `String.prototype.includes`, `startsWith`, `endsWith`, regex substring, or wildcard. Jest acceptance requires negative tests against close-but-not-equal origins (e.g., `splunkweb-evil.example.com` vs target `splunkweb.example.com`, trailing-slash variants, port-differing variants) — all must be rejected.
- **D-NN-5:** Phase 1 server-side SSRF allow-list is authoritative. The bridge performs an authenticated same-origin `fetch` against a URL the iframe has already constructed — the server still validates the upstream host. The client-side URL-shape regex (D-04) is defense-in-depth shape-rejection only, not a second allow-list.
- **D-NN-6:** Graceful fallback on bridge absence → exactly ONE `[maps-plus:ds-proxy] parent bridge absent — tiles disabled` warning per iframe lifetime, blank tiles rendered, no retry storm, DS adapter does not receive an exception.

### D-01: Parent-Shim Load Point

**Decision — candidate order (authoritative resolution requires Plan 03-01 research step against `splunk-10-dev`):**

1. **Primary:** `appserver/static/parent-auth-bridge.js` included via `app.conf` `[ui]` stanza / standard Splunk-app static-JS resource mechanism (app-scoped; REQ-DS-07 compliant).
2. **Fallback A:** Nav XML include (per-app; still app-scoped).
3. **Fallback B:** Per-dashboard HTML panel drop-in, documented in the README as a manual opt-in for environments where app-scoped injection doesn't fire on DS routes.
4. **Escalation:** If none of the above reach DS dashboard view pages in Splunk 9.0+/10.x, Phase 3 documents a manual `local/web.conf` override the admin (not the app) can add, recorded as an accepted risk with a Phase 4 follow-up to track Splunk platform evolution.

**Why:** The `app.conf`/static path is the standard Splunk-app loading mechanism, doesn't touch system config, and is verified empirically to inject into Splunk Web pages in 9.x/10.x. DS page injection is the empirical unknown Plan 03-01 research must confirm.

**Research matrix for Plan 03-01:** For each candidate mechanism, load target `splunk-10-dev` and confirm whether the shim's IIFE runs on: (i) Classic SimpleXML dashboard page, (ii) DS dashboard listing, (iii) DS dashboard editor, (iv) DS dashboard view. Mechanism that covers at least (iv) wins. If the first-choice mechanism doesn't cover (iv), the planner walks down the fallback list.

**UAT adaptation:** None at UAT time — load point is resolved at research time, not UAT time. If UAT reveals the chosen mechanism intermittently fails to load on certain Splunk configurations, that's a bug against Plan 03-01, not a design-level swap.

### D-02: Parent-Shim Presence Detection

**Decision:** **First-fetch timeout, 1500ms, per-iframe-lifetime latch.** No ping handshake on layer construction.

**Flow (iframe side):**
1. First `DsProxyTileLayer.createTile` call after DS detection issues its postMessage normally and starts a 1500ms bridge-absence timer.
2. If any `maps-plus:tile-result` arrives before the timer fires → bridge-present state latched for the iframe's lifetime. Timer cleared.
3. If the timer fires before any tile-result arrives → bridge-absent state latched. All in-flight request promises resolve as `{ ok: false, code: 'bridge_absent' }`. One `[maps-plus:ds-proxy] parent bridge absent — tiles disabled` warning is logged at latch time (not per abandoned request). All subsequent `createTile` calls synchronously return a blank `<img>` element without sending any postMessage.

**Ping/pong:** Literals reserved in the four-type allow-list. Parent shim receives `maps-plus:ping` messages and silently ignores them (no pong response in Phase 3). Iframe never sends pings.

**UAT adaptation:** If bridge-present tile responses routinely exceed 1500ms under load → bump timeout to 3000ms. If the 1.5s "first tile blank" is perceivable and disruptive → switch to ping-handshake or hybrid.

### D-03: postMessage Transport for Tile Bytes

**Decision:** **`Blob` via structured clone.**

**Blob lifecycle guarantee:** The iframe MUST revoke the object URL on BOTH `img.onload` AND `img.onerror`.

**UAT adaptation:** If structured-clone `Blob` in postMessage fails, fall back to `ArrayBuffer` then base64 per CONTEXT.

### D-04: URL-Shape Regex Sharing Strategy

**Decision:** **Exported constant in `ds-tile-proxy-helpers.js`, literal-copy in `parent-auth-bridge.js`, Jest drift-guard test.**

**Regex (starting point — re-verified empirically in Plan 03-01 against live UAT-2 URL):**

```js
var PROXY_URL_SHAPE = /^https?:\/\/[^/]+\/[\w\-\/]+\/services\/maps_plus\/tile\/proxy\?url=[^&]+&z=\d+&x=\d+&y=\d+(&s=[a-z])?(&r=[12])?$/;
```

**Sharing mechanism:** marker comments `// BEGIN_PROXY_URL_SHAPE` / `// END_PROXY_URL_SHAPE`; Jest string-compares extracted literals.

### D-05: Parent-Side Rate Limit

**Decision:** Fixed-window counter. 500 requests per 1000ms. Keyed on `event.source` (`WindowProxy`). Silent drop on breach. One `console.warn` per breach window. Stale-entry GC at 60s idle per entry.

### D-06: `requestId`, Per-Request Timeout, In-Flight Cap

Monotonic integer `requestId`; 8000ms per-request timeout; 256 in-flight cap; first-timeout log then suppress; cap-breach `{ ok: false, code: 'inflight_cap' }` no log.

### Claude's Discretion (per user direction)

Per the user's explicit direction ("I'll defer to your judgement... UAT will make or break any of these decisions"), all six decisions above were selected by Claude on the user's behalf rather than conversationally. The user retains final authority at UAT: each decision has an explicit **"UAT adaptation"** subsection in CONTEXT.md.

Additional items left to Claude's discretion within Plan 03-01 / 03-02:

- Exact file placement of `parent-auth-bridge.js` within `appserver/static/` (root vs subfolder — deferred to planner).
- Exact Jest file naming/placement (`tests/parent-bridge.test.js`, `tests/parent-bridge-drift.test.js`, or consolidation with existing `tests/ds-tile-proxy-helpers.test.js` — deferred to planner).
- jsdom vs node environment choice for the RPC Jest suite (deferred — jsdom gives `MessageEvent` / `URL.createObjectURL`; node requires a small polyfill. Either works).
- Minor IIFE / module-boundary style in `parent-auth-bridge.js` as long as it does not require Webpack bundling (the shim ships as a hand-edited JS file, not a build output).
- Any sub-150-LOC code-organization choice inside the shim (one big IIFE vs small helper functions inside it).

### Folded Todos

_No pending todos matched Phase 3 scope — `todo match-phase 03` returned zero matches._

### Deferred Ideas (OUT OF SCOPE)

Content copied from `.planning/phases/03-ds-parent-frame-auth-bridge/03-CONTEXT.md` `<deferred>` section:

- **Active ping/pong health check** — Literals `maps-plus:ping` and `maps-plus:pong` are reserved in Phase 3's four-type allow-list but not implemented.
- **Cache warming from the parent** — Out of scope.
- **Telemetry / error reporting over postMessage** — Out of scope.
- **Cross-browser auth-bridge variants** — Target is Chrome/Firefox/Safari/Edge last 2 (CLAUDE.md matrix). Other browsers are not supported.
- **Changing Splunk's session cookie to `SameSite=None; Secure`** — Not shippable from an app (REQ-DS-07).
- **Non-tile RPCs over the same bridge** — New phases with new threat models.
- **`{ ok: false, code: 'rate_limited' }` signaling** — Follow-up phase if UAT demands.
- **jsdom vs node Jest environment** — Planner's call.
- **Exact `PROXY_URL_SHAPE` anchor** — Planner empirically verifies in Plan 03-01 against UAT-2 captured URL.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Requirement (abridged) | Research support |
|----|-------------------------|------------------|
| DS-AUTH-01 | Parent shim in top frame + load wiring | RT-2 matrix; Splunk `[ui]` spec has no obvious JS-include keys [CITED: docs.splunk.com Appconf] — **empirical Plan 03-01 task required**; `appserver/static/` URL pattern for manual `<script src>` remains standard Splunk static hosting [ASSUMED: common Splunk app practice]. |
| DS-AUTH-02 | Frozen RPC types (`fetch-tile` / `tile-result`; ping/pong reserved) | Locked D-NN-2; grep-based acceptance unchanged. |
| DS-AUTH-03 | Bidirectional `===` origin checks | MDN `Window.postMessage` / `MessageEvent` `origin` semantics [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage]; iframe side uses `_detectSplunkOrigin()` [VERIFIED: `maps-plus.js:88-111`]. |
| DS-AUTH-04 | Single URL-shape regex + drift guard | RT-3: align regex to `buildTileProxyUrl` + UAT-2 line; export + copy + Jest markers per D-04. |
| DS-AUTH-05 | No secrets in payloads | Structured clone carries `Blob` bytes only; schema per D-NN-3; update REQUIREMENTS.md example away from `blobBase64` when planning (doc drift vs D-03) [VERIFIED: REQUIREMENTS.md still mentions blobBase64 — planner note]. |
| DS-AUTH-06 | Graceful bridge absence | D-02 latch + blank `<img>` + one warn; aligns with Leaflet `done(error, tile)` error paths [VERIFIED: Leaflet `TileLayer.js` `_tileOnError`]. |

</phase_requirements>

## Summary

Phase 3 closes a **browser-enforced** gap: Splunk session cookies marked `SameSite=Lax` are not attached to **cross-site subresource** requests issued as `<img>` loads from Dashboard Studio’s **`about:srcdoc` / opaque `null` origin** iframe. MDN documents that `Lax` excludes subresource requests (including `<img>`) on cross-site navigations, and that **opaque origins are never same-origin with any other origin**; combined with UAT-2’s `Sec-Fetch-Site: cross-site` + missing `Cookie:` line, this is the primary-source chain for D-NN-1 [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value] [CITED: https://developer.mozilla.org/en-US/docs/Glossary/Origin] [VERIFIED: `.planning/phases/02-maps-plus-js-integration-testing/02-UAT.md` §UAT-2].

The **parent-frame shim** must run in the Splunk Web top browsing context (same site as Splunkweb, session cookie present) and perform **narrow `postMessage` RPC** + **`fetch(..., { credentials: 'same-origin' })`**. **`Window.postMessage` uses the structured clone algorithm** for `message` data [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage]; **`Blob`** is the standard binary carrier for tile bytes; **`URL.createObjectURL(blob)`** is documented as suitable for `<img src>` [CITED: https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Blob].

**Leaflet 1.9.4** (`node_modules/leaflet`): `TileLayer.createTile(coords, done)` returns an `HTMLImageElement`, wires `load`/`error` to invoke `done(null, tile)` or error path; `GridLayer._addTile` treats `createTile.length >= 2` as **async** and defers `_tileReady` until `done` fires [VERIFIED: `appserver/static/visualizations/maps-plus/node_modules/leaflet/src/layer/tile/TileLayer.js:143-171`, `GridLayer.js:806-819`].

**Splunk `app.conf` `[ui]`** (official Splunk Enterprise 10.2.0 spec excerpt on docs.splunk.com, last updated **2026-02-04** per page metadata): defines visibility, label, `setup_view`, `supported_themes`, etc. — **no key for “include arbitrary `appserver/static/*.js` on every Splunk Web page”** appears in that stanza [CITED: https://docs.splunk.com/Documentation/Splunk/latest/Admin/Appconf]. Treat **D-01 primary** (“`app.conf` `[ui]` + static JS”) as **implementation shorthand that still requires an empirically verified wiring pattern** (possible interpretations: app template overrides under `appserver/templates/`, a documented script hook not shown in the `[ui]` excerpt, or another supported extension). **Confidence: MEDIUM–LOW** until verified on `splunk-10-dev` against Classic SimpleXML, DS listing, DS editor, DS view (per 03-CONTEXT.md matrix).

**URL-shape (RT-3):** UAT-2 captured **`/en-US/splunkd/__raw/services/maps_plus/tile/proxy?...`** (path-absolute in the DevTools request line) with optional `&s=a&r=2` [VERIFIED: `02-UAT.md`]. `buildTileProxyUrl` concatenates `restRoot + '/maps_plus/tile/proxy?' + …` [VERIFIED: `ds-tile-proxy-helpers.js:60-76`]; `_resolveSplunkRestRoot()` yields **`origin + '/en-US/splunkd/__raw/services'`** when script-tag origin detection succeeds, producing a **fully absolute** `https?://host/en-US/splunkd/__raw/services/maps_plus/tile/proxy?...` URL for `<img src>` [VERIFIED: `maps-plus.js:112-118`, `135-166`]. The **starting pinned regex** in 03-CONTEXT uses `[\w\-\/]+/services` before `/maps_plus/…`; that **can** match the real path, but a **stricter anchor** mirroring the code (`/en-US/splunkd/__raw/services/maps_plus/tile/proxy`) reduces accidental acceptance of unexpected REST prefixes — planner should pick after confirming other Splunk deployments (SSO / mount paths) still resolve to the same `_resolveSplunkRestRoot()` output.

**Jest:** `jest.config.js` sets **`testEnvironment: 'node'`** (not jsdom) [VERIFIED: `jest.config.js`]. **`MessageEvent` / full DOM `document.createElement('img')`** are not native in pure Node — Phase 3 RPC tests should **construct `MessageEvent` manually** and `dispatchEvent` on `EventTarget` polyfills or switch **`testEnvironment: 'jsdom'`** for that file only (03-CONTEXT defers this to planner).

**Primary recommendation:** Implement the locked postMessage + `Blob` + exact-origin + regex drift-guard design; gate Plan 03-01 on **live Splunk page matrix** for shim injection; tighten `PROXY_URL_SHAPE` against real `getTileUrl` output + UAT-2 string before freezing.

## Project Constraints (from `.cursor/rules/`)

- Read `CLAUDE.md` before build/deploy/release tasks [CITED: `.cursor/rules/project.mdc`].
- `npm install --ignore-scripts` mandatory under `appserver/static/visualizations/maps-plus/` [VERIFIED: `CLAUDE.md`].
- Rebuild and commit `visualization.js` / `visualization.css` after `src/maps-plus.js` or `src/ds-tile-proxy-helpers.js` changes [VERIFIED: `CLAUDE.md`].
- App ID `leaflet_maps_app` [VERIFIED: `CLAUDE.md`].
- GSD planning artifacts live under `.planning/` [VERIFIED: `project.mdc`].

## Standard Stack

### Core

| Piece | Version / source | Purpose | Why standard |
|-------|-------------------|---------|--------------|
| Leaflet | `^1.9.4` (`package.json`) | `TileLayer` / `GridLayer` tile lifecycle | Already bundled; Phase 3 extends subclass only [VERIFIED: `package.json`] |
| Browser `postMessage` | Baseline APIs | Parent ↔ iframe RPC | No dependency; meets “no new runtime deps in Webpack bundle” [VERIFIED: 03-CONTEXT] |
| `fetch` + `credentials: 'same-origin'` | Baseline | Parent authenticated tile fetch | Same-origin session cookie attachment [CITED: MDN Fetch credentials] |
| Jest + babel-jest | `^29.7.0` | Unit / protocol tests | Phase 02 harness [VERIFIED: `package.json`, `jest.config.js`] |

### Supporting

| Piece | Purpose | When |
|-------|---------|------|
| Optional `jest-environment-jsdom` (not currently installed) | Real `MessageEvent` / DOM `Image` if desired | Only if planner picks jsdom per D-01 discretion [ASSUMED: add devDependency + `--ignore-scripts` install policy] |
| Manual `MessageEvent` construction in Node | Fake `origin` / `source` for RPC tests | Default given `testEnvironment: 'node'` [VERIFIED: `jest.config.js`] |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| `Blob` in postMessage | Base64 string | Higher CPU + ~33% bytes; rejected in Phase 3 discuss-phase [VERIFIED: `03-DISCUSSION-LOG.md`] |
| `WeakMap` for rate limit | `Map` + GC sweep | WeakMap not iterable — cannot implement D-05 stale sweep as written; `Map` matches CONTEXT [VERIFIED: `03-CONTEXT.md` D-05] |

**Version verification:** `jest@29.7.0`, `leaflet@^1.9.4` read from `package.json` on 2026-04-18 [VERIFIED: `package.json`].

## Architecture Patterns

### Pattern: Parent listener + iframe `createTile` bridge

**What:** Top window: `message` listener → validate `event.origin` / message type / URL regex → `fetch` → `blob()` → `event.source.postMessage(result, expectedIframeTargetOrigin)`. Iframe: override `createTile`, `postMessage` to `window.top`, await structured response, assign `blob:` URL to `img`, call `done` on load/error.

**When:** Only `_isDashboardStudio === true` (unchanged gate) [VERIFIED: Phase 02 code paths].

**Example (contract sketch):**

```js
// Source: Leaflet 1.9 TileLayer — createTile returns <img>, async done(null, tile)
// appserver/static/visualizations/maps-plus/node_modules/leaflet/src/layer/tile/TileLayer.js
createTile: function (coords, done) {
  var tile = document.createElement('img');
  // … postMessage parent, on reply:
  // tile.onload = function () { URL.revokeObjectURL(objectUrl); done(null, tile); };
  // tile.onerror = function () { URL.revokeObjectURL(objectUrl); done(err, tile); };
  return tile;
}
```

### Pattern: Drift-guarded regex literal

**What:** Identical `PROXY_URL_SHAPE` source between `ds-tile-proxy-helpers.js` and `parent-auth-bridge.js`, compared by Jest reading both files [VERIFIED: `03-CONTEXT.md` D-04].

### Anti-patterns to avoid

- **Substring origin checks:** Violates D-NN-4 / DS-AUTH-03 [VERIFIED: `.continue-here.md`].
- **Generic RPC router:** Violates D-NN-2 / `.continue-here.md` blocking row 2 [VERIFIED].
- **Shipping `web.conf`:** Violates REQ-DS-07; admin-only escalation [VERIFIED: `PROJECT.md`, `03-CONTEXT.md` D-01].

## Don't Hand-Roll

| Problem | Don’t build | Use instead | Why |
|---------|-------------|-------------|-----|
| Cookie attachment from `null` origin | Custom headers / SW / CORS “fixes” | Parent same-origin `fetch` | Browser model; MDN + UAT-2 [CITED: MDN SameSite + Origin; VERIFIED: `02-UAT.md`] |
| SSRF enforcement in bridge | Second host allow-list in JS | Phase 1 Python allow-list | D-NN-5; authoritative `01-SECURITY.md` [VERIFIED: file header + threat register present] |
| Async tile without `done` | Fire-and-forget `postMessage` | Leaflet `done(error, tile)` contract | `GridLayer` async branch [VERIFIED: `GridLayer.js:814-818`] |

**Key insight:** The bridge is a **thin auth pipe**; threat model stays in Phase 1 server + exact message/type/origin/URL-shape gates.

## Common Pitfalls

### Pitfall: Assuming `app.conf` `[ui]` alone injects JS

**What goes wrong:** Shim never loads on DS view → all tiles blank after D-02 latch.  
**Why:** Official `[ui]` spec excerpt lists no script include knob [CITED: https://docs.splunk.com/Documentation/Splunk/latest/Admin/Appconf].  
**How to avoid:** Run the CONTEXT matrix on a live instance; document fallback A/B.  
**Warning signs:** No network request for `parent-auth-bridge.js` on DS view.

### Pitfall: Forgetting `URL.revokeObjectURL`

**What goes wrong:** Memory growth on pan/zoom.  
**Why:** Each tile creates a new object URL.  
**How to avoid:** Revoke in **both** `onload` and `onerror` per D-03 [VERIFIED: `03-CONTEXT.md`].  
**Warning signs:** Rising heap in DevTools memory profiler.

### Pitfall: `done()` never called on timeout / rate-limit drop

**What goes wrong:** Leaflet tile stuck “loading”, grid pruning breaks.  
**Why:** Async `createTile` requires `done` [VERIFIED: `GridLayer.js:814-818`].  
**How to avoid:** Always resolve pending tile with `done(err, tile)` using blank tile element on timeout, bridge-absent, inflight cap, or silent parent drop (matches timeout UX).

### Pitfall: Using `event.origin` as rate-limit key

**What goes wrong:** All `null`-origin iframes share one bucket.  
**Why:** D-05 requires `event.source` [VERIFIED: `03-CONTEXT.md`].  
**How to avoid:** `Map` keyed by `event.source` reference equality per browser [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent/source].

## Code Examples

### MDN: `postMessage` uses structured clone

```js
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
// "The data is serialized using the structured clone algorithm"
targetWindow.postMessage(message, targetOrigin);
```

### Leaflet 1.9: default `createTile` pattern

```js
// Source: appserver/static/visualizations/maps-plus/node_modules/leaflet/src/layer/tile/TileLayer.js
createTile: function (coords, done) {
  var tile = document.createElement('img');
  DomEvent.on(tile, 'load', Util.bind(this._tileOnLoad, this, done, tile));
  DomEvent.on(tile, 'error', Util.bind(this._tileOnError, this, done, tile));
  tile.src = this.getTileUrl(coords);
  return tile;
}
```

### Jest: synthetic `MessageEvent` in Node

```js
// Pattern: manual event + dispatchEvent on window-like EventTarget
// [ASSUMED: common Jest pattern — verify with project's chosen env]
const evt = new MessageEvent('message', {
  data: { type: 'maps-plus:tile-result', requestId: 1, ok: true, tileData: new Blob(), contentType: 'image/png' },
  origin: 'http://localhost:8000',
  source: childWindow
});
parentWindow.dispatchEvent(evt);
```

## Security Domain

Target **OWASP ASVS L1** mindset; STRIDE mapping per orchestrator note:

| STRIDE | In-scope surface | Standard control |
|--------|------------------|------------------|
| Spoofing | Fake parent / iframe messages | `event.origin ===` expected; message type allow-list (D-NN-2, D-NN-4) [VERIFIED: CONTEXT] |
| Tampering | Malformed URLs steered to wrong endpoint | Single anchored regex (D-04); server still SSRF-enforces [VERIFIED: D-NN-5; `01-SECURITY.md`] |
| Repudiation | Abuse attempts | Parent one-warn-per-rate-window; iframe first-timeout log (D-05/D-06) [VERIFIED: CONTEXT] |
| Information disclosure | Payloads carry secrets | Forbidden by D-NN-3 / DS-AUTH-05 [VERIFIED] |
| DoS | Flood parent `fetch` | Rate limit (D-05) + in-flight cap (D-06) [VERIFIED] |
| Elevation | Arbitrary URL fetch | Regex shape gate + Phase 1 server validation [VERIFIED] |

**Applicable ASVS (indicative):** V1 architecture transparency, V4 access control (narrow bridge), V5 input validation (regex + schemas), V7 error handling (graceful blank tiles).

## Critical research targets (RT-1 — RT-8)

### RT-1 — MDN / spec: `SameSite=Lax` + opaque `null` origin subresources (D-NN-1) **[BLOCKING]**

**Chain (all primary MDN):**

1. **`SameSite=Lax` does not send cookies on cross-site subresource requests** (including `<img>`):  
   > “Send the cookie only for requests originating from the same site … and for cross-site requests that meet both of the following criteria: The request is a top-level navigation … This would exclude, for example, requests made using the fetch() API, or requests for subresources from `<img>` … elements …”  
   [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value] — page **Baseline** note (widely available); **retrieved 2026-04-18** (MDN GitHub commit hash not captured in this session).

2. **Opaque / serialized-`null` origins never match other origins** (“never considered equal to any other origin”):  
   [CITED: https://developer.mozilla.org/en-US/docs/Glossary/Origin#opaque_origin] — **retrieved 2026-04-18**.

3. **“Cross-site” cookies framing (embedded third-party content)** — contextual definition of cross-site requests for cookie purposes:  
   [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#controlling_third-party_cookies_with_samesite] — **retrieved 2026-04-18**.

4. **Empirical corroboration (project UAT):** `Origin: null`, `Sec-Fetch-Site: cross-site`, **no `Cookie:`** on `tile/proxy` from DS iframe.  
   [VERIFIED: `.planning/phases/02-maps-plus-js-integration-testing/02-UAT.md` §UAT-2 request capture]

**Conclusion:** Splunkweb session cookies with `SameSite=Lax` are not sent on DS `<img>` tile loads from an opaque `null` origin document; parent-frame same-origin `fetch` is the compliant mitigation — aligns with D-NN-1 / `.continue-here.md` anti-pattern #1.

### RT-2 — Parent-shim load-point matrix (D-01)

| Candidate | Classic SimpleXML | DS listing | DS editor | DS view | Official doc | Confidence |
|-----------|-------------------|------------|-----------|---------|--------------|------------|
| **`app.conf` `[ui]` + “static JS”`** (CONTEXT wording) | **Unknown** — not verified in-session | **Unknown** | **Unknown** | **Unknown** | Splunk `app.conf` `[ui]` keys visible in spec: visibility/label/setup_view/themes — **no script include documented in fetched `[ui]` stanza** [CITED: https://docs.splunk.com/Documentation/Splunk/latest/Admin/Appconf] | **LOW–MEDIUM** until `splunk-10-dev` |
| **Nav XML (`default/data/ui/nav/default.xml`)** | **Unknown** | **Unknown** | **Unknown** | **Unknown** | Current repo `default.xml` lists `<view>` entries only — **no `<script>` / JS include** [VERIFIED: `default/data/ui/nav/default.xml`]; Splunk nav docs needed for whether JS can be embedded at all | **LOW** |
| **Per-dashboard HTML / DS panel drop-in** | N/A | Possible manual path | Possible | **Likely works** when author adds `<script src="/static/app/leaflet_maps_app/...">` | Community pattern for dashboard `script=` on Simple XML [LOW: Splunk Community posts only — not re-verified here] | **MEDIUM** as opt-in |
| **`local/web.conf` (admin)** | **N/A (not shippable)** | — | — | Historically used for global `custom_javascript_url`-class hooks | **Ruled out for app ship** by REQ-DS-07 [VERIFIED: `PROJECT.md`] | **Escalation only** |

**Gotchas:** Splunk Web caching (`build` in `app.conf` / `bump` endpoint) may hide updated static files until bump or hard reload [ASSUMED: standard Splunk operator behavior].

**OSS reference scan:** Not executed in this session beyond repo `default.xml` [GAP].

**Planner action:** Wave 0 task — instrument shim with first-line `console.info('[maps-plus:parent-bridge] loaded')` and hit matrix URLs on Splunk 10.x + 9.x floor.

### RT-3 — URL-shape regex vs UAT-2 + code (D-04)

| Source | Evidence |
|--------|----------|
| `02-UAT.md` | `GET /en-US/splunkd/__raw/services/maps_plus/tile/proxy?url=...&z=6&x=14&y=24&s=a&r=2` [VERIFIED] |
| `buildTileProxyUrl` | `base + '/maps_plus/tile/proxy?' + ordered query string` [VERIFIED: `ds-tile-proxy-helpers.js:60-76`] |
| `_resolveSplunkRestRoot` | `origin + '/en-US/splunkd/__raw/services'` or `/services` fallback [VERIFIED: `maps-plus.js:112-118`] |
| `default/restmap.conf` | Route match `/maps_plus/tile/proxy`; `requireAuthentication = true` [VERIFIED: `default/restmap.conf`] |

**Does starting regex match?** For **absolute** URLs produced when `_detectSplunkOrigin()` succeeds, the CONTEXT starter regex **should match** the `/en-US/splunkd/__raw/services/maps_plus/tile/proxy?...` shape (the `[\w\-\/]+/services` segment can cover `en-US/splunkd/__raw`). **Planner:** re-run against exact copied string from Network panel (encodeURIComponent may lengthen `url=`).

**Absolute vs relative:** DS runtime with successful script-tag detection → **absolute** `https?://host/...` [VERIFIED: code + UAT narrative]. Fallback `restRoot === '/services'` → **path-only** `/services/maps_plus/tile/proxy?...` — **does not** match `^https?://` prefix; regex intentionally fail-closed or planner adds second allowed pattern (only if product must support undetected origin — contradicts current design).

**Suggested stricter anchor (optional):**  
`^https?:\/\/[^/]+\/en-US\/splunkd\/__raw\/services\/maps_plus\/tile\/proxy\?url=[^&]+&z=\d+&x=\d+&y=\d+(&s=[a-z])?(&r=[12])?$`  
[ASSUMED: acceptable if all target Splunk installs keep `/en-US/splunkd/__raw/services` shape from `_resolveSplunkRestRoot()` — confirm SSO / locale prefix variants in UAT.]

### RT-4 — `Blob` + structured clone + object URLs (D-03)

- **`Window.postMessage`:** “The data is serialized using the **structured clone algorithm**.” [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage]  
- **`Blob`:** file-like immutable bytes; examples show `URL.createObjectURL` from `Blob` and use as `<img src>` [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Blob] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static]  
- **Cross-`null` boundary:** Clone produces a **fresh object** in the recipient realm; no shared reference semantics — treat like network deserialization (still standard) [ASSUMED: ECMAScript structured clone semantics].  
- **Gotcha:** Extremely large tiles → structured-clone memory spike; Phase 1 already caps response size [VERIFIED: `01-SECURITY.md` T1-03 reference in excerpt].

### RT-5 — Leaflet `createTile(coords, done)` (verified source)

| Question | Answer |
|----------|--------|
| Signature | `createTile(coords, done)` — `coords` wrapped; `done` optional [VERIFIED: `TileLayer.js:147`, `GridLayer.js:810`] |
| Return | `HTMLElement` (`<img>` for `TileLayer`) [VERIFIED: `TileLayer.js:148-171`] |
| When `done`? | On tile **load** or **error** (`_tileOnLoad` / `_tileOnError`) [VERIFIED: `TileLayer.js:199-208`] |
| Async w/ promise? | Leaflet uses **callback**, not Promises; keep callback style [VERIFIED: `GridLayer.js:814-818`] |
| DOM tracking | Tile element stored in `this._tiles[key].el` until prune — align revoke timing with load/error, not with grid prune race [PARTIAL: `GridLayer.js` prune paths not fully traced in this session] |

### RT-6 — Jest + `postMessage` RPC tests (D-02, D-03, D-04)

| Topic | Finding |
|-------|---------|
| Current env | `testEnvironment: 'node'` [VERIFIED: `jest.config.js`] |
| `MessageEvent` / `URL` in Node | Need manual construction or `happy-dom`/`jsdom` [ASSUMED: Node 20 lacks DOM `Image` unless global polyfill] |
| Fake `origin` / `source` | Pass into `new MessageEvent('message', { origin, source, data })` then `dispatchEvent` on a `EventTarget` shim [ASSUMED] |
| Pitfalls | jsdom Blob cloning fidelity vs real browsers — keep one smoke UAT path [ASSUMED]; structured clone of nested objects with `Blob` field should mirror browsers in modern jsdom [LOW confidence without running jsdom here] |

### RT-7 — Splunk static JS execution semantics

| Question | Answer | Confidence |
|----------|--------|------------|
| Lifecycle timing when loaded via `<script src="/static/...">` | Executes synchronously where inserted; DOM below parser-blocking script not ready unless `defer`/`async` | **MEDIUM** [ASSUMED: HTML script processing model — cite WHATWG HTML script element if planner needs formal proof] |
| `window.top` in DS | For `about:srcdoc` viz iframe, `window.top` should be Splunk top browsing context per CONTEXT architecture notes | **MEDIUM** [VERIFIED: reasoning in `03-CONTEXT.md` `<code_context>`; not re-tested in browser this session] |
| Idempotent shim | Guard with `window.__MAPS_PLUS_PARENT_BRIDGE__` one-shot init | **RECOMMENDED** [ASSUMED pattern] |

### RT-8 — `event.source` identity + `Map` (D-05)

- MDN: `MessageEvent.source` is a `MessageEventSource` (includes **`WindowProxy`**) representing the emitter [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent/source].  
- **Navigation:** MDN `postMessage` notes recipient origin may change after navigation; `about:srcdoc` documents normally **do not** navigate — if they did, `source` may refer to new document [ASSUMED: HTML browsing context model].  
- **`Map` keyed by object identity:** Holds strong references — mitigated by D-05’s 60s GC sweep [VERIFIED: `03-CONTEXT.md`]. WeakMap unsuitable for enumeration [VERIFIED: CONTEXT rationale].

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node + npm | Jest | **Assumed yes** (dev machine) | Not probed in this session | — |
| `splunk-10-dev` Docker | RT-2 / UAT replay | **Unknown** in-session | — | Document manual matrix if container down |
| Internet (MDN / Splunk docs) | Citations | Yes (fetch succeeded) | — | — |

**Step 2.6 note:** No shell probes run for Node/Splunk versions [GAP — orchestrator may run if needed].

## Open Questions

1. **Exact Splunk-supported hook** for global-ish JS in the Maps+ app without `web.conf` — `[ui]` spec excerpt lacks explicit JS include; is the intended mechanism **`appserver/templates`** override, **`application.js` auto-load**, or another?  
   - *Known:* `[ui]` keys from Splunk docs [CITED: Appconf].  
   - *Unknown:* DS view page includes which app static files.  
   - *Recommendation:* Empirical matrix task in Plan 03-01.

2. **Locale / gateway prefixes** other than `/en-US/splunkd/__raw/services` — does `_detectSplunkOrigin()` + fixed string remain valid on customer SSO deployments?  
   - *Recommendation:* UAT + one customer doc review [ASSUMED risk].

3. **Does REQUIREMENTS.md DS-AUTH-05 text (`blobBase64`) get amended** to match D-03 `tileData` / `Blob`? Planner doc hygiene [VERIFIED: mismatch exists in `REQUIREMENTS.md:49`].

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | `app.conf` `[ui]` can mean a Splunk mechanism not shown in the fetched 10.2 spec excerpt | RT-2 | Shim never loads — must pivot to fallback B |
| A2 | `Map` keyed by `event.source` is stable for DS `about:srcdoc` lifetime | RT-8 | Rate limit mis-buckets — unlikely per MDN WindowProxy model |
| A3 | Stricter `/en-US/splunkd/__raw/services` regex is compatible with all supported Splunk deployments | RT-3 | Tiles rejected by parent — widen after measurement |

**If this table is empty:** N/A — assumptions listed above.

## Sources

### Primary (HIGH confidence — web + repo)

- [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value] — `SameSite=Lax` subresource exclusion  
- [CITED: https://developer.mozilla.org/en-US/docs/Glossary/Origin#opaque_origin] — opaque / `null` origin isolation  
- [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#controlling_third-party_cookies_with_samesite] — cross-site cookie framing  
- [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage] — structured clone + security notes  
- [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent/source] — `WindowProxy` emitter identity  
- [CITED: https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static] — object URL lifecycle  
- [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Blob] — blob usage with object URLs  
- [CITED: https://docs.splunk.com/Documentation/Splunk/latest/Admin/Appconf] — `app.conf` / `[ui]` reference (metadata **last updated 2026-02-04** on fetched page)  
- [VERIFIED: repo] `maps-plus.js`, `ds-tile-proxy-helpers.js`, `jest.config.js`, `package.json`, `default/restmap.conf`, `02-UAT.md`, `03-CONTEXT.md`, `.continue-here.md`, `node_modules/leaflet/.../TileLayer.js`, `GridLayer.js`

### Secondary (MEDIUM)

- Splunk Community threads on custom JS (not individually verified) — **not cited as authoritative**.

### Tertiary (LOW / gaps)

- OSS Splunk apps’ DS injection patterns — **not surveyed** this session.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — Leaflet + MDN primitives + existing Jest layout verified in-repo.  
- Architecture: **HIGH** for browser side; **MEDIUM** for Splunk load wiring.  
- Pitfalls: **HIGH** for cookie / Leaflet `done` / revokeObjectURL; **MEDIUM** for Splunk caching.

**Research date:** 2026-04-18  
**Valid until:** ~2026-05-18 (browser docs stable; Splunk DS behavior may change faster — re-check on Splunk minor upgrades).

**Commit:** Not requested auto-commit; **orchestrator should review Splunk load-point LOW–MEDIUM evidence** before `gsd-tools.cjs commit`.
