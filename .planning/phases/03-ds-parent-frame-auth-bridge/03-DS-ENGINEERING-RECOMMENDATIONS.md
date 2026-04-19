# Dashboard Studio: enabling authenticated FETCH-PROXY for third-party custom visualizations

> Engineering proposal for the Splunk Dashboard Studio team.
> Reproducer + root-cause + concrete fix. Tested against Splunk Enterprise 10.2.2 with the bundled `splunk-dashboard-studio` app.

## 1. Issue summary

When a Dashboard Studio dashboard hosts a third-party custom visualization that issues `fetch()` from inside its iframe to an authenticated Splunk endpoint — its own app's REST handlers, or per-app static assets under `/static/app/<app>/...` — the iframe-side `window.fetch` shim correctly diverts the request to the parent's `FETCH-PROXY-REQUEST` handler, but the parent unconditionally strips credentials before relaying the fetch (`pa()` in the parent-side counterpart of `src/FetchHandler/IframeFetchHandler.ts` — see § 3 for exact code). The relayed request hits Splunk Web cookieless and is redirected to `/account/login`. The viz receives the login HTML in place of its expected payload and visibly breaks. § 2.1 below is a ~40-line synthetic reproducer (no third-party app dependency) that demonstrates this in isolation against any Splunk 10.x install.

The same root cause prevents real-world apps from shipping common functionality. **Maps+ for Splunk** (`leaflet_maps_app`, the most-installed third-party map visualization on Splunkbase, app id 4555) has a forthcoming release that routes map tiles through a Splunk REST handler (`/services/maps_plus/tile/proxy?z=…&x=…&y=…`) for tile-provider proxying purposes. Each tile fetch becomes a `window.fetch()` from the iframe → FETCH-PROXY → cookie-stripped → login HTML in place of the tile bytes → blank gray panel where the map should be. This is one specific high-visibility instance of the synthetic-reproducer bug. The same root cause also blocks any custom viz that fetches its own app's REST endpoints or static-asset bundles via `window.fetch`. (We can provide the Maps+ pre-release `.tgz` for end-to-end validation; see § 2.3.)

**Proposed fix (R1):** per-viz credential allow-list, opted into via two new fields in `visualizations.conf`, enforced inside the existing parent-side handler. ~46 LOC across 2 files. Backwards-compatible (opt-in). One change, all `window.fetch`-based scenarios fixed. (Optional follow-ons R2 and R3 in §§ 7–8 cover the adjacent failure class of assets that load via DOM APIs (`<img src>`, `<link href>`) or CSS `url(...)` rather than `fetch()` — R1 alone cannot reach those code paths.)

## 2. Reproducer

The bug is fully exercisable without any third-party app. § 2.1 is a ~40-line synthetic visualization that calls `window.fetch()` against the SplunkD `server/info` endpoint and renders the response — that is the canonical engineering reproducer. § 2.2 is the architectural diagnostic. § 2.3 is the optional Maps+ end-to-end path for production-impact validation, gated on a Maps+ pre-release `.tgz` we can provide on request.

### 2.1 Synthetic reproducer (recommended for engineering)

Tested against Splunk Enterprise 10.x with the bundled `splunk-dashboard-studio` app. No third-party app required.

**Files** (drop into `$SPLUNK_HOME/etc/apps/fetch_proxy_repro/`):

```
fetch_proxy_repro/
├── default/
│   ├── app.conf
│   └── visualizations.conf
└── appserver/static/visualizations/repro/
    ├── visualization.js
    └── visualization.css     (empty file)
```

`default/app.conf`:

```ini
[install]
is_configured = false

[ui]
is_visible = false
label = Fetch-Proxy Reproducer
```

`default/visualizations.conf`:

```ini
[repro]
label = Fetch-Proxy Reproducer
description = Issues window.fetch to /services/server/info from inside the viz iframe
default_height = 220
search_fragment = | makeresults
```

`appserver/static/visualizations/repro/visualization.js` (AMD):

```js
define(['jquery', 'api/SplunkVisualizationBase'], function ($, BaseViz) {
    return BaseViz.extend({
        initialize: function () {
            BaseViz.prototype.initialize.apply(this, arguments);
            this.$el = $(this.el);
        },
        updateView: function () {
            const el = this.$el.empty();
            const escape = s => s.replace(/[<&]/g, c => ({ '<': '&lt;', '&': '&amp;' }[c]));
            window.fetch('/services/server/info?output_mode=json')
                .then(r => r.text().then(body => ({
                    status: r.status,
                    contentType: r.headers.get('content-type') || '',
                    body
                })))
                .then(info => {
                    el.append(
                        '<pre style="white-space:pre-wrap;font:12px monospace;margin:0;padding:8px;">' +
                        'status      : ' + info.status + '\n' +
                        'content-type: ' + info.contentType + '\n' +
                        'first 240 B :\n' + escape(info.body.slice(0, 240)) +
                        '</pre>'
                    );
                })
                .catch(e => el.append('<pre>' + String(e) + '</pre>'));
        }
    });
});
```

**Steps:**

1. Create the four files above; restart Splunk Web.
2. Open Splunk Web as `admin`; create a Dashboard Studio dashboard.
3. Add a custom visualization panel; pick **Fetch-Proxy Reproducer**.
4. Drive it with the search `| makeresults` (any non-empty result satisfies DS's data-source requirement).
5. Save and view.

**Expected** (cookie-bearing fetch reaches SplunkD as the logged-in user):

```
status      : 200
content-type: application/json; charset=UTF-8
first 240 B :
{"links":{"_reload":"/services/server/info/_reload",...},"origin":"...","updated":"...","generator":{...}, ...
```

**Observed today** (cookies stripped by parent-side `pa()`; SplunkD redirects the cookieless request to the login page):

```
status      : 200
content-type: text/html; charset=UTF-8
first 240 B :
<!doctype html><html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Splunk Web - Login</title>
    ...
```

**Cross-check:** Render the same viz in a SimpleXML dashboard (`<dashboard>` instead of `<dashboard version="2">`). It returns the JSON body correctly. Same viz, same Splunk URL, same browser session — the only thing that changes is whether DS's iframe + FETCH-PROXY is in the path.

### 2.2 Architectural diagnostic — confirming the cookie boundary

In DevTools Network panel for the request issued by the synthetic reproducer, you will see:

- `Origin: null` (the iframe's opaque origin)
- No `Cookie` header on the relayed request
- Response: `200 OK` with `Content-Type: text/html; charset=UTF-8` and a body that begins `<!doctype html><html` — Splunk Web's login page rendered server-side because the request had no session.

The boundary is the iframe's opaque-origin sandbox combined with `SameSite=Lax` session cookies. (Background, not action: HTML §4.8.5 `sandbox` without `allow-same-origin` gives the iframe a unique opaque origin; per RFC 6265bis, `SameSite=Lax` cookies are omitted on cross-site subresource requests, including those from null-origin contexts. This is precisely why the parent-side FETCH-PROXY exists in the first place — the iframe cannot send cookies on its own. The issue is that the parent then strips them before relaying, which is the wrong default for fetches into the viz's own app namespace.)

### 2.3 Optional: Maps+ end-to-end validation (production-impact path)

Once R1 is implemented, an end-to-end pass against a real-world shipping app gives confidence that production users actually unblock. Maps+ for Splunk is the most-installed third-party map viz on Splunkbase (app id 4555).

The Maps+ release that exercises the FETCH-PROXY code path (the REST tile-proxy endpoint and the `DsProxyTileLayer` that routes Leaflet's tile fetches through `window.fetch`) is currently in pre-release on a feature branch — **not on Splunkbase yet**. We can provide a `.tgz` build for testing. With that pre-release installed alongside R1:

1. Open a Dashboard Studio dashboard; add a Maps+ panel.
2. Drive it with `| makeresults | eval latitude=37.7749, longitude=-122.4194`.
3. Save and view.

| | Expected (after R1 ships and Maps+ pre-release installed) | Observed today (Maps+ pre-release on stock DS) |
|---|---|---|
| Tile-proxy network responses | `200 OK` with `Content-Type: image/png` | `200 OK` with `Content-Type: text/html; charset=UTF-8`, body is the Splunk login page |
| Map tiles in the panel | Render | Blank gray panel |
| Console | No errors | `[maps-plus]` errors about JSON.parse failing on HTML |

Note: shipped Maps+ 4.6.2 from Splunkbase will *not* exhibit the FETCH-PROXY bug itself in DS — it has no `window.fetch`-based code paths, so the bug is unreachable from that build. (4.6.2 in DS does exhibit a related-but-different failure class for marker icons and CSS sprites that load via DOM APIs / CSS `url()` rather than `fetch()`. Those are the R2 / R3 follow-on territory in §§ 7–8 below; they are not what R1 fixes, and they are not blocked by the absence of R1.)

## 3. Root cause — the line that fails

The DS iframe runtime correctly anticipates this exact problem. The iframe-side `window.fetch` is replaced (`src/FetchHandler/IframeFetchHandler.ts`) so that same-origin fetches are diverted to the parent via `postMessage({type: "FETCH-PROXY-REQUEST", ...})`. The parent receives the request, runs `fetch()` in its own tuple-origin context (where it has cookies), and posts the response back as a transferable `arrayBuffer + init`. The iframe wraps the bytes back into a `Response` object. This part works.

The problem is the parent-side handler (in DS's dashboard bundle — webpack-mangled functions `da` / `fa` / `pa` / `Dn` in current bundles; the source file is the parent-side counterpart of `IframeFetchHandler.ts`). Decompiled and re-formatted:

```ts
// Entry: receives FETCH-PROXY-REQUEST from any custom-viz iframe
function handleFetchProxyRequest(event) {
  const { requestId, url, options } = event.data;
  const source = event.source;

  if (new URL(url).origin !== window.location.origin) {
    source.postMessage({
      type: "FETCH-PROXY-ERROR",
      requestId,
      error: "Proxy fetch is only allowed for same-origin requests"
    }, { targetOrigin: "*" });
    return;
  }

  const safeOpts = sanitizeFetchOptions(options);   // <-- problem starts here
  return relayFetch(url, safeOpts, requestId, source);
}

// THIS is the line that breaks Maps+
function sanitizeFetchOptions(opts) {
  const headers = new Headers(opts.headers);
  headers.delete("Authorization");
  headers.delete("Cookie");
  return {
    ...opts,
    credentials: "omit",   // <-- forces cookieless fetch even though parent has session cookies
    headers
  };
}

async function relayFetch(url, opts, requestId, source) {
  try {
    const response = await fetch(url, opts);
    const buffer = await response.arrayBuffer();
    source.postMessage({
      type: "FETCH-PROXY-RESPONSE",
      requestId,
      arrayBuffer: buffer,
      init: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      }
    }, { targetOrigin: "*", transfer: [buffer] });
  } catch (e) {
    source.postMessage({
      type: "FETCH-PROXY-ERROR",
      requestId,
      error: e.message
    }, { targetOrigin: "*" });
  }
}
```

The `credentials: "omit"` policy is the right default for an arbitrary cross-frame fetch proxy — without it, any custom viz could ride the user's session to attack any Splunk endpoint. **But the policy is too coarse.** A viz should be allowed to fetch its own app's static assets and its own app's REST endpoints under cookie auth — those are within the trust boundary the user already extended to that viz when they installed the app. The current policy denies that and there is no way to opt into it.

## 4. Proposed fix (R1) — per-viz credential allow-list

Two new opt-in fields in `visualizations.conf`. Two changes in DS code. No iframe-side changes.

### 4.1 Schema additions (visualizations.conf)

```ini
[<viz_name>]
# ... existing fields ...

# Opt-in: allow this visualization's relayed fetches to carry the parent's
# Splunk session cookies (credentials: "same-origin" instead of "omit").
# Defaults to false. Has no effect unless the URL is also in the allow-list.
allow_authenticated_proxy = true

# Comma-separated allow-list of URL path patterns (anchored at the
# dashboard's origin). Patterns:
#   '*'  matches one path segment (no slashes)
#   '**' matches any characters, including slashes
# The viz's own /static/app/<app>/** namespace is implicitly allowed
# whenever allow_authenticated_proxy = true; this list is for additional
# endpoints the viz needs (typically REST handlers under /services/<app>/...).
authenticated_proxy_urls = /services/<app>/**
```

### 4.2 Code change 1 — propagate the new fields through the registry mapper

The custom-viz registry mapper that consumes `services/data/ui/visualizations` and returns the per-viz metadata DS holds in memory needs two new fields. In current bundles this is the function exposed as `oh` in `chunks/chunk-J3STZZGT.js`; the source file looks like a TypeScript module that maps SplunkD entries to the registry's internal shape.

```ts
// Inside the mapper's return object, alongside the existing fields:
return {
  build, app, name, framework, cssUrl, jsUrl,
  formatter: content.formatter ?? null,
  label: content.label,
  dataSources, initialRequestParams, allowUserSelection,
  supportsDrilldown: normalizeBoolean(content.supports_drilldown),

  // NEW
  allowAuthenticatedProxy: normalizeBoolean(content.allow_authenticated_proxy ?? false),
  authenticatedProxyUrls: (content.authenticated_proxy_urls ?? "")
    .split(",")
    .map(p => p.trim())
    .filter(Boolean)
};
```

### 4.3 Code change 2 — track viz context per iframe contentWindow

When DS constructs each custom-viz iframe (the React component that emits the `<iframe sandbox="allow-scripts" srcDoc={...}>` element — currently exposed as `vo` / `Eo` in `chunks/chunk-DT4FOOLP.js`), register the iframe's `contentWindow` against the viz's metadata so the parent-side fetch handler can look up which viz a request came from.

```ts
// Module-scope registry, owned by the parent-side fetch handler module
const vizContextByContentWindow = new WeakMap<Window, VizContext>();

interface VizContext {
  app: string;
  name: string;
  allowAuthenticatedProxy: boolean;
  authenticatedProxyUrls: string[];
}

// Inside the CustomVizIframe React component:
useEffect(() => {
  const cw = iframeRef.current?.contentWindow;
  if (cw) {
    vizContextByContentWindow.set(cw, {
      app: vizMeta.app,
      name: vizMeta.name,
      allowAuthenticatedProxy: vizMeta.allowAuthenticatedProxy,
      authenticatedProxyUrls: vizMeta.authenticatedProxyUrls
    });
  }
  return () => {
    if (cw) vizContextByContentWindow.delete(cw);
  };
}, [vizMeta]);
```

`WeakMap` keyed on `contentWindow` is the right structure: when the iframe is removed from the DOM, the `contentWindow` becomes unreachable and the entry is GC'd automatically. No leak bookkeeping needed.

### 4.4 Code change 3 — policy branch in the parent-side handler

```ts
// Replace the existing handleFetchProxyRequest with:
function handleFetchProxyRequest(event) {
  const { requestId, url, options } = event.data;
  const source = event.source as Window;

  if (new URL(url).origin !== window.location.origin) {
    source.postMessage({
      type: "FETCH-PROXY-ERROR",
      requestId,
      error: "Proxy fetch is only allowed for same-origin requests"
    }, { targetOrigin: "*" });
    return;
  }

  // NEW: look up the viz context for this iframe and decide credential policy
  const vizContext = vizContextByContentWindow.get(source);
  const allowCredentials =
    vizContext != null
    && vizContext.allowAuthenticatedProxy
    && isUrlInVizAllowList(url, vizContext);

  const safeOpts = allowCredentials
    ? sanitizeFetchOptionsAuthenticated(options)   // NEW: keep cookies
    : sanitizeFetchOptions(options);                // existing: strip cookies (default)

  return relayFetch(url, safeOpts, requestId, source);
}

// Existing — unchanged. Default for any viz that does not opt in.
function sanitizeFetchOptions(opts) {
  const headers = new Headers(opts.headers);
  headers.delete("Authorization");
  headers.delete("Cookie");
  return { ...opts, credentials: "omit", headers };
}

// NEW
function sanitizeFetchOptionsAuthenticated(opts) {
  const headers = new Headers(opts.headers);
  headers.delete("Authorization");   // still strip — viz can't override parent auth
  headers.delete("Cookie");          // still strip — browser sets it from the jar
  return { ...opts, credentials: "same-origin", headers };
}

// NEW
function isUrlInVizAllowList(url: string, ctx: VizContext): boolean {
  const u = new URL(url);
  const pathAndQuery = u.pathname + u.search;

  // Implicit: the viz's own /static/app/<app>/** namespace
  if (u.pathname.startsWith(`/static/app/${ctx.app}/`)) return true;

  // Explicit patterns from visualizations.conf
  return ctx.authenticatedProxyUrls.some(pattern =>
    matchUrlPattern(pathAndQuery, pattern)
  );
}

// NEW — glob-ish pattern matcher. '*' = [^/]*, '**' = .*
function matchUrlPattern(path: string, pattern: string): boolean {
  const re = new RegExp("^" + pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<DOUBLESTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DOUBLESTAR>>/g, ".*")
    + "$");
  return re.test(path);
}
```

### 4.5 Total LOC for R1

- Registry mapper: 2 new fields, ~6 lines.
- VizContext registration: 1 `WeakMap` + 1 `useEffect` block, ~15 lines.
- Handler change: 1 new branch in entry function + 2 new helpers (`sanitizeFetchOptionsAuthenticated`, `isUrlInVizAllowList`, `matchUrlPattern`), ~25 lines.

**Total: ~46 lines across 2 files.** Backwards-compatible (existing vizzes that don't set `allow_authenticated_proxy` see no behavior change).

## 5. Why this is safe — security analysis

The R1 design preserves every security property the current implementation enforces, and is strictly narrower than what a SimpleXML dashboard already permits the same viz.

| Property | Current behavior | After R1 |
|---|---|---|
| Iframe runs in opaque-origin sandbox | Yes (`sandbox="allow-scripts"`) | Yes (unchanged) |
| Iframe can read `parent.document` | No (cross-origin SOP throw) | No (unchanged) |
| Iframe can read `parent.localStorage` / cookies directly | No | No (unchanged) |
| Iframe can issue cookie-bearing requests to *any* Splunk endpoint | No | **No.** Only URLs in the viz's own static namespace + its declared `authenticated_proxy_urls` patterns. |
| Viz can override the parent's Splunk session via `Authorization: Bearer ...` in fetch options | No (`Authorization` header stripped) | No (unchanged — both `sanitizeFetchOptions` paths still strip it) |
| Viz can spoof a `Cookie` header value | No (header stripped) | No (unchanged) |
| Cross-app namespace isolation (viz in app A cannot fetch `/static/app/B/...` with cookies) | No need (no cookies anywhere) | **Yes**, enforced by `isUrlInVizAllowList` — viz's own `app` is the implicit allow-list root. |
| Splunk admin can audit which endpoints a viz can hit with cookies | N/A | **Yes**, by reading the viz's `visualizations.conf` at install time. The patterns are committed to the app's source. |

The `authenticated_proxy_urls` value is read from the viz's own conf file, which is part of the app the user installed. There is no runtime-mutable surface — a viz cannot widen its own allow-list at execution time. SplunkD's existing app permissions model governs who can install apps with what entries.

Compared to a SimpleXML dashboard hosting the same viz: a SimpleXML viz has full top-frame DOM access and can issue arbitrary cookie-bearing fetches to *any* Splunk endpoint, with no allow-list of any kind. R1 is a strict reduction of that.

## 6. Why not the obvious alternatives

### 6.1 "Just add `allow-same-origin` to the iframe sandbox"

This would let the browser send cookies on iframe subresource requests, but it would also:

- Let any custom viz read `parent.document` and extract data from other panels in the dashboard, including data from datasets that aren't passed to that viz.
- Let viz extract auth state from `parent.localStorage`.
- Let viz issue cookie-bearing same-origin requests to *any* Splunk endpoint, not just declared ones.

R1 preserves the opaque-origin sandbox (no DOM access into the parent) and adds only the narrow capability of cookie-bearing fetches to allow-listed URLs.

### 6.2 "Let third-party apps install their own parent-frame script"

We exhaustively enumerated this option before writing this proposal. There is no top-frame extension surface a third-party app can use:

- DS Mako templates (`splunk-dashboard-studio/appserver/templates/dashboard.html`, `example-hub.html`, `shared-dashboard.html`) hardcode their script tags. They do not render the `customJsFiles` template variable that Splunk Web's `view.py:_getCustomFiles` populates with `application.js` from the viewing app's namespace. Empirically: a `curl` of `/en-US/app/leaflet_maps_app/<dashboard>` against a DS dashboard returns HTML with zero scripts from `leaflet_maps_app` — only DS, system core, and `splunk_instrumentation` scripts.
- The DS React boot bundle (we read all 4 main chunks, ~11 MB) contains no extension/plugin/hook keywords beyond the internal `apiRegistry` plumbing (`registerVisualizationApi` etc.), which is closed-over inside the React tree and not callable from outside.
- The custom-viz registry mapper reads only a closed schema; there is no field where a viz could declare a parent-frame script.
- `setup.xml` is handled by `admin.py`, not invoked by `view.py` on dashboard view.

The Splunk Web architecture deliberately gives DS sole control over the dashboard top frame. That is the right architecture; we are not asking you to change it. We are asking you to extend the proxy you already built so that vizzes can use it as intended.

## 7. Optional follow-on R2 — DOM-level resource proxy in the iframe

R1 unblocks every viz request that goes through `fetch()`. Most viz libraries also load resources via DOM APIs (`<img src>`, `<link rel=stylesheet href>`, dynamic `<script src>`) — none of those go through `fetch()` and therefore none are intercepted by the existing iframe shim. The viz author can wrap most of these manually (Maps+ does this for tiles via a `DsProxyTileLayer` that overrides Leaflet's `createTile` to use `fetch()` and return blob URLs), but the wrapping is brittle and has to be repeated per resource type and per viz library.

R2: extend `src/FetchHandler/IframeFetchHandler.ts` (or add a sibling module like `src/ResourceProxy/IframeResourceProxy.ts`) with a `MutationObserver` and DOM property-setter overrides on `HTMLImageElement.src`, `HTMLLinkElement.href`, `HTMLScriptElement.src`. For each set value, if the URL matches the viz's `authenticatedProxyUrls` allow-list (passed into the iframe via the existing srcDoc construction props), fetch the resource via the shimmed `window.fetch` (which already routes through FETCH-PROXY) and substitute a `URL.createObjectURL(blob)`.

```ts
const proxyUrlPatterns = window.__DS_VIZ_CONTEXT__?.authenticatedProxyUrls || [];
const blobCache = new Map<string, string>();

async function maybeProxyUrl(url: string): Promise<string | null> {
  const absolute = new URL(url, getParentOrigin());
  if (absolute.origin !== getParentOrigin()) return null;
  if (!matchesAnyPattern(absolute, proxyUrlPatterns)) return null;
  const cached = blobCache.get(absolute.href);
  if (cached) return cached;

  const response = await window.fetch(absolute.href);  // routes through FETCH-PROXY
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  blobCache.set(absolute.href, blobUrl);
  return blobUrl;
}

// Intercept <img src>:
const origSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
Object.defineProperty(HTMLImageElement.prototype, "src", {
  set(value: string) {
    maybeProxyUrl(value).then(blobUrl => {
      origSrcDescriptor.set!.call(this, blobUrl ?? value);
    }).catch(() => {
      origSrcDescriptor.set!.call(this, value);
    });
  },
  get() { return origSrcDescriptor.get!.call(this); }
});

// Similar for <link href>, <script src>.
// Plus a MutationObserver to catch elements added with attributes already set.
```

**LOC: ~150** (one new module + property-setter overrides for ~3 element types + cache management).

**Notes:**

- The async-set pattern means `img.src = 'foo'; console.log(img.src)` will see the original URL momentarily before the blob URL is assigned. This matches existing browser behavior for image loading (which is async anyway).
- Blob URLs need lifecycle management. Simplest policy: hold for the lifetime of the iframe (revoke on `pagehide`). For very long-lived dashboards, consider a bounded LRU.
- Cache key is the canonicalized URL string. Same URL → same blob.

**Effect on Maps+:** removes the `DsProxyTileLayer` workaround (~150 lines of Maps+-side code that goes away). Stock `L.TileLayer` and Leaflet's plugin marker icons just work.

## 8. Optional follow-on R3 — CSS-text rewriting for `url(...)` references

R1 + R2 still don't handle CSS `url(...)` references emitted by the CSS engine when it parses a stylesheet. Example from Leaflet's CSS:

```css
.leaflet-default-icon-path { background-image: url(images/marker-icon.png); }
.leaflet-control-zoom-in   { background-image: url(images/zoom-in.png); }
```

The CSS engine fetches these URLs internally — not via `fetch()`, not via any JS-observable DOM API. Neither R1 nor R2 can intercept them; the viz's icons appear broken even after R1+R2 ship.

You already have a working pattern for this in `src/IframeUtils/Fonts.ts`, which inlines `.woff` URLs in the bootstrap CSS as base64 data URLs. R3 generalizes that pattern to all CSS files loaded for the viz:

1. Change the viz boot template: instead of injecting `<link rel="stylesheet" href={cssUrl}>`, fetch the CSS text via the shimmed `window.fetch`, rewrite all `url(...)` references that match the viz's allow-list to blob URLs of the pre-fetched bytes (using the R2 `maybeProxyUrl` + cache), then inject as `<style>{rewrittenCss}</style>`.
2. Generalize the regex: `/url\(\s*(?:'([^']+)'|"([^"]+)"|([^)\s]+))\s*\)/g` instead of only `.woff`-suffixed URLs.
3. Recursively rewrite `@import url(...)` rules.

```ts
const cssUrlRegex = /url\(\s*(?:'([^']+)'|"([^"]+)"|([^)\s]+))\s*\)/g;

async function rewriteCssText(cssText: string, baseUrl: string): Promise<string> {
  const promises: Promise<string | null>[] = [];
  const matches: { original: string; url: string }[] = [];
  let m;
  while ((m = cssUrlRegex.exec(cssText)) !== null) {
    const url = new URL(m[1] ?? m[2] ?? m[3], baseUrl).href;
    matches.push({ original: m[0], url });
    promises.push(maybeProxyUrl(url));
  }
  const blobUrls = await Promise.all(promises);
  let result = cssText;
  matches.forEach((mm, i) => {
    if (blobUrls[i]) {
      result = result.replace(mm.original, `url('${blobUrls[i]}')`);
    }
  });
  return result;
}

async function loadVizStylesheet(cssUrl: string): Promise<void> {
  const response = await window.fetch(cssUrl);
  const cssText = await response.text();
  const rewritten = await rewriteCssText(cssText, cssUrl);
  const style = document.createElement("style");
  style.textContent = rewritten;
  document.head.appendChild(style);
}
```

**LOC: ~200** (R2 reuse + recursion handling + viz boot template change).

**Caveat:** R3 is the only change that touches existing viz boot behavior (changes how viz CSS is injected). Suggest gating it on a new field like `proxy_viz_css = true` defaulted to `false`, then flipping the default in a later release once it's been stable.

**Effect on Maps+:** all of `contrib/css/leaflet.css`, `leaflet.markercluster.css`, `leaflet-geoman.css` etc. render correctly with their bundled icons, sprites, and fonts. Maps+ in DS reaches feature parity with Maps+ in SimpleXML.

## 9. Test plan

The following test cases exercise the full surface and should all pass after R1 ships (R2/R3 cases gated on those landing).

### 9.1 R1 cases

| # | Setup | Expected |
|---|---|---|
| 1 | Viz with `allow_authenticated_proxy = false`, fetches own service | Cookies stripped; relayed fetch returns login redirect; viz fails (current behavior — confirms R1 default is identical to today) |
| 2 | Viz with `allow_authenticated_proxy = true`, no `authenticated_proxy_urls`, fetches own `/static/app/<app>/file.js` | Implicit allow for own static namespace; cookies attached; 200 |
| 3 | Viz with `allow_authenticated_proxy = true`, `authenticated_proxy_urls = /services/myapp/**`, fetches `/services/myapp/foo` | Cookies attached; 200 |
| 4 | Same viz fetches `/services/admin/users` | NOT in allow-list; cookies stripped; 401 / login redirect — verifies allow-list is enforcing |
| 5 | Same viz fetches `/static/app/OTHER_APP/file.js` | Not in viz's own namespace, not in allow-list; cookies stripped; fails — verifies cross-app isolation |
| 6 | Viz attempts `Authorization: Bearer FAKE_TOKEN` in fetch options | Header stripped before relay; viz cannot impersonate |
| 7 | Pattern `/services/myapp/v1/**` matches `/services/myapp/v1/foo/bar` but not `/services/myapp/v2/foo` | Confirms `**` semantics |
| 8 | Empty `authenticated_proxy_urls` plus `allow_authenticated_proxy = true` | Only the implicit `/static/app/<app>/**` is allowed |
| 9 | Cross-origin URL in fetch (e.g., `https://other-site.com/foo`) | Existing same-origin check still rejects with `FETCH-PROXY-ERROR` |

### 9.2 R2 cases

| # | Setup | Expected |
|---|---|---|
| 1 | Viz sets `<img src="/services/myapp/sprite.png">`, URL in allow-list | Relayed via FETCH-PROXY; blob URL substituted; image renders |
| 2 | Viz inserts `<link rel="stylesheet" href="/static/app/myapp/style.css">` | Relayed; blob URL substituted; stylesheet loads |
| 3 | Viz uses `MutationObserver`-style late attribute writes | Still intercepted |
| 4 | Viz URL is OUTSIDE its allow-list | Original URL passes through unmodified (which will fail with cookie redirect — that is the intended diagnostic) |

### 9.3 R3 cases

| # | Setup | Expected |
|---|---|---|
| 1 | Viz CSS contains `url('images/icon.png')` resolved relative to the CSS file | Image URL re-resolved against CSS base URL; fetched; blob URL substituted in rewritten CSS |
| 2 | Viz CSS contains `@import url('subset.css')` | subset.css recursively fetched + rewritten before parent CSS injected |
| 3 | Viz CSS contains a `data:` URL in `url()` | Passed through unmodified |
| 4 | Viz CSS contains a cross-origin `url()` | Passed through unmodified |

### 9.4 End-to-end with Maps+

After R1 ships (and Maps+ ships an update with `allow_authenticated_proxy = true` + the appropriate `authenticated_proxy_urls`):

1. Install Maps+ ≥ next-release.
2. Open the repro dashboard from § 2.2.
3. Tiles render. Network panel shows tile-proxy responses with `Content-Type: image/png` and `200 OK`.
4. (After R2 also ships:) marker icons visible.
5. (After R3 also ships:) zoom controls and cluster bubble icons visible.

We will provide a Maps+ pre-release for end-to-end testing against your DS pre-release builds at any of these checkpoints.

## 10. Compatibility / migration notes

- **R1 is fully backwards-compatible.** Default behavior of the FETCH-PROXY for any viz that does not set `allow_authenticated_proxy = true` is bit-identical to today (`credentials: "omit"`, `Authorization` and `Cookie` headers stripped). No existing viz changes.
- **R2 is backwards-compatible** if gated on R1 opt-in. Vizzes that don't opt in see no DOM-level interception.
- **R3 is mostly backwards-compatible**; suggest gating on a new opt-in field for the first release, then flipping the default.
- **No SplunkD `app.conf` `min_splunk_version` bump is needed for R1 alone.** R2/R3 may benefit from a per-viz "requires DS proxy version ≥ N" declaration so vizzes can fail gracefully on older DS — discuss as you see fit.
- **No protocol-level changes to `FETCH-PROXY-REQUEST` / `FETCH-PROXY-RESPONSE` postMessage shape.** The wire format is unchanged; only the parent-side policy changes.

## 11. What Maps+ ships once R1 lands

Two lines in `leaflet_maps_app/default/visualizations.conf`:

```ini
[maps-plus]
allow_authenticated_proxy = true
authenticated_proxy_urls = /services/maps_plus/tile/proxy*, /services/maps_plus/**
```

No additional JS code change in Maps+ for the R1 case. The Maps+ pre-release referenced in § 2.3 already routes Leaflet's tile fetches through `window.fetch` (via a `DsProxyTileLayer` subclass that overrides `createTile`), so the existing FETCH-PROXY flow Just Works once cookies stop being stripped. Shipped Maps+ on Splunkbase today does not yet contain that wrapper; the visualizations.conf snippet above ships in the same Maps+ release that contains the wrapper.

After R2 ships, Maps+ would remove the `DsProxyTileLayer` (~150 lines) and use stock `L.TileLayer`.

After R3 ships, Maps+ ships nothing further; the bundled CSS asset packs render correctly.

---

## Appendix A — File and offset references

All offsets and function names are from the un-minified, decompressed bundles as read from `/opt/splunk/etc/apps/splunk-dashboard-studio/appserver/static/build/` in Splunk Enterprise 10.2.2. The webpack chunk hashes will differ in your tree; the source filenames (where `// src/...` comments are present in the bundle) will be stable.

| Concept | Bundle file (10.2.2) | Source file (from `// src/...` comments in bundle) | Notes |
|---|---|---|---|
| Iframe sandbox attribute | `chunks/chunk-DT4FOOLP.js` @ offset 91847 | (inferred — CustomVizIframe component) | Literal `sandbox: "allow-scripts"` in React `createElement`; no `allow-same-origin` |
| Iframe-side `window.fetch` shim | `ds-iframe-studio.js` @ offset 276942 | `src/FetchHandler/IframeFetchHandler.ts` (function `initIframeFetchSetup`) | Replaces `window.fetch`, routes same-origin URLs via FETCH-PROXY-REQUEST |
| Parent-side FETCH-PROXY handler | `chunks/chunk-DT4FOOLP.js` (functions `da`/`fa`/`pa`/`Dn` after webpack mangling) | (inferred — likely `src/FetchHandler/DashboardFetchHandler.ts` or similar parent-side counterpart of `IframeFetchHandler.ts`) | `Dn` registers the handler; `da` is the entry point; `pa` is the credential-stripping helper to change |
| MessageHandler dispatcher | `ds-iframe-studio.js` (functions `oe`/`ie` after mangling) | `src/MessageHandler/MessageHandler.ts` | `registerMessageHandler(type, handler, iframeRef)` — dispatcher for incoming postMessage events; iframe-side has the same shape |
| Existing CSS rewriting (font-only) | `ds-iframe-studio.js` | `src/IframeUtils/Fonts.ts` (function `initIframeFonts`) | The pattern to generalize for R3 |
| Custom-viz registry mapper | `chunks/chunk-J3STZZGT.js` (function `oh` @ offset 283147) | (inferred — TypeScript module that maps SplunkD `services/data/ui/visualizations` entries to internal registry shape) | Add `allowAuthenticatedProxy` and `authenticatedProxyUrls` fields here |

To reproduce the bundle reads on a developer machine:

```bash
docker cp <splunk-container>:/opt/splunk/etc/apps/splunk-dashboard-studio/appserver/static/build/. /tmp/splunk-bundle/
grep -l 'FETCH-PROXY-REQUEST' /tmp/splunk-bundle/chunks/*.js
grep -l 'FetchHandler' /tmp/splunk-bundle/*.js
```

## Appendix B — Background specs (for reference, no action needed)

- HTML §4.8.5 — `sandbox` keyword: without `allow-same-origin`, the iframe's document gets a unique opaque origin.
- HTML §7.1.1 — same-origin algorithm: opaque ≠ tuple → not same origin.
- HTML §7.2.1.3.1 — CrossOriginProperties: the cross-origin Window safe-list is `window`, `self`, `location`, `close`, `closed`, `focus`, `blur`, `frames`, `length`, `top`, `opener`, `parent`, `postMessage`. `document`, `eval`, `addEventListener` etc. are NOT on this list — any other property access throws SecurityError per §7.2.1.1.
- RFC 6265bis — SameSite cookies: `SameSite=Lax` cookies are omitted on cross-site subresource requests, including those from null-origin contexts. This is why the iframe-side direct fetch fails today and why the parent-side FETCH-PROXY exists in the first place.
