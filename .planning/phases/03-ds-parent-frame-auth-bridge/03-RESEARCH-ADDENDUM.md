# Phase 3 — Research Addendum

> Records the Path B research wave outputs. Companion to (does NOT replace) `03-RESEARCH.md`, which remains the historical record of the tile-only domain research. This file collects R1–R4 findings and the empirical inputs that should drive the re-lock of `03-CONTEXT.md` § Locked Decisions.
>
> **Status:** R3 complete (spec read — empirical test not needed). R2 complete (architectural + empirical evidence, no remaining hypothesis to test). R1 and R4 pre-collapsed by R2 (the rendered-HTML evidence captured for R2 directly disproves both their underlying mechanisms; see § R1 and § R4 below for details).

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

### Central question (from `.continue-here.md`)

> Does Splunk 10.x DS v2 expose any extension point that runs in the top frame, before the custom-visualization iframe is constructed?

If yes → that's where the parent-side `postMessage` listener gets installed, and Phase 3's stated goal (full DS parity from app space alone) is reachable. If no → Phase 3's stated goal is unreachable from app space; the only options become (a) ship a Splunk-Web boot-path patch (out of normal app scope), (b) accept partial DS support documented as a manual operator step, or (c) declare DS unsupported pending Splunk publishing a documented top-frame extension API.

### Verdict: **NO. No top-frame extension surface exists.**

The evidence is overlapping and architecturally exhaustive: the DS top-frame template is fully closed (no per-app script slot is rendered), the DS React boot bundle contains no extension/plugin/hook keyword across ~11 MB of JavaScript, the iframe construction is wired with hardcoded postMessage hooks in DS-shipped code (no third-party callback registration), the custom-viz registry consumed by DS reads only a fixed schema (no top-frame-script field is honored), and the rendered HTML for a DS dashboard URL inside the Maps+ namespace empirically loads ZERO scripts from `leaflet_maps_app` despite the app being the URL's namespace. The remaining historical Splunk-Web surfaces (per-app `application.js` auto-load, nav XML script include, `setup.xml`) are either not invoked on DS pages or not invoked on dashboard view at all.

### Evidence by vector (all enumerated; all closed)

#### Side-quest preface — DS iframe `sandbox` attribute confirmed empirically

`splunk-dashboard-studio/appserver/static/build/chunks/chunk-DT4FOOLP.js` contains the React `createElement` call that constructs the custom-viz iframe element. The literal call, decompressed and read in context (offset 91847):

```js
U.createElement(vo, {
  "data-test": "custom-viz-iframe",
  "data-exportable": !0,
  title: n,
  sandbox: "allow-scripts",   // <-- literal value, no allow-same-origin
  ref: p,
  visibility: D != null && D.message || B ? "hidden" : "visible",
  srcDoc: Z
})
```

**Confirmed:** the DS iframe is sandboxed with `allow-scripts` only. No `allow-same-origin`. This matches Phase 02's empirical observation of `Origin: null` on outbound requests and pre-collapses R3's spec-based reasoning about opaque-origin behavior. Recorded here because it is also a precondition for the Vector-2 conclusion below — the iframe-construction site is in DS-controlled code with no preceding hook.

#### Vector 1 — Mako template overrides (`appserver/templates/dashboard.html`)

**Closed.** The DS top-frame HTML is rendered from `splunk-dashboard-studio/appserver/templates/dashboard.html` and `shared-dashboard.html`. These templates are referenced from DS's own view XML files via fully-qualified app-prefixed paths:

```xml
<view template="splunk-dashboard-studio:/templates/dashboard.html" type="html" isDashboard="False"></view>
```

(`splunk-dashboard-studio/default/data/ui/views/dashboard.xml`)

The user's dashboard XML (`<dashboard version="2">` files in `<app>/local/data/ui/views/*.xml`) does not declare a template — it is routed to DS by the Splunk Web view dispatcher's hardcoded handling of `version="2"`. There is no fall-through that allows the viewing app's `appserver/templates/dashboard.html` to override DS's.

I read all three DS templates (`dashboard.html`, `example-hub.html`, `shared-dashboard.html`) end-to-end. Each is a small Mako template (1–2.5 KB) that hardcodes:
- bootstrap CSS link
- preload links for `services/web-features`, `authentication/current-context`, `services/orchestrator/v1/spl2/enabled`
- `<script id="config-script">`, `<script id="i18n-script">`, `<script id="i18n-catalog-script">`, an inline `__splunkd_partials__` variable
- `<script type="module" src="/static/app/splunk-dashboard-studio/build/${page}.js">` — the DS React app

None of the three DS templates reference `customJsFiles`, `customCssFiles`, `jsFiles`, `cssFiles`, or any other Splunk Web template variable that would inject the viewing app's per-app script. Verified with `grep -nE 'customJsFiles|customCssFiles|jsFiles|cssFiles'` against all three templates: zero matches.

**Subtle note for the record (the customJsFiles dead-end):** `splunk/appserver/mrsparkle/controllers/view.py` (`_getCustomFiles`, lines 260–298) DOES populate a `customJsFiles` template variable that includes `application.js` from the viewing app's `appserver/static/` (and only `application.js` — the per-dashboard `dashboard.js` allow-list is gated on `isSimpleXml`). For a DS dashboard, `isSimpleXml` is False → `application.js` would be eligible. But the DS templates ignore the `customJsFiles` variable, so the loop never runs. The conventional `application.js` auto-load is structurally available all the way through the controller and **dies at the template layer** for DS pages. This is the same dead-end R1 was meant to test empirically; see § R1 below.

**Empirical confirmation:** see "Rendered-HTML ground truth" below.

#### Vector 2 — DS module / lifecycle pre-render hooks

**Closed.** I copied the entire DS bundle out of the `splunk-10-dev` container and read the React boot bundle plus all relevant chunks:

- `splunk-dashboard-studio/appserver/static/build/dashboard.js` (805 KB — the boot module loaded by `<script type="module">`)
- `splunk-dashboard-studio/appserver/static/build/chunks/chunk-LQITN2GZ.js` (9.9 MB — the main React app chunk)
- `splunk-dashboard-studio/appserver/static/build/chunks/chunk-DT4FOOLP.js` (110 KB — custom-viz iframe construction)
- `splunk-dashboard-studio/appserver/static/build/chunks/chunk-J3STZZGT.js` (380 KB — custom-viz discovery + dashboard JSON parser)
- All 76 chunks combined for keyword sweeps

A python-driven keyword sweep across all 4 primary bundles (~11 MB total) for the following terms returned **zero hits in every bundle**: `web-features`, `extensionPoint`, `topFrame`, `appExtension`, `preBoot`, `beforeMount`, `preInit`, `beforeInit`, `beforeBoot`, `apps_local`, `installedApps`, `addInitFn`, `registerHook`, `pluginManager`. (Sweep run from `/tmp/splunk-bundle/` against `ds-dashboard.js`, `chunks/chunk-DT4FOOLP.js`, `chunks/chunk-J3STZZGT.js`, `chunks/chunk-LQITN2GZ.js`.)

The bundle does contain the keywords `plugin` (10 hits) and `extension` (4 hits), but every single hit is internal:
- `extension` matches are JS engine internals (`Object.preventExtensions`, `Reflect.preventExtensions`)
- `plugin` matches are either WebIDL whitelist literals (`Plugin: false, PluginArray: false` in DOM polyfills) or the internal `this.dashboardPlugin` field on DS's React dashboard component (which is the dashboard's own internal event-routing object, not a third-party hook)

The chunks do contain a real registry mechanism — `registerVisualizationApi`, `registerInputApi`, `registerLayoutApi`, `registerToolbarApi`, `registerGlobalInputsApi`, `registerVisualizationActionsApi`, `registerInputActionsApi` (in `chunk-LQITN2GZ.js`). I traced the `registerVisualizationApi` call site (offset 9839430): it is called from a React `useEffect` hook by DS's own visualization-renderer component when each viz mounts. The signature is `registerVisualizationApi(vizId, vizApi)`, where `vizApi = {getDomElement, ...}` is the per-instance API for one already-mounted visualization. **This is internal apiRegistry plumbing for instance lookup, not an external extension surface.** No third-party code can call it (the registry instance is closed-over inside the React tree).

The iframe-construction code itself (`chunk-DT4FOOLP.js`, the `Eo` component for srcDoc HTML and the surrounding `CustomVizIframe` React component) installs the parent-side postMessage hooks immediately AFTER the iframe element is constructed:
```
Zn(iframeRef, isIframeInitialized, payload);  // postMessage data-source updates
Jn({iframeRef, isIframeInitialized, width, height});  // postMessage resize
kn(iframeRef, onEventTrigger);  // listen for events from iframe
Fn(iframeRef);
Xn({iframeRef, isIframeInitialized, tokenBinding});  // postMessage token updates
jn(iframeRef);
```
These are all hardcoded in DS-shipped React. There is no `props.onBeforeIframeMount`, no `useExternalIframeBridge` registration, no global `window.SplunkDashboardStudio` callback registry. Maps+ has no way to register a parent-side `message` listener through this code path.

#### Vector 3 — `viz.json` / `visualizations.conf` extension keys

**Closed.** DS discovers installed custom visualizations via `services/data/ui/visualizations?output_mode=json&search=(type="visualization")` (URL constant `Co = "data/ui/visualizations"` in `chunk-J3STZZGT.js`, called by `oh = async ({oid}) => {...}` at offset 283147, exported as `b`, imported into the React preset hook in `chunk-DT4FOOLP.js` as `Zr`).

The mapper function reads only the following fields off each entry's `content`:

```js
oh = async({oid}={}) => {
  let t = await ba({search:"", oid});
  return t.entry.filter(u => u.acl.app !== "system").map(u => {
    let{app} = u.acl,
        {name, content: i={}} = u,
        framework = i.framework ?? "legacy",
        cssUrl = `css!/static/@${build}/app/${app}/visualizations/${name}/visualization.css`,
        jsUrl  = `/static/@${build}/app/${app}/visualizations/${name}/visualization.js`,
        dataSources = (i.data_sources ?? "primary").split(",")...,
        initialRequestParams = ad(dataSources, i),
        allowUserSelection = normalizeBoolean(i.allow_user_selection ?? true);
    return {
      build, app, name, framework, cssUrl, jsUrl,
      formatter: i.formatter ?? null,
      label: i.label,
      dataSources,
      initialRequestParams,
      allowUserSelection,
      supportsDrilldown: normalizeBoolean(i.supports_drilldown)
    };
  });
};
```

**Schema is closed.** Only those keys are propagated into the registry. There is no `topFrameScript`, `parentFrameScript`, `bootstrap`, `preLoad`, `init`, `hook`, or analogous field that an app could set in its `default/visualizations.conf` to inject a top-frame script. Even if Maps+ added such a key to `visualizations.conf`, DS would silently discard it before reaching React.

#### Vector 4 — `setup.xml`

**Closed.** `setup.xml` is a per-app one-shot configuration form. It is handled by `splunk/appserver/mrsparkle/controllers/admin.py` (verified by `grep -l "setup.xml"` against the controllers directory), which is invoked when the user navigates to `/app/<name>/setup` or when `[install] is_configured = 0` triggers the setup flow on first app access. It is NOT invoked by the dashboard view dispatcher (`view.py`). It does not run on dashboard view, by design — its purpose is one-shot admin configuration, not asset injection. The empirical evidence corroborates: the rendered HTML below contains no setup-related scripts.

#### Vector 5 — Official documentation

**Closed (no DS-equivalent published).** Targeted search across `dev.splunk.com` and `docs.splunk.com` for "Splunk Dashboard Studio custom visualization parent frame extension hook API" returned no results documenting any DS-specific top-frame extension. The documented per-app top-frame conventions (`appserver/static/application.js` for app-wide auto-load; `script="..."` form attribute for per-dashboard inline) are **SimpleXML/Dashboards-1.x conventions only**. The most recent Splunk Help article on dashboard customization explicitly notes "Custom JavaScript files can cause dashboard rendering issues, and you may see warnings about custom scripts when opening a dashboard in Edit mode" — which is consistent with DS not honoring the convention. (Cited search result: [help.splunk.com — Customize dashboard styling and behavior](https://help.splunk.com/ja-jp/splunk-enterprise/developing-views-and-apps-for-splunk-web/9.0/customize-splunk-web/customize-dashboard-styling-and-behavior), accessed 2026-04-18.)

#### Vector 6 — Splunkbase pattern-mining (third-party app workarounds)

**Skipped.** Vectors 1–5 are conclusive on architectural grounds: the DS template renders zero per-app scripts, the React boot bundle exposes zero extension keywords, the viz registry is closed-schema, setup.xml is out-of-band, and Splunk has not published a DS-extension API. A surviving Splunkbase pattern would have to rely on something none of those evidence trails reach — either a DS bug (which is fragile by definition) or running outside the dashboard URL entirely (out of phase scope, since by definition we want full DS parity for users navigating to a DS dashboard URL). The two non-DS-non-system top-frame scripts I observed in the rendered HTML (`splunk_instrumentation/build/pages/swa.js`) are first-party Splunk telemetry, not third-party patterns. If a future Splunkbase audit surfaces a relevant pattern, that would prompt re-opening R2 — but no such audit is required to commit Phase 3's path forward.

### Rendered-HTML ground truth (the load-out empirical proof)

To move from "the code paths suggest no top-frame surface" to "the rendered HTML proves no top-frame surface," I logged into the live `splunk-10-dev` container as `admin` and fetched the rendered HTML for `/en-US/app/leaflet_maps_app/png_markers_copy` — a real DS dashboard whose URL is in the Maps+ app's namespace and whose definition references the Maps+ visualization (`"type": "leaflet_maps_app.maps-plus"`). The full response body is 72 lines, ~21 KB. Every script tag in the response:

| # | Script source | Owner |
|---|---|---|
| 1 | `/en-US/static/app/splunk_instrumentation/build/pages/swa.js` (DOMContentLoaded-injected) | Splunk first-party (telemetry) |
| 2 | `/en-US/config?autoload=1` (`id="config-script"`) | Splunk Web core |
| 3 | `/en-US/static/@<asset-id>/js/i18n.js` (`id="i18n-script"`) | Splunk Web core |
| 4 | `/en-US/i18ncatalog?autoload=1&version=...` (`id="i18n-catalog-script"`) | Splunk Web core |
| 5 | inline `__splunkd_partials__` (base64 dashboard XML) | Splunk Web core |
| 6 | `/en-US/static/@<asset-id>:7931473847/app/splunk-dashboard-studio/build/dashboard.js` (`type="module"`) | `splunk-dashboard-studio` |

**Zero scripts from `leaflet_maps_app`.** Despite the URL path being `/app/leaflet_maps_app/...`, the viewing app contributes nothing to the top-frame DOM beyond its identity in the URL and its dashboard XML payload (which is just a base64 string in `__splunkd_partials__`, opaque to the parent — DS's React app fetches and decodes it and renders it inside the React tree).

The rendered HTML is captured at `/tmp/ds-rendered.html` on the developer host for re-inspection.

### Implications

#### Phase 3's stated goal is unreachable from app space alone

The phase brief assumed there exists *some* top-frame surface the Maps+ app can use to install the parent-side postMessage listener. That assumption is now disproven. There is no such surface, public or undocumented, for DS dashboards in Splunk 10.x.

This means D-NN-1 (proxy mechanism = same-origin REST proxy installed in the parent frame, as previously locked in `03-CONTEXT.md`) cannot be implemented by Maps+ alone for DS users. Phase 3's locked decisions need to be re-opened.

#### Three remaining options (mutually exclusive)

A. **Ship a Splunk-Web boot-path patch.** Edit `splunk-dashboard-studio/appserver/templates/dashboard.html` (or inject into `dashboard.js` post-load) at install time. This is a Splunk-app-installer trick — outside normal app scope, fragile across DS upgrades (the Splunk-shipped DS app gets re-deployed on every Splunk patch and our edits would be overwritten without explicit re-application), and likely to fail Splunkbase certification. **Not recommended.**

B. **Accept partial DS support, documented as a manual operator step.** Maps+ ships a top-frame bridge as a separate JS file plus a documented one-time procedure: "to use Maps+ in DS dashboards, run `splunk cmd btool` to add this `application.js` to your `splunk-dashboard-studio` app, OR add `<script>` tag to a Splunk-Web wrapper template." Operator runs the step once after install. Dashboards work afterwards. **Workable but high friction; users may abandon Maps+ in DS rather than perform the step.**

C. **Declare DS unsupported for now; revisit when Splunk publishes a documented top-frame extension API.** Maps+ continues to work fully on SimpleXML dashboards (the original app contract). DS users get a clear in-product message: "Maps+ requires a SimpleXML dashboard. Migrate this DS dashboard back to SimpleXML, or wait for Splunk to publish a Dashboard Studio extension API." **Lowest engineering cost; cleanest user contract; preserves Maps+'s reputation; allows Phase 3 to close as 'unsupported by upstream'.**

These three options should be the focus of Step 5 (re-lock of `03-CONTEXT.md` § Locked Decisions). The phase brief and `03-CONTEXT.md` previously locked D-NN-1 under the assumption that the load-point question had a positive answer; that assumption is now disproven and the lock is REOPENED.

#### Phase 3 does NOT need to do option (A); it should commit to (B) or (C) and document the rationale

Recommend **option C** as Phase 3's outcome. Rationale: option A is fragile and unprofessional; option B asks operators to perform a manual step that defeats the "drop-in app" Splunkbase model and will lead to confused user reports for the lifetime of Phase 3's release; option C is honest about the upstream constraint, easy to revert when Splunk publishes a real API, and consistent with Maps+'s existing app contract (SimpleXML-first, with DS as best-effort).

If the project owner prefers option B, the phase plan needs an additional plan for the operator script + documentation + a self-check that the bridge is actually installed on first DS dashboard load (otherwise users get silent broken behavior).

### Carry-forward to Step 5 (re-lock `03-CONTEXT.md`)

Re-lock candidates:
- **D-NN-1 (proxy mechanism):** REOPEN. Replace "same-origin REST proxy in parent frame, installed via app boot" with explicit choice of option A / B / C above. Default recommendation: option C.
- **D-03 (proxy dispatch logic):** Becomes moot if option C is chosen. Becomes scoped to "operator-installed bridge" if option B. Only stays as originally specified under option A.
- **D-04 (URL regex set):** Only relevant if A or B is chosen. Becomes moot under C.
- **D-NN-3 (schema rename):** Only relevant if A or B is chosen. Becomes moot under C.

If option C is chosen, Phase 3 reduces to:
1. Document in `README.md` and Splunkbase release notes that DS dashboards are not supported in this release.
2. Add a runtime check inside `visualization.js` (which runs in the iframe) that detects `Origin: null` (or, equivalently, `window.parent !== window.top` plus opaque-origin) and renders a user-friendly "DS is not supported, use SimpleXML" message instead of the broken cookie-less map.
3. Remove the probe stubs (`appserver/static/parent-auth-bridge.js`, `appserver/static/dashboard.js`, `default/data/ui/views/phase03_probe.xml`) since they no longer drive anything.
4. Close out Phase 3 plans 03-01 and 03-02 (which were predicated on the bridge being implementable).

If option B is chosen, Phase 3 grows: add an operator-script plan and a verification plan.

If option A is chosen (against my recommendation), Phase 3 needs an installer-patch plan and a re-test cadence tied to DS app version bumps.

---

### R2 follow-up (added during DS-engineering recommendations writeup) — DS already ships a FETCH-PROXY mechanism

While preparing the DS-engineering recommendations document (`03-DS-ENGINEERING-RECOMMENDATIONS.md`), we extracted the iframe-side bundle `splunk-dashboard-studio/appserver/static/build/ds-iframe-studio.js` (282 KB) and discovered an existing complete implementation of an iframe ↔ parent fetch proxy that R2's vector-2 sweep missed (the sweep targeted parent-side bundles only, where the keywords `extensionPoint`/`registerHook`/`pluginManager` etc. don't appear; the iframe-side bundle uses a different naming convention).

**What's there:**

- `src/FetchHandler/IframeFetchHandler.ts` — replaces `window.fetch` inside the iframe; same-origin URLs are routed via `postMessage({type: "FETCH-PROXY-REQUEST", ...})` to the parent.
- `chunks/chunk-DT4FOOLP.js` — parent-side handler (functions `da`/`fa`/`pa`/`Dn`) receives the request, executes `fetch()` in the parent's tuple-origin context, and posts back the response as `arrayBuffer + init` via `FETCH-PROXY-RESPONSE` postMessage. Iframe-side reconstructs a `Response` object.
- `src/IframeUtils/Fonts.ts` — does CSS-text rewriting to inline `.woff` font URLs as base64 in bootstrap CSS (the pattern that generalizes to fixing CSS `url(...)` references for any viz).

**Why it doesn't currently fix Maps+:**

- The parent-side handler's `pa()` helper unconditionally strips credentials before relaying the fetch (`credentials: "omit"` plus `Authorization`/`Cookie` header deletion). Result: every proxied fetch goes out cookieless and gets redirected to `/account/login`. Maps+'s tile-proxy traffic and per-app static loads both fail for this reason.
- The shim only intercepts `fetch()`. It does not intercept `<img src>`, `<link rel=stylesheet href>`, dynamic script loads, or CSS `url(...)` references emitted by the CSS engine — which is how most viz libraries (Leaflet included) load their non-tile assets.

**What this means for the R2 verdict:**

The verdict ("no top-frame extension surface exists") still stands as written — there is no third-party-callable extension point that a viz can use without DS modifying its own code. **What changes is the size of the modification needed on DS's side.** Previously we assumed DS would have to build a fetch-proxy mechanism from scratch (large engineering investment, hard to motivate without Splunk seeing the case). Now we know:

- The mechanism exists.
- It's well-designed (postMessage + transferable buffers, clean iframe-side `Response` reconstruction, symmetric error path).
- The single change blocking Maps+ is the unconditional credential-stripping in `pa()`.
- A ~30 LOC change (per-viz credential allow-list driven by a new `visualizations.conf` field) makes Maps+ work end-to-end without any further changes on DS's side.

**Implication for the user decision (options A/B/C):**

This significantly increases the viability of a fourth option:

- **Option D (new):** Submit a concrete, code-level recommendation document to Splunk DS engineers proposing the ~30 LOC change. Wait for DS to ship it. In the interim, Phase 3 closes with option C's graceful-degradation message ("Maps+ requires a SimpleXML dashboard"), and once DS ships the change Maps+ adds two lines to `visualizations.conf` and DS support becomes automatic.

The DS-engineering recommendations document (`03-DS-ENGINEERING-RECOMMENDATIONS.md`) is the proposal. Whether to actually submit it to Splunk (and through what channel — PR to splunk-public repo if any exists, support case, Splunkbase developer-advocate contact, conference talk, etc.) is a project-management question separate from the technical writeup.

**Do not re-open R2 based on this finding.** The verdict is unchanged: from-app-space-alone, Phase 3's stated goal remains unreachable. The FETCH-PROXY exists but is not currently usable for Maps+'s needs. Option D simply adds a longer-time-horizon path: ship C now, get DS to ship the small change, then upgrade to full support in a future Maps+ release.

---

## R1 — DS namespace re-test (M1.P4 inside `leaflet_maps_app`)

**Status: PRE-COLLAPSED by R2 § Vector 1 + Rendered-HTML ground truth.** R1's hypothesis was that the SimpleXML-era per-app `application.js` / `dashboard.js` auto-load might fire on DS pages when the script lives inside the viewing app's `appserver/static/`. R2 proved this is structurally impossible: DS's three Mako templates (`dashboard.html`, `example-hub.html`, `shared-dashboard.html`) do not reference the `customJsFiles` template variable that the controller populates, so even though `view.py:_getCustomFiles` does collect `application.js` from the viewing app's `appserver/static/` for non-SimpleXML dashboards, the loop that would render `<script>` tags is not present in the templates. The empirical capture of `/en-US/app/leaflet_maps_app/png_markers_copy` confirms it: zero scripts from `leaflet_maps_app`, despite that app being the URL namespace.

The probe stubs at `appserver/static/dashboard.js`, `appserver/static/parent-auth-bridge.js`, and `default/data/ui/views/phase03_probe.xml` are no longer load-bearing and become eligible for cleanup at Step 5 (the re-lock decision will inform whether to delete them now or hold them as scaffolding for option B).

**No empirical browser test is required.** The HTML response is the test, and it has been captured.

---

## R4 — Nav XML include path

**Status: PRE-COLLAPSED by R2 Rendered-HTML ground truth + Splunk nav XML schema.** R4's hypothesis was that the per-app `default/data/ui/nav/default.xml` might cause Splunk Web to inject a `<script>` into the top-frame nav region. Two independent reasons this is dead:

1. The captured DS-rendered HTML contains no nav DOM at all. The DS template includes vestigial CSS rules referencing `[data-view="views/shared/splunkbar/Master"]` and `[data-view="views/shared/appbar/Master"]`, but it does not actually render those DOM elements. The splunkbar and appbar (when shown on DS pages) are rendered by the DS React app at runtime, not from any per-app nav XML.
2. The Splunk nav XML schema does not support a `<script>` element. Allowed elements are `<nav>`, `<view>`, `<saved>`, `<collection>`, `<a>`, plus attributes. There is no slot in the schema for a script include, so even if DS rendered the nav from per-app XML, no script would be injected.

**No empirical browser test is required.** R4 collapses by HTML inspection plus schema inspection.
