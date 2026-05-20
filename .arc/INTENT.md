## What I'm building

Maps+ for Splunk — a custom Leaflet-based map visualization for the Splunk platform,
distributed as a Splunk app on Splunkbase. Users install it and drive all map behavior
through SPL field names in their searches. One source file (~3,300 lines), one compiled
bundle, deployed to Splunk instances.

## Why

Splunk has no built-in interactive mapping visualization. Maps+ fills that gap with a
rich, field-driven API: markers, clusters, heatmaps, path lines, KML overlays, military
symbols, drawn selections, and vector tile basemaps — all controllable from SPL without
dashboard XML hacks. The primary users are Splunk power users and admins building
operational dashboards (security, logistics, COP, network geo).

## What this is NOT

- Not a general-purpose mapping library or web app
- Not a product with a backend — everything runs client-side inside Splunk's viz iframe
- Not an app that exposes an API, handles auth, or stores data
- Not targeting mobile or touch-first UX
- Not responsible for SPL query performance or Splunk's result limits
- Not a paid product — released on Splunkbase, community-supported

## What I'm sure of

- Single-file architecture (`src/maps-plus.js`) is intentional — changing it to a
  multi-file module system would break the AMD/RequireJS contract with Splunk
- `visualization.js` (compiled bundle) is committed to the repo and must be rebuilt
  after every source change
- Field names are the public API — changing or removing field names may introduce a
  breaking change that requires thorough validation
- The release checklist in CLAUDE.md must be followed for every release
- CartoDB Light is the default tile provider (not OSM)
- Webpack 5 + Babel 7 + TerserPlugin is the current build stack
- IE11 support was dropped in v4.4.0
- Geoman (not leaflet-draw) is the drawing library as of v4.4.0

## What I'm still uncertain about

- Whether the blank-map-on-zero-results bug (backlog P2) is worth the complexity of
  hooking into `reflow()` vs. living with the Splunk platform behavior
- Long-term maintainability of the monolithic 3,300-line source file — no clear
  refactoring plan

## Key Technical Decisions (Ratified)

- AMD module output (Webpack externals for Splunk runtime modules) — cannot change
  without breaking Splunk compatibility
- Field-name-driven behavior: no config file, no REST API — SPL fields and
  formatter.html are the entire control surface. SPL wins over formatter.
- `npm install --ignore-scripts` required due to leaflet-measure fork's node-sass
  failure
- Geoman replaces leaflet-draw (v4.4.0)
- Viewport culling (`removeOutsideVisibleBounds`) enabled on all marker cluster groups
- KML layer control: layer control mounted once at init to prevent duplicate DOM nodes
- `clusterColorMap` must live outside the `isInitializedDom` block (regression fixed
  in v4.6.2)
- GitFlow hotfix branches required for bug fix releases — branch from master, test on
  the hotfix branch, merge to master (tag) then develop

## Critical Patterns (Must Preserve)

- `isInitializedDom` gate: Leaflet map init and one-time setup happens exactly once;
  subsequent `updateView` calls must not re-initialize
- `offset=0` reset in `formatData`'s zero-results path (v4.6.2 fix) — without it,
  auto-refresh panels stop receiving data
- Per-row icon building (no `cachedIcon` pattern) — required for correct per-row
  `markerColor`/`iconColor` (v4.6.3 fix)
- `validFields` array is a module-level property, not rebuilt per call
- Stale marker cleanup runs on every `updateView` cycle before re-rendering

## What the agent must never do

- Change field names or remove formatter options without explicit operator sign-off
  (breaking change to users' dashboards)
- Commit `visualization.js` without a corresponding source change in `src/maps-plus.js`
- Skip the release checklist steps — especially version bump, changelog, and
  Splunkbase release notes
- Add backend server components, REST endpoints, or any other Splunk configs that
  violate Splunk AppInspect cloud vetting policies
- Use `eval()` on user-supplied SPL field data (security: replaced in v4.1.1)
- Introduce multi-file module splitting that breaks the AMD single-bundle output
- Execute the release checklist (merge, tag, package, close issues, release notes)
  without explicit operator confirmation that the fix has been tested

## Resources

- CLAUDE.md — build commands, architecture overview, release checklist
- CHANGELOG.md — full version history
- docs/backlog.md — triaged open issues and feature gaps
- src/maps-plus.js — single source of truth for all behavior
- Splunkbase listing: https://splunkbase.splunk.com/app/3124
- Leaflet docs: https://leafletjs.com/reference.html
- Geoman docs: https://www.leaflet-geoman.io/
- FontAwesome 7 free icons: https://fontawesome.com/icons
- Splunk AppInspect: https://appinspect.splunk.com/
