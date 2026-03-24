# Build System Modernization + Docker Deploy Script
**Date:** 2026-03-23
**Status:** Approved
**Workstream:** A of 4

---

## Overview

Modernize the Maps+ for Splunk build toolchain from Webpack 3 / Babel 6 / Node 10 to Webpack 5 / Babel 7 / Node 24 LTS. Add a `docker cp`-based deploy script that copies build output directly into the running Splunk Docker container, replacing the current manual UI upload workflow.

---

## Context

- Current build stack: Webpack 3.12, Babel 6 (`babel-core`, `babel-preset-env@1`), `uglifyjs-webpack-plugin`, `imports-loader@0.8`
- Current Node requirement: v10.24.1 / npm v6 (does not build on Node 17+)
- Target: Node v24.14.0 (already installed globally), Webpack 5, Babel 7
- Output must remain an AMD module (`visualization.js`) — Splunk loads it via RequireJS
- Splunk runs in Docker Desktop: image `splunk/splunk:10.2-rhel9`, container `zealous_brahmagupta`, app volume mounted at `/opt/splunk/etc`
- App path inside container: `/opt/splunk/etc/apps/leaflet_maps_app/appserver/static/visualizations/maps-plus/`
- No bind mounts — container uses named Docker volumes; `docker cp` is the correct deploy mechanism

---

## Changes

### 1. package.json — devDependencies

**Remove:**
| Package | Reason |
|---------|--------|
| `webpack@^3.12.0` | Replaced by v5 |
| `uglifyjs-webpack-plugin` | Built into Webpack 5 as TerserPlugin |
| `babel-core@^6.26.3` | Replaced by `@babel/core` |
| `babel-loader@^7.1.5` | Replaced by v9 |
| `babel-preset-env@^1.7.0` | Replaced by `@babel/preset-env` |
| `imports-loader@^0.8.0` | Replaced by v4 (syntax incompatible) |

**Add:**
| Package | Version | Note |
|---------|---------|------|
| `webpack` | `^5.99.0` | upgrade |
| `webpack-cli` | `^6.0.0` | new — Webpack 5 requires a separate CLI package |
| `@babel/core` | `^7.26.0` | replaces `babel-core` |
| `@babel/preset-env` | `^7.26.0` | replaces `babel-preset-env` |
| `babel-loader` | `^9.2.1` | upgrade |
| `imports-loader` | `^4.0.1` | upgrade (syntax incompatible — see section 4) |
| `copy-webpack-plugin` | `^12.0.0` | new — replaces shell `cp` in build script |

### 2. package.json — scripts

```json
"build":  "webpack",
"deploy": "npm run build && bash scripts/deploy.sh",
"watch":  "webpack --watch"
```

- `build`: Webpack 5 invoked via webpack-cli (no manual `cp` — Geoman CSS handled by CopyWebpackPlugin in webpack config)
- `deploy`: Full build + copy to running Splunk container
- `watch`: Auto-rebuild on save; deploy separately when ready to test
- `devbuild`: **Remove** — superseded by `watch` and the cleaner `build` script

### 3. Install procedure

After updating `package.json`:

1. Delete `node_modules/` entirely (prevents stale Webpack 3 / Babel 6 artifacts)
2. Run `npm install`

### 4. webpack.config.js

**imports-loader syntax migration** — all rules using the old query-string syntax rewritten to object config. There are three distinct patterns:

**Pattern A — aliased default import** (`L=leaflet`, `_=underscore`, bare `simpleheat`)
Use `default` syntax, which generates `var X = require('module')`. Do **not** use `named` — Leaflet and Underscore don't expose named ES exports; `named` would generate `import { L } from 'leaflet'` which breaks at runtime.

```js
// Old: imports-loader?L=leaflet
loader: 'imports-loader',
options: { imports: 'default leaflet L' }

// Old: imports-loader?_=underscore
loader: 'imports-loader',
options: { imports: 'default underscore _' }

// Old: imports-loader?simpleheat  (bare — injects the module itself)
loader: 'imports-loader',
options: { imports: 'default simpleheat simpleheat' }
```

Affected rules: `leaflet.spin.js`, `HeatLayer.js` (both loaders), `leaflet.awesome-markers.js`, `leaflet-vector-markers.js`, `leaflet-measure.js`, `Modal.js`.

**Pattern B — disable AMD define** (`define=>false`)
Use `additionalCode` to inject a variable override:

```js
// Old: imports-loader?define=>false
loader: 'imports-loader',
options: { additionalCode: 'var define = false;' }
```

Affected rules: `leaflet.featuregroup.subgroup-src.js`.

**Pattern C — multiple jQuery aliases** (`$=jquery,jQuery=jquery`)
Multiple aliased default imports in one rule:

```js
// Old: imports-loader?$=jquery,jQuery=jquery
loader: 'imports-loader',
options: {
  imports: [
    { syntax: 'default', moduleName: 'jquery', name: '$' },
    { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
  ]
}
```

Affected rules: `CLDRPluralRuleParser.js`, `jquery.i18n.js` and all its sub-files (6 rules), `LeafletPlayback.js`.

**TerserPlugin** — replace `UglifyJsPlugin` in `plugins[]` with built-in TerserPlugin via `optimization.minimizer`:

```js
const TerserPlugin = require('terser-webpack-plugin');

optimization: {
  minimizer: [
    new TerserPlugin({
      terserOptions: {
        ecma: 2017,
        compress: { warnings: false },
        mangle: true,
        format: { comments: false }  // Terser v5: 'output' renamed to 'format'
      },
      parallel: true
    })
  ]
}
```

**AMD output** — migrate deprecated `libraryTarget` to new syntax:

```js
output: {
  filename: 'visualization.js',
  path: path.resolve(__dirname, '.'),
  library: { type: 'amd' }
}
```

**Babel preset** — update preset reference:

```js
// Old
presets: [['env', { targets: { browsers: [...] }, modules: false }]]

// New
presets: [['@babel/preset-env', { targets: { browsers: [...] }, modules: false }]]
```

**CopyWebpackPlugin** — replace the shell `cp` for Geoman CSS with a webpack plugin step so `npm run build` is self-contained:

```js
const CopyPlugin = require('copy-webpack-plugin');

plugins: [
  new CopyPlugin({
    patterns: [{
      from: 'node_modules/@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css',
      to: 'contrib/css/leaflet-geoman.css'
    }]
  })
]
```

Add `copy-webpack-plugin` to devDependencies.

**leaflet-measure / transform-loader + brfs risk** — `transform-loader` is unmaintained and may fail under Webpack 5. Implementation plan:
1. Try keeping `transform-loader + brfs` as-is first
2. If build fails on that rule: inline the HTML template strings directly into `sghaskell/leaflet-measure` (owner controls the fork), eliminating the `fs.readFileSync` dependency entirely

**Node.js core polyfills** — Webpack 5 removed automatic polyfills for Node built-ins (`Buffer`, `process`, etc.). If any dependency triggers a polyfill error, add targeted `resolve.fallback` entries. Most likely candidate: `brfs` / `jszip`.

### 5. Deploy script — `scripts/deploy.sh`

```bash
#!/bin/bash
# Copies Maps+ build output into the running Splunk Docker container.
# Finds container by image name — no hardcoded container name.

CONTAINER=$(docker ps -q --filter ancestor=splunk/splunk | head -1)

if [ -z "$CONTAINER" ]; then
  echo "Error: No running Splunk container found. Is Docker Desktop running?"
  exit 1
fi

APP_PATH="/opt/splunk/etc/apps/leaflet_maps_app/appserver/static/visualizations/maps-plus"

echo "Deploying to container $CONTAINER..."
docker cp visualization.js "$CONTAINER:$APP_PATH/visualization.js"
docker cp contrib/css/leaflet-geoman.css "$CONTAINER:$APP_PATH/contrib/css/leaflet-geoman.css"

echo "Done. Hard-refresh your browser (Ctrl+Shift+R) to pick up changes."
```

---

## Risk Summary

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `transform-loader + brfs` incompatible with Webpack 5 | Medium | Inline templates into `leaflet-measure` fork |
| Node polyfill errors from `jszip` or other deps | Low | Add targeted `resolve.fallback` entries |
| Container not found by `ancestor=splunk/splunk` filter if image tag changes | Low | Update filter in `deploy.sh` to match new tag |

---

## Out of Scope

- Runtime dependency upgrades (leaflet, jquery, etc.) — separate concern
- NVM setup — not needed; Node v24 is already installed and compatible with the target toolchain
- Dev server / hot reload — `webpack --watch` + manual `bash scripts/deploy.sh` is sufficient
