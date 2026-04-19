# Phase 3 — Research Addendum

> Records the Path B research wave outputs. Companion to (does NOT replace) `03-RESEARCH.md`, which remains the historical record of the tile-only domain research. This file collects R1–R4 findings and the empirical inputs that should drive the re-lock of `03-CONTEXT.md` § Locked Decisions.
>
> **Status:** R3 complete (spec read — empirical test not needed). R2 / R1 / R4 pending.

## R3 — Iframe → `window.top` bridge install

### Hypothesis (from `.continue-here.md`)

The DS `about:srcdoc` iframe was created by the same-origin Splunk Web parent. Even though the iframe's own document has an opaque `null` origin, the *iframe element* lives in the parent's DOM and the iframe's `window.top` is a real same-origin reference to the Splunk Web window. The iframe can therefore execute code in the parent context by reaching through `window.top` (e.g., `window.top.eval('...')`, or `window.top.document.createElement('script')` then `appendChild`).

If true: bridge install becomes a runtime operation the iframe performs on first need; no Splunk auto-load mechanism required; load-point question becomes irrelevant for both SimpleXML and DS v2.

### Verdict: **NOT FEASIBLE.** R3 collapses cleanly per spec.

The iframe **can** obtain a `WindowProxy` reference to the parent (`window.top`, `window.parent`). It **cannot** access `window.top.document`, `window.top.eval`, or any other property of the parent that is not on the cross-origin safe-list. Same-origin policy applies bi-directionally between opaque-origin contexts and tuple-origin contexts. The only legitimate cross-origin channel is `window.top.postMessage(...)`, which requires a pre-installed listener on the parent — exactly the circular load-point problem R3 was meant to bypass.

### Primary citations

#### HTML §7.1.1 — Same origin algorithm

> Two origins, A and B, are said to be **same origin** if the following algorithm returns true:
>
> 1. If A and B are the same opaque origin, then return true.
> 2. If A and B are both tuple origins and their schemes, hosts, and port are identical, then return true.
> 3. Return false.

— [HTML Standard §7.1.1](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin)

The Splunk Web parent has tuple origin `("http", "localhost", 8000, null)`. The DS srcdoc iframe has a fresh, unique opaque origin (per the `sandbox` attribute behavior — see HTML §4.8.5 `sandbox` keyword: "the content is treated as being from a unique opaque origin"). Per the algorithm above, opaque ≠ tuple → **not same origin** → same-origin policy applies in both directions.

#### HTML §7.2.1.3.1 — CrossOriginProperties (cross-origin Window safe-list)

> A JavaScript property name P is a **cross-origin accessible window property name** if it is `"window"`, `"self"`, `"location"`, `"close"`, `"closed"`, `"focus"`, `"blur"`, `"frames"`, `"length"`, `"top"`, `"opener"`, `"parent"`, `"postMessage"`, or an array index property name.

— [HTML Standard §7.2.1.3.1](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-top)

`document` is **NOT** on this list. Neither is `eval`, `Function`, `setTimeout`, `addEventListener`, `globalThis`, or any DOM mutation API. Only the listed properties survive cross-origin access; everything else throws.

#### HTML §7.2.1.1 — Integration with IDL (the throw)

> If `IsPlatformObjectSameOrigin(platformObject)` is false, then throw a "SecurityError" `DOMException`.

— [HTML Standard §7.2.1.1](https://html.spec.whatwg.org/multipage/nav-history-apis.html#integration-with-idl)

Reading any non-safe-listed property of a cross-origin `Window` triggers `IsPlatformObjectSameOrigin(O)` (§7.2.1.3.3), which compares the current settings object's origin (the iframe's opaque origin) with the target's origin (the parent's tuple origin). Per §7.1.1 these are not same origin → false → SecurityError DOMException.

This means:
- `window.top.document` → SecurityError
- `window.top.eval('...')` → SecurityError (`eval` not safe-listed)
- `window.top.document.createElement('script')` → SecurityError (chained access — the first read fails)
- `window.top.somePreInstalledFunction()` → SecurityError (no read access except to the safe-list)

#### MDN — Same-origin policy

> JavaScript APIs like `iframe.contentWindow`, `window.parent`, `window.open`, and `window.opener` allow documents to directly reference each other. When two documents do not have the same origin, these references provide **very limited access** to `Window` and `Location` objects [...]
>
> **To communicate between documents from different origins, use `window.postMessage`.**

— [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)

#### MDN — Window.postMessage()

> Because `data:` URLs **have opaque origins**, in order to send messages to a context with a `data:` URL, you must specify `"*"`.

— [MDN: Window.postMessage()](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

Same applies to `about:srcdoc` documents under sandbox without `allow-same-origin` — they get a unique opaque origin (HTML §4.8.5). The iframe-→-parent direction works (`window.top.postMessage(msg, '*')`), but the parent-→-iframe direction also requires `'*'` because there is no specific origin to match. **Both directions require a pre-installed `message` event listener at the receiving end.** This is the load-point dependency R3 was meant to eliminate.

### Confirming via current browser-quirk literature

A Stack Overflow discussion ([Q78501355, accessed 2026-04-18](https://stackoverflow.com/questions/78501355)) summarizing current Chrome/Firefox/Safari behavior:

> "Without [`allow-same-origin`], the frame has an opaque origin and cannot access `window.top.document`."
> "Blocked a frame with origin 'null' from accessing a cross-origin frame."

This is consistent with the spec. There is no browser-specific quirk that creates a usable opening — the behavior is uniform across modern Chrome, Firefox, and Safari.

### Sanity check against Phase 02 empirical observation

Phase 02 UAT-2 (`02-UAT.md` lines 145–166) directly observed:

> Origin: null
> Sec-Fetch-Site: cross-site
> [...]
> Splunk's session cookie is `SameSite=Lax` [...] which means it is **not sent cross-site from a null origin**, so the tile request reaches Splunkweb cookieless and is redirected to login.

The opaque `null` origin is what triggers cookie withholding. The same opaque `null` origin is what blocks `window.top.document` access. Both are downstream consequences of the same browser security boundary. There is no spec-permitted path to circumvent this from the iframe side.

### Implication for Splunk DS sandbox configuration (verification deferred to R2)

`02-UAT.md` does not capture the literal `sandbox=` attribute value on the DS iframe. Three possible configurations:

1. `sandbox` (no value) → unique opaque origin, no scripts → wouldn't work at all (Maps+ JS clearly does run, so this is ruled out)
2. `sandbox="allow-scripts"` (no `allow-same-origin`) → unique opaque origin, scripts allowed → matches observed behavior (origin `null` + Maps+ runs)
3. `sandbox="allow-scripts allow-same-origin"` → inherits parent's tuple origin → contradicts observed `Origin: null` header

By the empirical evidence, the DS configuration is (2). This is consistent with R3 collapse. **No further verification needed for R3 purposes** — but R2 should grep the live DS dashboard HTML to confirm the literal `sandbox=` value, since this becomes input to several downstream design decisions (e.g., whether the bridge can rely on `window.parent === window.top` always being true, whether nested DS dashboards exist, etc.).

### Empirical test SKIPPED

`.continue-here.md` Step 2 said: "If the spec says no: R3 collapses. Move to R2." The spec is unambiguous (no), the current browser literature is consistent (no), and the existing Phase 02 empirical evidence is consistent (the same opaque-origin boundary that blocks cookies blocks `top.document` access). Running the probe browser test would not change the outcome.

The probe stub at `appserver/static/parent-auth-bridge.js` and the loader at `appserver/static/dashboard.js` and the SimpleXML probe at `default/data/ui/views/phase03_probe.xml` should remain in place as scaffolding for R1 (namespace re-test of M1) — they are NOT exercised by R3 and do not need to be deleted yet. They become eligible for cleanup after the re-lock of `03-CONTEXT.md` decides which load mechanism survives.

### What this means for the bridge design

Reaffirms the original D-NN-1 conclusion (the cookie boundary is real, not a client bug). The bridge must:

1. Run a `message` event listener on the **top frame** (Splunk Web parent context, which has cookies and tuple origin).
2. The listener receives `postMessage` requests from the iframe, makes the authenticated fetch (cookies attached, same-origin to Splunkweb), and posts the result back via `event.source.postMessage(result, '*')`.
3. The top-frame listener must be installed **before** the iframe initiates its first request — i.e., before any tile or static asset is needed.

The "before" timing constraint is the load-point question that R3 cannot dissolve. R2 (Splunk DS extension surface) is the next research target. Q3 from `03-CODE-SCAN.md` ("Does Splunk 10.x DS v2 expose a top-frame hook that runs before the iframe mounts?") is now the highest-leverage open question.

### Carry-forward to R2

R2's enumeration scope expands slightly. Look for any of:

- `appserver/templates/*` overrides Splunk Web injects into the dashboard HTML (top-frame, before iframe creation)
- DS module pre-render lifecycle hooks
- `viz.json` extension keys that point to top-frame JS
- `setup.xml` boot files that execute in the top frame
- Any documented Splunk Web hook that runs BEFORE custom-viz iframes are constructed
- Splunkbase patterns from apps that target DS and have solved a similar load-point problem

Also: confirm the literal `sandbox=` attribute value on the DS iframe (cheap — `view-source:` on a DS dashboard, search for `sandbox=`).

### Q1 status (CSS still needs bridge regardless of install path)

R3's collapse does not change Q1 from `03-CODE-SCAN.md`. Even when the bridge IS eventually installed (via R2 / R1 / R4), CSS-engine-driven `url(...)` references in `contrib/css/*.css` remain a problem because the CSS engine emits those requests with the iframe's opaque-origin context. The bridge must still handle CSS-text rewriting. Q1 carries forward to Step 5 (re-lock D-03 with explicit CSS-content-type dispatch).

---

## R2 — Splunk 10.x DS v2 extension surface

**Status:** Pending. Required because R3 collapsed.

To be filled in next session.

---

## R1 — DS namespace re-test (M1.P4 inside `leaflet_maps_app`)

**Status:** Pending. Conditional on R2 outcome.

To be filled in next session.

---

## R4 — Nav XML include path

**Status:** Pending. Conditional on R1 outcome.

To be filled in next session.
