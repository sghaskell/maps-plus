# Build System Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Maps+ build toolchain from Webpack 3 / Babel 6 to Webpack 5 / Babel 7, running cleanly on Node v24, and add a `docker cp` deploy script that replaces the manual Splunk UI upload workflow.

**Architecture:** All changes are confined to the `appserver/static/visualizations/maps-plus/` subdirectory. `package.json` and `webpack.config.js` are replaced in-place; a new `scripts/deploy.sh` is added. The compiled `visualization.js` output format (AMD module) and all runtime dependencies are unchanged.

**Tech Stack:** Node v24.14.0, Webpack 5, Babel 7 (`@babel/core`, `@babel/preset-env`), `babel-loader@9`, `imports-loader@4`, `copy-webpack-plugin@12`, `terser-webpack-plugin` (built into Webpack 5), Docker Desktop

**All commands run from:** `appserver/static/visualizations/maps-plus/` unless otherwise noted.

---

### Task 1: Update package.json

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/package.json`

- [ ] **Step 1: Replace the full contents of `package.json`**

Write the following — it replaces `devDependencies` wholesale and updates `scripts`. Runtime `dependencies` are unchanged.

```json
{
  "name": "leaflet_maps_app",
  "version": "4.4.0",
  "description": "Leaflet maps app with Markercluster plugin functionality.",
  "main": "visualization.js",
  "scripts": {
    "build":  "webpack",
    "deploy": "npm run build && bash scripts/deploy.sh",
    "watch":  "webpack --watch"
  },
  "author": "Splunk",
  "license": "MIT",
  "devDependencies": {
    "@babel/core": "^7.26.0",
    "@babel/preset-env": "^7.26.0",
    "babel-loader": "^9.2.1",
    "copy-webpack-plugin": "^12.0.0",
    "imports-loader": "^4.0.1",
    "webpack": "^5.99.0",
    "webpack-cli": "^6.0.0"
  },
  "dependencies": {
    "jquery": "^4.0.0",
    "underscore": "^1.13.7",
    "leaflet": "^1.9.4",
    "drmonty-leaflet-awesome-markers": "^2.0.2",
    "@mapbox/togeojson": "^0.16.2",
    "jszip": "^3.1.2",
    "jszip-utils": "0.0.2",
    "milsymbol": "^3.0.3",
    "@turf/turf": "7.3.4",
    "@geoman-io/leaflet-geoman-free": "2.11.4",
    "leaflet-measure": "sghaskell/leaflet-measure#master",
    "transform-loader": "^0.2.3",
    "brfs": "^1.4.3",
    "leaflet-contextmenu": "^1.4.0",
    "leaflet-dialog": "^1.0.5",
    "leaflet-google-places-autocomplete": "^0.0.8",
    "simpleheat": "^0.4.0",
    "load-google-maps-api": "^1.0.0",
    "leaflet-bing-layer": "digidem/leaflet-bing-layer#gh-pages",
    "leaflet.markercluster": "^1.5.3",
    "spin.js": "^2.3.2",
    "leaflet-ant-path": "^1.3.0",
    "proj4leaflet": "^1.0.2",
    "moment": "^2.20.1"
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd appserver/static/visualizations/maps-plus
git add package.json
git commit -m "chore: upgrade build toolchain to Webpack 5 / Babel 7 (package.json)"
```

---

### Task 2: Clean Install

**Files:** `appserver/static/visualizations/maps-plus/node_modules/` (deleted and recreated)

- [ ] **Step 1: Delete node_modules**

```bash
cd appserver/static/visualizations/maps-plus
rm -rf node_modules
```

If `node_modules` doesn't exist yet (clean repo), skip this step.

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: resolves and installs without errors. Warnings about peer dependencies are acceptable. Errors are not — if you see errors, stop and investigate before continuing.

- [ ] **Step 3: Verify key packages installed**

```bash
./node_modules/.bin/webpack --version
node -e "console.log(require('@babel/core/package.json').version)"
```

Expected output (versions may differ within the `^` range):
```
webpack: 5.x.x
webpack-cli: 6.x.x
7.x.x
```

Note: `@babel/core` installs no CLI binary — use the `node -e require(...)` form to check its version.

---

### Task 3: Rewrite webpack.config.js

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/webpack.config.js`

This is a complete replacement. Key changes from the old config:
- `libraryTarget: 'amd'` → `library: { type: 'amd' }`
- All `imports-loader?...` query strings → object config (three patterns — see spec)
- `UglifyJsPlugin` → built-in `TerserPlugin` via `optimization.minimizer`
- `CopyPlugin` replaces shell `cp` for Geoman CSS
- Babel preset `'env'` → `'@babel/preset-env'`
- `var webpack = require('webpack')` removed (not needed)
- `var UglifyJsPlugin = require(...)` removed

- [ ] **Step 1: Replace the full contents of `webpack.config.js`**

```js
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: './src/maps-plus.js',

    target: 'web',

    resolve: {
        modules: [
            path.join(__dirname, 'src'),
            path.join(__dirname, 'contrib/js'),
            'node_modules'
        ],
        extensions: ['.js', '.json']
    },

    output: {
        filename: 'visualization.js',
        path: path.resolve(__dirname, '.'),
        library: { type: 'amd' }
    },

    module: {
        rules: [
            // Babel transpiles ES6+ to ES5 FIRST (before other loaders)
            {
                test: /\.js$/,
                exclude: /node_modules\/(?!(leaflet-ant-path|proj4leaflet|@geoman-io\/leaflet-geoman-free)\/).*/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: {
                                    browsers: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions', 'last 2 Edge versions']
                                },
                                modules: false
                            }]
                        ]
                    }
                }
            },
            // Pattern A: aliased default imports (var L = require('leaflet'))
            {
                test: /leaflet\.spin\.js$/,
                loader: 'imports-loader',
                options: { imports: 'default leaflet L' }
            },
            {
                test: /HeatLayer\.js$/,
                use: [
                    {
                        loader: 'imports-loader',
                        options: { imports: 'default leaflet L' }
                    },
                    {
                        loader: 'imports-loader',
                        options: { imports: 'default simpleheat simpleheat' }
                    }
                ]
            },
            {
                test: /leaflet\.awesome-markers\.js$/,
                loader: 'imports-loader',
                options: { imports: 'default leaflet L' }
            },
            {
                test: /leaflet-vector-markers\.js$/,
                loader: 'imports-loader',
                options: { imports: 'default leaflet L' }
            },
            // Pattern B: disable AMD define
            {
                test: /leaflet\.featuregroup\.subgroup-src\.js$/,
                loader: 'imports-loader',
                options: { additionalCode: 'var define = false;' }
            },
            // Pattern A continued
            {
                test: /Modal\.js$/,
                loader: 'imports-loader',
                options: { imports: 'default underscore _' }
            },
            // Pattern C: multiple jQuery aliases
            {
                test: /CLDRPluralRuleParser\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.emitter\.bidi\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.emitter\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.fallbacks\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.language\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.messagestore\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.parser\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            // leaflet-measure: imports-loader + brfs transform (see Task 4 if this fails)
            {
                test: /leaflet-measure\.js$/,
                use: [
                    {
                        loader: 'imports-loader',
                        options: { imports: 'default leaflet L' }
                    },
                    'transform-loader?brfs'
                ]
            },
            {
                test: /LeafletPlayback\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            }
        ]
    },

    externals: [
        'api/SplunkVisualizationBase',
        'api/SplunkVisualizationUtils'
    ],

    plugins: [
        new CopyPlugin({
            patterns: [{
                from: 'node_modules/@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css',
                to: 'contrib/css/leaflet-geoman.css'
            }]
        })
    ],

    optimization: {
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    ecma: 2017,
                    compress: { warnings: false },
                    mangle: true,
                    format: { comments: false }
                },
                parallel: true
            })
        ]
    },

    devtool: false
};
```

- [ ] **Step 2: Commit**

```bash
git add webpack.config.js
git commit -m "chore: upgrade build toolchain to Webpack 5 / Babel 7 (webpack.config.js)"
```

---

### Task 4: First Build — Verify and Fix

**Files:** potentially `node_modules/leaflet-measure/src/leaflet-measure.js` (fallback only)

No tests exist for this project. Verification is: does `npm run build` complete and produce a valid `visualization.js`?

- [ ] **Step 1: Run the build**

```bash
npm run build
```

Expected: build completes, `visualization.js` is updated, no errors in output.

---

**If the build succeeds:** skip to Step 5.

---

**If you see a Node polyfill error** like `Module not found: Error: Can't resolve 'fs'` or `Can't resolve 'buffer'`:

- [ ] **Step 2a (polyfill): Add `fallback` inside the existing `resolve` block in webpack.config.js**

Locate the existing `resolve` block (it already has `modules` and `extensions`). Add a `fallback` property **inside that block** — do NOT create a second `resolve` key, which would silently overwrite `modules` and `extensions`:

```js
resolve: {
    modules: [                        // already exists — keep
        path.join(__dirname, 'src'),
        path.join(__dirname, 'contrib/js'),
        'node_modules'
    ],
    extensions: ['.js', '.json'],     // already exists — keep
    fallback: {                       // ADD this
        fs: false
        // add only the specific module names that appear in the error
    }
},
```

Only add entries for module names that appear in the error output. `false` means "don't polyfill, just omit".

Re-run `npm run build`. If errors persist, check the specific module name in the error and add it to `fallback` with value `false`.

---

**If you see a `transform-loader` error** (e.g., `Cannot find module`, `Cannot read properties of undefined`, or the error references `leaflet-measure.js` / `brfs`):

- [ ] **Step 2b (brfs fallback): Find the `fs.readFileSync` calls in leaflet-measure**

```bash
grep -r "readFileSync" node_modules/leaflet-measure/src/
```

Note which files are found and what they read (typically small HTML template files).

- [ ] **Step 3b: Read each template file's contents**

For each file referenced in `readFileSync`, read it and note the exact string content. Example — if the source has:

```js
var template = fs.readFileSync(__dirname + '/templates/control.html', 'utf8');
```

Read `node_modules/leaflet-measure/src/templates/control.html` and copy the content.

- [ ] **Step 4b: Copy leaflet-measure source to contrib/js/ for safe editing**

`node_modules/` is gitignored — edits there are lost on the next `npm install`. Copy the file to a stable location instead:

```bash
cp node_modules/leaflet-measure/src/leaflet-measure.js contrib/js/leaflet-measure-patched.js
```

Then inline the templates in `contrib/js/leaflet-measure-patched.js`. For each `readFileSync` call, replace it with the file content as a template literal:

```js
// Before
var template = fs.readFileSync(__dirname + '/templates/control.html', 'utf8');

// After (paste exact content of control.html as a template literal)
var template = `<paste exact content of control.html here>`;
```

Remove the `require('fs')` or `var fs = require('fs')` line from the patched file.

- [ ] **Step 5b: Update the webpack rule to use the patched file**

The `test` regex must match the new filename. Replace the `leaflet-measure.js` rule in `webpack.config.js`:

```js
// Before
{
    test: /leaflet-measure\.js$/,
    use: [
        {
            loader: 'imports-loader',
            options: { imports: 'default leaflet L' }
        },
        'transform-loader?brfs'
    ]
},

// After — points to patched file, no brfs needed
{
    test: /leaflet-measure-patched\.js$/,
    loader: 'imports-loader',
    options: { imports: 'default leaflet L' }
},
```

Also update the `require` (or `import`) of `leaflet-measure` in `src/maps-plus.js` to point to the patched path:

```js
// Find the existing require/import of leaflet-measure and change it to:
require('../contrib/js/leaflet-measure-patched');
```

- [ ] **Step 6b: Re-run the build**

```bash
npm run build
```

Expected: build completes without errors.

---

- [ ] **Step 5: Verify the output**

```bash
ls -lh visualization.js
```

Expected: file exists and is between 1MB and 3MB. If it is 0 bytes or missing, the build silently failed — check webpack output for warnings treated as errors.

- [ ] **Step 6: Commit**

```bash
# Always stage these:
git add visualization.js webpack.config.js

# If brfs fallback was used, also stage the patched source and the maps-plus.js require change:
# git add contrib/js/leaflet-measure-patched.js src/maps-plus.js

git commit -m "chore: first successful Webpack 5 build"
```

---

### Task 5: Create and Test the Deploy Script

**Files:**
- Create: `appserver/static/visualizations/maps-plus/scripts/deploy.sh`

- [ ] **Step 1: Create the scripts directory and deploy script**

```bash
mkdir -p scripts
```

Create `scripts/deploy.sh` with this content:

```bash
#!/bin/bash
# Copies Maps+ build output into the running Splunk Docker container.
# Finds the Splunk container by image name — no hardcoded container name.

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

- [ ] **Step 2: Make the script executable**

```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 3: Verify the Splunk container is running**

```bash
docker ps --filter ancestor=splunk/splunk --format "table {{.ID}}\t{{.Status}}\t{{.Names}}"
```

Expected: one row with status `Up ... (healthy)`. If no rows appear, start Docker Desktop and the Splunk container before continuing.

- [ ] **Step 4: Run the deploy script**

```bash
bash scripts/deploy.sh
```

Expected output:
```
Deploying to container <id>...
Done. Hard-refresh your browser (Ctrl+Shift+R) to pick up changes.
```

If `docker cp` fails with `no such file or directory` inside the container, the app may not be installed yet. In that case, do a one-time install via the Splunk UI, then re-run the script.

- [ ] **Step 5: Verify in browser**

1. Open Splunk at `http://localhost:8000`
2. Navigate to any Maps+ dashboard (e.g., **Apps → Maps+ for Splunk → Features**)
3. Hard-refresh: `Ctrl+Shift+R`
4. The map should render. Open the browser DevTools console — no `ERR_` or uncaught exceptions related to `visualization.js`

- [ ] **Step 6: Test the `npm run deploy` shortcut**

Touch the source to force a rebuild, then run the combined command:

```bash
touch src/maps-plus.js
npm run deploy
```

Expected: webpack rebuilds, then deploy script runs, then browser hard-refresh shows updated map.

- [ ] **Step 7: Commit**

```bash
git add scripts/deploy.sh
git commit -m "chore: add docker cp deploy script for Splunk dev workflow"
```

---

### Task 6: Final Verification and Cleanup

- [ ] **Step 1: Run a clean build from scratch**

```bash
rm -rf node_modules
npm install
npm run build
```

Expected: installs and builds cleanly on Node v24 with no legacy-provider workarounds.

- [ ] **Step 2: Check visualization.js is a valid AMD module**

```bash
head -c 200 visualization.js
```

Expected: output begins with `define(` (AMD module wrapper). If it begins with `(function(` without `define`, the AMD output config regressed.

- [ ] **Step 3: Confirm `devbuild` is gone**

```bash
npm run devbuild
```

Expected: `npm error Missing script: "devbuild"` — confirms the old script was removed.

- [ ] **Step 4: Update CLAUDE.md build commands section**

In `CLAUDE.md` (repo root), update the build commands section to reflect the new scripts:

```markdown
## Build Commands

All build commands run from the maps-plus visualization directory:

\`\`\`bash
cd appserver/static/visualizations/maps-plus

# Install dependencies
npm install

# Production build
npm run build

# Build and deploy to running Splunk Docker container
npm run deploy

# Auto-rebuild on save (deploy manually when ready to test)
npm run watch
\`\`\`
```

- [ ] **Step 5: Final commit**

```bash
# From repo root
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md build commands for Webpack 5 toolchain"
```
