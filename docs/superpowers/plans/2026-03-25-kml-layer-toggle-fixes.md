# KML Layer Toggle — Bug Fixes & Dashboard Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the layer control widget not appearing on first dashboard load, and add a default-tile regression panel to the KML test dashboard.

**Architecture:** Two surgical edits to the existing monolithic source file. The control mount call is moved inside the one-time initialization block so it fires exactly once. A sixth panel is appended to the dashboard XML.

**Tech Stack:** Leaflet 1.x, Splunk visualization plugin (AMD/RequireJS), Webpack 5, deployed to a local Splunk Docker container.

---

## File Map

| File | Change |
|---|---|
| `appserver/static/visualizations/maps-plus/src/maps-plus.js` | Move `addTo` call inside `!isInitializedDom`; remove duplicate block at lines 3245–3250 |
| `default/data/ui/views/kml_overlay.xml` | Add Panel 6 (default tile regression) |
| `appserver/static/visualizations/maps-plus/visualization.js` | Rebuilt artifact (output of `npm run build`) |

---

## Context You Need

**How `updateView` works:** Splunk calls `updateView(data, config)` on every search result and every formatter change. On the very first call, `this.isInitializedDom` is `false` — the large `if (!this.isInitializedDom)` block runs to create the map, set up layers, and (critically) create `this.control`. At the end of that block, `this.isInitializedDom` is set to `true`. All subsequent calls skip that block.

**The bug:** `this.control.addTo(this.map)` currently lives at line 3246, outside `!isInitializedDom`. This means it runs on every call. Leaflet's `addTo` doesn't detect an already-mounted control — it appends a new duplicate DOM node each time. On first load, Splunk often fires two rapid `updateView` calls (defaults then real config), producing two DOM nodes. The second node appears empty or invisible.

**The fix:** `this.control` is created at line 2561 (inside `!isInitializedDom`). Move `addTo` to right after that line, gated on `layerControl` being enabled. The control then mounts once. Subsequent `addOverlay` calls (from the kmlOverlay block) work fine because Leaflet calls `_update()` automatically on a mounted control.

**No automated tests exist.** Verification is manual: build, deploy to the local Splunk Docker container, and check the dashboard. The deploy command handles both build and copy.

**Build directory:** `appserver/static/visualizations/maps-plus/`
**Deploy command:** `npm run deploy` (builds + copies to Docker container)
**Dashboard URL:** `http://localhost:8000/en-US/app/leaflet_maps_app/kml_overlay`

---

## Task 1: Move `addTo` inside `!isInitializedDom`

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js:2561–2562` (insertion point)
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js:3245–3250` (removal target)

- [ ] **Step 1: Locate the control creation line**

Open `src/maps-plus.js` and find line 2561:
```javascript
var control = this.control = L.control.layers({}, {}, { collapsed: this.isArgTrue(layerControlCollapsed) })
```
This line is inside the `if (!this.isInitializedDom)` block. The block closes at line 2693.

- [ ] **Step 2: Insert `addTo` immediately after control creation**

After line 2561, add:
```javascript
        if (this.isArgTrue(layerControl)) {
            this.control.addTo(this.map)
            if(this.isDarkTheme) { this._darkModeUpdate() }
        }
```

Note: `layerControlCollapsed` is already handled in the `L.control.layers(...)` constructor call on the same line — no need to set `options.collapsed` again here.

- [ ] **Step 3: Remove the duplicate block at lines 3245–3250**

Find and delete this block (it is outside `!isInitializedDom`, after the marker loop):
```javascript
    // Enable layer controls and toggle collapse
    if (this.isArgTrue(layerControl)) {
        this.control.options.collapsed = this.isArgTrue(layerControlCollapsed)
        this.control.addTo(this.map)
        if(this.isDarkTheme) { this._darkModeUpdate() }
    }
```

After deletion, the next line should be the `// Clustered` comment block.

- [ ] **Step 4: Build and deploy**

```bash
cd appserver/static/visualizations/maps-plus
npm run deploy
```

Expected: build succeeds (no Webpack errors), files copied to container. The build produces `visualization.js` (~2.8MB).

- [ ] **Step 5: Verify the fix**

Open `http://localhost:8000/en-US/app/leaflet_maps_app/kml_overlay` in a browser.

Check each of these without touching the formatter panel:
- Layer control widget is visible immediately on load
- Panel 1: layer control shows entry labeled **sample**, three US region polygons visible
- Panel 1: toggle the entry — polygons hide; toggle again — polygons reappear
- Panel 1: click a polygon — popup appears showing the region name

Then wait for the search to auto-refresh (or manually trigger refresh via the time picker). Verify:
- Layer control entries do NOT disappear or blink on refresh
- No duplicate control widgets appear

If the layer control still doesn't appear, open browser DevTools (F12) → Console and look for JavaScript errors. The most likely culprit is a reference to `this.map` being undefined — which would mean `addTo` is running before `this.map` is created. Check that your insertion at Step 2 is after the `this.map = L.map(...)` call (which is around line 2250, well before line 2561).

- [ ] **Step 6: Commit source change**

```bash
cd appserver/static/visualizations/maps-plus
# From repo root:
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git commit -m "fix: mount layer control once at init — prevent duplicate DOM nodes on refresh (#41)"
```

---

## Task 2: Add Panel 6 to the Test Dashboard

**Files:**
- Modify: `default/data/ui/views/kml_overlay.xml` (append before closing `</form>`)

- [ ] **Step 1: Add Panel 6 to `kml_overlay.xml`**

Open `default/data/ui/views/kml_overlay.xml`. Find the closing `</form>` tag at the very end of the file. Insert the following new row immediately before it:

```xml
  <row>
    <panel>
      <title>Panel 6 — Default tile (no mapTile option)</title>
      <viz type="leaflet_maps_app.maps-plus">
        <search>
          <query>| makeresults count=1 | eval latitude=39.5, longitude=-98.35</query>
          <earliest>0</earliest>
          <latest>now</latest>
        </search>
        <option name="leaflet_maps_app.maps-plus.mapZoom">4</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLat">39.5</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLon">-98.35</option>
        <option name="leaflet_maps_app.maps-plus.defaultHeight">400</option>
        <option name="leaflet_maps_app.maps-plus.layerControl">false</option>
      </viz>
    </panel>
    <panel>
      <html>
        <h3>Panel 6: Default tile (no mapTile set)</h3>
        <p>No <code>mapTile</code> option is configured on this panel.</p>
        <p><b>What to verify:</b></p>
        <ul>
          <li>Map loads using <b>CartoDB Light</b> tiles (light grey basemap).</li>
          <li>No OpenStreetMap tile requests appear in the browser Network tab.</li>
          <li>Regression test for issue #47 — default tile must not be OpenStreetMap.</li>
        </ul>
      </html>
    </panel>
  </row>

```

- [ ] **Step 2: Deploy the updated dashboard**

The dashboard XML is deployed as part of the full app tree. Run:
```bash
cd appserver/static/visualizations/maps-plus
npm run deploy
```

Expected: deploy completes. No build is needed since only XML changed, but `npm run deploy` handles the full copy regardless.

- [ ] **Step 3: Verify Panel 6**

Reload `http://localhost:8000/en-US/app/leaflet_maps_app/kml_overlay`.

For Panel 6:
- Map loads with light grey CartoDB tiles (NOT the coloured OSM style)
- Open browser DevTools → Network tab → filter by `tile` — confirm tile requests go to `*.basemaps.cartocdn.com`, not `*.tile.openstreetmap.org`
- No layer control widget appears (since `layerControl: false`)

- [ ] **Step 4: Commit dashboard change**

```bash
git add default/data/ui/views/kml_overlay.xml
git commit -m "feat: add Panel 6 default tile regression to kml_overlay dashboard (#47)"
```

---

## Task 3: Full Verification Pass and Build Artifact

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/visualization.js` (rebuilt artifact, committed)

- [ ] **Step 1: Run through all 6 panels**

With the current deploy active, verify each panel against its checklist:

| Panel | Pass criteria |
|---|---|
| 1 — Local KML | 3 polygons, layer control entry labeled **sample**, toggle works, popup shows name |
| 2 — Network KML | NASA features visible near Ames, entry labeled **KML_Samples**, toggle works, no console errors |
| 3 — Local KMZ | 3 polygons (same as Panel 1), entry labeled **sample**, toggle works, no console errors |
| 4 — Mixed sources | 3 independent entries in layer control, each toggles independently, labels: **sample**, **KML_Samples**, **sample** (or **sample** twice with KML_Samples in between) |
| 5 — Backwards compat | NASA features visible, no layer control widget |
| 6 — Default tile | CartoDB Light tiles, no OSM requests |

Also verify Panel 4 specifically: toggling one entry must not affect the other two. If all three share a label (both KML files are named "sample"), check that the code uses the filename stem for labels — `sample.kml` → `sample`, `KML_Samples.kml` → `KML_Samples`, `sample.kmz` → `sample`. Two entries labeled "sample" is expected and correct.

- [ ] **Step 2: Commit built artifact**

The `visualization.js` bundle must be committed alongside source changes. Use `build_release.sh` from the repo root (it builds, stages the artifact, and commits):

```bash
# From repo root (not the npm subdirectory):
./scripts/build_release.sh
```

If `build_release.sh` is not available or fails, manually commit the artifact:
```bash
cd appserver/static/visualizations/maps-plus
npm run build
cd ../../../..
git add appserver/static/visualizations/maps-plus/visualization.js
git add appserver/static/visualizations/maps-plus/visualization.js.LICENSE.txt
git commit -m "build: rebuild visualization.js artifact for KML layer control fix"
```

- [ ] **Step 3: Update backlog**

Open `docs/backlog.md`. Find the "Layer visibility UI" entry under P2 and update it:

```markdown
### Layer visibility UI ✅ CLOSED
**Type:** Feature gap (no issue)
Exposed `L.control.layers` so users can toggle individual layer groups on/off from the map UI. KML/KMZ overlays are registered as named, toggleable entries. Closes **#41** as resolved-by.
```

- [ ] **Step 4: Commit backlog update**

```bash
git add docs/backlog.md
git commit -m "docs: close Layer visibility UI / #41 in backlog"
```
