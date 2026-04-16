# Technical Concerns — Maps+ for Splunk v4.6.1

> Generated from codebase analysis. Dates are based on current repo state (2026-04-16).

---

## 1. Single Point of Failure — Monolithic Source

**Severity: HIGH**

`src/maps-plus.js` is **3,564 lines** in a single AMD module. Every source change requires rebuilding the entire bundle. There is no code splitting and no tree shaking (the externals pattern prevents webpack from analyzing Splunk runtime imports). High cognitive load to make changes — shared state variables (`allDataProcessed`, `isInitializedDom`, etc.) are referenced across dozens of functions.

**Concrete risk:** Modifying one feature area can silently regress unrelated behavior when flags or settings objects aren't properly reset between `updateView()` cycles. CLAUDE.md explicitly warns: "Always verify the fix doesn't cause side effects by tracing all references to modified variables/flags before committing."

---

## 2. Large Bundle Size (4.4MB committed)

**Severity: HIGH**

`visualization.js` is **4.43 MB** minified (as measured on disk). It bundles Leaflet, MapLibre GL JS (~500KB), Turf.js, milsymbol, FontAwesome 7, all Leaflet plugins, and third-party contrib code. The file is committed to git.

Every Splunk dashboard page that uses the visualization must download this entire bundle. With multiple Maps+ panels on a single dashboard, the browser must parse and execute the full 4.4MB module per panel instance (each gets its own AMD define closure).

**Concrete risk:** Slow dashboard load times, especially with large datasets or limited bandwidth. Bundle grew from ~1.05 MB in v4.4.0 to 4.43 MB today after adding MapLibre GL and FontAwesome 7 upgrades.

---

## 3. No Automated Testing or Linting

**Severity: HIGH**

- Zero unit tests, zero integration tests, zero E2E tests
- No ESLint, Prettier, JSHint, or any static analysis configured
- Verification relies entirely on **23 manual Splunk XML demo dashboards** in `default/data/ui/views/`
- CLAUDE.md explicitly notes: "There are no tests and no linter configured"

This means every regression goes undetected until a user hits it in production. A history of silent bugs (implicit globals, unbounded DOM node accumulation, `eval()` on user data) was only caught during manual review or after users reported issues.

---

## 4. Dependency Churn & Supply Chain Risk

**Severity: MEDIUM**

The project has **25 runtime npm dependencies** plus 6 devDependencies. Notable concerns:

- **`serialize-javascript` and `lodash`** — known CVEs patched via npm `overrides`, but this is a reactive (not proactive) approach
- **`jquery@^4.0.0`** — unusual major version; jQuery has never publicly released a 4.x series, suggesting this may be a fork or internal build with potential compatibility surprises
- **`leaflet-measure: sghaskell/leaflet-measure#master`** — points directly to a user's fork branch; if the fork maintainer stops maintaining it, there is no stable tag to fall back to
- **Mixed version ranges** — some deps pinned to exact versions (`@geoman-io/leaflet-geoman-free: 2.11.4`, `@turf/turf: 7.3.4`) while others use caret ranges
- **Webpack upgrades are risky** — Webpack was upgraded from 1.x → 3.x → 5.x with Babel migration; each jump required manual loader configuration changes and could break again

---

## 5. Splunk Platform Coupling

**Severity: HIGH**

The app declares `api/SplunkVisualizationBase` and `api/SplunkVisualizationUtils` as webpack externals — these are resolved at runtime by Splunk's internal RequireJS loader. The README claims "Splunk 10.x" compatibility.

**Concrete risk:** Splunk Web internals (RequireJS module paths, visualization API surface) are not part of Splunk's public contract. A Splunk platform upgrade could:
- Change or remove the RequireJS module paths, breaking visualization loading entirely
- Modify `SplunkVisualizationBase` methods between major releases
- Alter how drilldown tokens (`$clickedLatLng$`, `$mapmarkers$`) are propagated to dashboard inputs

---

## 6. Mixed Build Systems

**Severity: MEDIUM**

Two separate build pipelines with different tooling versions and configurations:

| Directory | Webpack | Babel | Key syntax |
|-----------|---------|-------|------------|
| `maps-plus/` | 5.x | 7.x (`rules`, modern loaders) | ES6+ target (modern browsers) |
| `google-street-view/` | 1.12.6 | None | CommonJS, `loaders` key (Webpack 1 syntax) |

The street view plugin also uses a different jQuery version (^3.6.0 vs ^4.0.0 in the main app), creating potential behavioral inconsistencies if both visualizations appear on the same dashboard.

---

## 7. Shared State & Render Cycle Complexity

**Severity: HIGH**

The `updateView()` lifecycle (lines ~2100–2800) manages numerous internal flags that control render behavior:
- `allDataProcessed` — set/reset across multiple code paths (5 references in the source), gates whether new data triggers a full re-render or just an update
- `isInitializedDom` — prevents duplicate layer registration but is reset per cycle
- Settings merge across at least 4 sources: `defaultConfig` object → dashboard options → format menu changes → previous config (`onConfigChange` receives `configChanges` and `previousConfig`)

CLAUDE.md explicitly warns about tracing all references to modified variables/flags. The `_getConfigValue()` helper was added in v4.1.1 to consolidate a repeated ternary pattern, suggesting this area has been a source of bugs before.

---

## 8. Browser Compatibility Gaps

**Severity: LOW-MEDIUM**

IE11 support was dropped in v4.4.0 (confirmed by the Babel target change from IE11 to modern evergreen browsers). The webpack config targets "last 2 Chrome versions, last 2 Firefox versions, last 2 Safari versions, last 2 Edge versions."

**Concrete risk:** Enterprise Splunk deployments often lag behind browser updates by 6–18 months. MapLibre GL JS also has its own browser compatibility constraints (WebGL 2 required). Customers on enterprise browsers like Chrome ESR or older Firefox ESR may experience broken map rendering.

---

## 9. Token Size Limits — Lasso Selection

**Severity: MEDIUM-HIGH**

When lasso selection is enabled (`selectingMarkers` field), the `$mapmarkers$` token receives a JSON array containing the **complete SPL row data** for every selected marker (line 2653–2656 of `maps-plus.js`). Each row includes all fields present in the search result.

Splunk imposes token size limits (typically ~16KB per token, with total dashboard token space also bounded). Dashboards with large `description` or `tooltip` HTML fields can easily produce massive payloads. The README documents this as a known limitation with mitigation guidance.

**Concrete risk:** Silent truncation of selection data when the payload exceeds Splunk's token capacity. Users see incomplete marker data in drilldown searches without any error indication.

---

## 10. Canvas Rendering Side Effects

**Severity: MEDIUM**

Circle markers and other vector layers use `layerPriority` to control z-ordering (21 references in source). When `renderer === "canvas"` is active, Leaflet's canvas renderer blocks mouse events for layers below the highest-priority canvas layer — a known [Leaflet issue #4135](https://github.com/Leaflet/Leaflet/issues/4135).

The codebase has workarounds (checking `renderer` type before tooltip rendering, layer priority adjustments), but interactive features like tooltips and drilldowns may not work correctly when multiple canvas-rendered layers coexist at different priorities.

---

## 11. Committed Build Artifacts

**Severity: MEDIUM**

`visualization.js` (4.43 MB) is committed to git alongside the 3,564-line source file. This means:
- Every `git clone` pulls 4.4MB+ of generated code
- Git history contains the full evolution of a minified bundle — making it impossible to review actual source changes in diffs
- Contributors might accidentally edit `visualization.js` instead of `src/maps-plus.js`
- No `.gitignore` rule to exclude build artifacts (the file is tracked)

---

## 12. Documentation Gaps

**Severity: LOW-MEDIUM**

- `README.md` is **1,090 lines** of field-by-field documentation but there is **no architecture doc** in the repo
- The CHANGELOG does have entries for recent versions (4.1.0–4.6.1), but older versions (3.x) have sparse release notes — some features are undocumented except in code comments
- `contrib/` directory contains bundled third-party CSS, fonts, images, and JS with mixed license compliance: FontAwesome 7 (different free/pro tiers for icon families), MapLibre GL (BSD), Leaflet plugins (MIT/BSD variants)
- No `CONTRIBUTING.md`, no architecture overview, no explanation of the render cycle or settings merge logic

---

## Summary of Severity Distribution

| Severity | Count | Concerns |
|----------|-------|----------|
| HIGH | 5 | #1 Monolithic source, #2 Bundle size, #3 No tests/linting, #5 Splunk coupling, #7 Shared state complexity |
| MEDIUM-HIGH | 2 | #9 Token size limits, (#4 deps if CVEs materialize) |
| MEDIUM | 4 | #4 Dependency churn, #6 Mixed build systems, #10 Canvas side effects, #11 Committed artifacts |
| LOW-MEDIUM | 2 | #8 Browser compatibility, #12 Documentation gaps |
| LOW | 0 | — |

---

*This document should be reviewed and updated whenever major architectural changes are made to the project.*
