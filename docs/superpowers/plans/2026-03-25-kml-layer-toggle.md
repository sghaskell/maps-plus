# KML Layer Control Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add each KML/KMZ file loaded via `kmlOverlay` as a named, toggleable entry in the Leaflet layer control, and fix three pre-existing bugs in `fetchKmlAndMap` while touching it.

**Architecture:** Create a `L.featureGroup` per KML file synchronously before launching the async fetch, register it with `L.control.layers` immediately, then pass the group into `fetchKmlAndMap` so the async callback populates it instead of adding directly to the map. Leaflet automatically makes features added to a registered group toggleable.

**Tech Stack:** Leaflet 1.9, `@mapbox/togeojson`, JSZip 3.x, jszip-utils, jQuery AJAX, Underscore.js, Splunk XML dashboards.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `appserver/static/visualizations/maps-plus/src/maps-plus.js` | Modify | Rewrite `fetchKmlAndMap`; update `kmlOverlay` loop in `updateView` |
| `appserver/static/visualizations/maps-plus/contrib/kml/sample.kml` | Create | Bundled 3-polygon US regions KML for local testing |
| `default/data/ui/views/kml_overlay.xml` | Create | 5-panel demo dashboard |
| `appserver/static/visualizations/maps-plus/visualization.js` | Rebuild | Webpack artifact — rebuilt in Task 5 |

---

### Task 1: Rewrite `fetchKmlAndMap`

Combines three changes: signature update (`map` → `fg`), bug fixes (KMZ error handling + null guard), and code deduplication (`style`/`onEachFeature` extracted).

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js:1433-1504`

- [ ] **Step 1: Locate the method**

Open `src/maps-plus.js` and find `fetchKmlAndMap` at approximately line 1433. The current signature is:
```javascript
fetchKmlAndMap: function(url, file, map, paneZIndex) {
```
The method ends around line 1504 with the closing `},`.

- [ ] **Step 2: Replace the entire method body**

Replace from the `fetchKmlAndMap: function(` line through its closing `},` with:

```javascript
fetchKmlAndMap: function(url, file, fg, paneZIndex) {
    var self = this

    // Shared style + feature callbacks — used by both KMZ and KML code paths
    var kmlStyle = function(feature) {
        return {
            stroke: _.has(feature.properties, "stroke") ? feature.properties.stroke : '#FFFFFF',
            color: _.has(feature.properties, "fill") ? feature.properties.fill : _.has(feature.properties, "stroke") ? feature.properties.stroke : "#FFFFFF",
            opacity: _.has(feature.properties, "fill-opacity") ? feature.properties["fill-opacity"] : 0.5,
            weight: _.has(feature.properties, "stroke-width") ? feature.properties["stroke-width"] : 1
        }
    }

    var kmlOnEachFeature = function(feature, layer) {
        // Pane is keyed by feature name. If two KML files share a feature name,
        // they share a pane and the last file to process that name sets the z-index.
        var name = feature.properties && feature.properties.name
        if (!name) { return }
        if (!self.map.getPane(name)) { self.map.createPane(name) }
        self.map.getPane(name).style.zIndex = paneZIndex
        layer.options.pane = name
        layer.defaultOptions.pane = name
        layer.bindPopup(name)
        layer.bindTooltip(name)
    }

    if (/.*\.kmz/.test(file)) {
        JSZipUtils.getBinaryContent(url, function(e, d) {
            if (e) {
                console.error('Maps+: Failed to load KMZ overlay from ' + url, e)
                return
            }
            var z = new JSZip()
            z.loadAsync(d)
            .then(function(zip) {
                var kmlFile = zip.file(/.*\.kml/)[0]
                if (!kmlFile) { throw new Error('Maps+: No .kml file found inside KMZ: ' + url) }
                return kmlFile.async("string")
            })
            .then(function(text) {
                var kmlText = $.parseXML(text)
                var geojson = toGeoJSON.kml(kmlText)
                L.geoJson(geojson.features, {
                    style: kmlStyle,
                    onEachFeature: kmlOnEachFeature
                }).addTo(fg)
            })
            .catch(function(err) {
                console.error('Maps+: Error processing KMZ overlay from ' + url, err)
            })
        })
    } else {
        $.ajax({url: url, dataType: 'xml', context: this})
        .done(function(kml) {
            var geojson = toGeoJSON.kml(kml)
            L.geoJson(geojson.features, {
                style: kmlStyle,
                onEachFeature: kmlOnEachFeature
            }).addTo(fg)
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
            console.error('Maps+: Failed to load KML overlay from ' + url + ' (' + textStatus + ')', errorThrown)
        })
    }
},
```

- [ ] **Step 3: Build to verify no syntax errors**

```bash
cd appserver/static/visualizations/maps-plus
npm run build 2>&1 | tail -5
```

Expected: build completes with no errors. Webpack will warn about bundle size — that is normal.

> **Note:** This build is for syntax verification only. Do **not** commit `visualization.js` here — it will be committed in Task 5 after all source changes are complete.

- [ ] **Step 4: Commit**

```bash
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git commit -m "fix: refactor fetchKmlAndMap — extract shared callbacks, add KMZ error handling"
```

---

### Task 2: Update `kmlOverlay` loop in `updateView`

**Files:**
- Modify: `appserver/static/visualizations/maps-plus/src/maps-plus.js:2607-2623`

- [ ] **Step 1: Locate the loop**

Find the block in `updateView` that begins:
```javascript
if(kmlOverlay) {
    // Create array of kml/kmz files
    var kmlFiles = kmlOverlay.split(/\s*,\s*/)
    // Pane zIndex used to facilitate layering of multiple KML/KMZ files
    var paneZIndex = this.paneZIndex = 400

    // Loop through each file and load it onto the map
    _.each(kmlFiles.reverse(), function(file, i) {
        var url = /^https?:\/\//.test(file) ? file : location.origin + this.contribUri + '/kml/' + file
        this.fetchKmlAndMap(url, file, this.map, this.paneZIndex)
        this.paneZIndex = this.paneZIndex - (i+1)
    }, this)
}
```

- [ ] **Step 2: Replace the `_.each` loop body**

Replace only the `_.each(...)` call (keep the outer `if(kmlOverlay)` block and the `var kmlFiles` / `var paneZIndex` lines above it unchanged):

```javascript
    _.each(kmlFiles.reverse(), function(file, i) {
        var url = /^https?:\/\//.test(file) ? file : location.origin + this.contribUri + '/kml/' + file
        var label = file.split('/').pop().replace(/\.[^.]+$/, '')
        // Always add to map so KML renders even when layerControl is disabled
        var fg = L.featureGroup().addTo(this.map)
        if (this.isArgTrue(layerControl)) {
            this.control.addOverlay(fg, label)
        }
        this.fetchKmlAndMap(url, file, fg, this.paneZIndex)
        // Decrement matches existing behavior: each file gets a unique pane z-index
        this.paneZIndex = this.paneZIndex - (i+1)
    }, this)
```

- [ ] **Step 3: Build to verify**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean build, no errors.

> **Note:** Syntax check only — do not commit `visualization.js` here.

- [ ] **Step 4: Commit**

```bash
git add appserver/static/visualizations/maps-plus/src/maps-plus.js
git commit -m "feat: register KML/KMZ files as toggleable layer control entries (issue #41)"
```

---

### Task 3: Create bundled sample KML

**Files:**
- Create: `appserver/static/visualizations/maps-plus/contrib/kml/sample.kml`

- [ ] **Step 1: Check that the `contrib/kml/` directory exists**

```bash
ls appserver/static/visualizations/maps-plus/contrib/kml/
```

If the directory does not exist, create it:
```bash
mkdir -p appserver/static/visualizations/maps-plus/contrib/kml
```

- [ ] **Step 2: Write the KML file**

Create `appserver/static/visualizations/maps-plus/contrib/kml/sample.kml` with this content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>US Regions Sample</name>
    <description>Three broad US region polygons for Maps+ KML overlay testing.</description>
    <Placemark>
      <name>Northwest</name>
      <description>Pacific Northwest and Northern Rockies region</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -124.7,49.0,0
              -110.0,49.0,0
              -110.0,42.0,0
              -124.7,42.0,0
              -124.7,49.0,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>Northeast</name>
      <description>New England and Mid-Atlantic region</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -80.0,47.0,0
              -67.0,47.0,0
              -67.0,37.0,0
              -80.0,37.0,0
              -80.0,47.0,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>South</name>
      <description>Gulf Coast and Southeast region</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -106.0,37.0,0
              -77.0,37.0,0
              -77.0,25.0,0
              -106.0,25.0,0
              -106.0,37.0,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>
```

- [ ] **Step 3: Commit**

```bash
git add appserver/static/visualizations/maps-plus/contrib/kml/sample.kml
git commit -m "feat: add bundled sample.kml with 3 US region polygons"
```

---

### Task 4: Create `kml_overlay.xml` demo dashboard

**Files:**
- Create: `default/data/ui/views/kml_overlay.xml`

- [ ] **Step 1: Find a stable public KMZ URL and record it**

Locate a stable publicly-accessible KMZ file. Candidate sources:
- NOAA National Weather Service: search `site:weather.gov filetype:kmz` or check https://www.weather.gov/gis/
- US Census Bureau TIGER: check https://www.census.gov/geographies/mapping-files.html
- NASA Earthdata: check https://earthdata.nasa.gov

The URL must be a direct `.kmz` download link accessible without authentication. Confirm it loads in a browser.

**STOP.** Write the URL down before continuing to Step 2. Do not proceed until you have a confirmed working URL. It will be substituted into the dashboard XML in two places.

- [ ] **Step 2: Substitute the KMZ URL into the dashboard template**

In the XML template below, replace **both** occurrences of `KMZ_URL_HERE` with the URL from Step 1 before writing the file. Search for the string `KMZ_URL_HERE` — it appears on two lines (one for Panel 3, one for Panel 4). Replace both before writing.

**Do not write the file until the substitution is done.** Then create `default/data/ui/views/kml_overlay.xml` with this content (with URLs substituted):

```xml
<form>
  <label>KML Overlay</label>
  <description>Demonstrates KML/KMZ overlay layer control toggle (issue #41). Each map panel shows KML or KMZ overlays registered as named, toggleable entries in the layer control.</description>

  <row>
    <panel>
      <title>Panel 1 — Local KML (sample.kml)</title>
      <viz type="leaflet_maps_app.maps-plus">
        <search>
          <query>makeresults count=1 | eval latitude=39.5, longitude=-98.35</query>
          <earliest>-15m</earliest>
          <latest>now</latest>
        </search>
        <option name="leaflet_maps_app.maps-plus.mapTile">cartodb_light</option>
        <option name="leaflet_maps_app.maps-plus.mapZoom">4</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLat">39.5</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLon">-98.35</option>
        <option name="leaflet_maps_app.maps-plus.defaultHeight">400</option>
        <option name="leaflet_maps_app.maps-plus.layerControl">true</option>
        <option name="leaflet_maps_app.maps-plus.kmlOverlay">sample.kml</option>
      </viz>
    </panel>
    <panel>
      <html>
        <h3>Panel 1: Local KML</h3>
        <p><b>Source:</b> <code>contrib/kml/sample.kml</code> — bundled with the app.</p>
        <p><b>What to verify:</b></p>
        <ul>
          <li>Three polygons appear on the map (Northwest, Northeast, South).</li>
          <li>Layer control shows one entry labeled <b>sample</b>.</li>
          <li>Toggling the entry hides/shows all three polygons.</li>
          <li>Clicking a polygon shows a popup with its name.</li>
        </ul>
      </html>
    </panel>
  </row>

  <row>
    <panel>
      <title>Panel 2 — Network KML (USGS Earthquakes — past week)</title>
      <viz type="leaflet_maps_app.maps-plus">
        <search>
          <query>makeresults count=1 | eval latitude=39.5, longitude=-98.35</query>
          <earliest>-15m</earliest>
          <latest>now</latest>
        </search>
        <option name="leaflet_maps_app.maps-plus.mapTile">cartodb_light</option>
        <option name="leaflet_maps_app.maps-plus.mapZoom">4</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLat">39.5</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLon">-98.35</option>
        <option name="leaflet_maps_app.maps-plus.defaultHeight">400</option>
        <option name="leaflet_maps_app.maps-plus.layerControl">true</option>
        <option name="leaflet_maps_app.maps-plus.kmlOverlay">https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.kml</option>
      </viz>
    </panel>
    <panel>
      <html>
        <h3>Panel 2: Network KML</h3>
        <p><b>Source:</b> USGS Earthquake Hazards Program — all earthquakes in the past 7 days.</p>
        <p><b>What to verify:</b></p>
        <ul>
          <li>Earthquake point features appear on the map.</li>
          <li>Layer control shows one entry labeled <b>all_week</b>.</li>
          <li>Toggling the entry hides/shows all features.</li>
          <li>No console errors from the KML fetch.</li>
        </ul>
      </html>
    </panel>
  </row>

  <row>
    <panel>
      <title>Panel 3 — Network KMZ</title>
      <viz type="leaflet_maps_app.maps-plus">
        <search>
          <query>makeresults count=1 | eval latitude=39.5, longitude=-98.35</query>
          <earliest>-15m</earliest>
          <latest>now</latest>
        </search>
        <option name="leaflet_maps_app.maps-plus.mapTile">cartodb_light</option>
        <option name="leaflet_maps_app.maps-plus.mapZoom">4</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLat">39.5</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLon">-98.35</option>
        <option name="leaflet_maps_app.maps-plus.defaultHeight">400</option>
        <option name="leaflet_maps_app.maps-plus.layerControl">true</option>
        <option name="leaflet_maps_app.maps-plus.kmlOverlay">KMZ_URL_HERE</option>
      </viz>
    </panel>
    <panel>
      <html>
        <h3>Panel 3: Network KMZ</h3>
        <p><b>Source:</b> Public KMZ from a stable government or official data provider (URL set at implementation time).</p>
        <p><b>What to verify:</b></p>
        <ul>
          <li>KMZ features appear on the map.</li>
          <li>Layer control shows one entry labeled with the KMZ filename (extension stripped).</li>
          <li>Toggling the entry hides/shows all features.</li>
          <li>No console errors from the KMZ fetch or JSZip extraction.</li>
        </ul>
      </html>
    </panel>
  </row>

  <row>
    <panel>
      <title>Panel 4 — Mixed: local KML + network KML + network KMZ</title>
      <viz type="leaflet_maps_app.maps-plus">
        <search>
          <query>makeresults count=1 | eval latitude=39.5, longitude=-98.35</query>
          <earliest>-15m</earliest>
          <latest>now</latest>
        </search>
        <option name="leaflet_maps_app.maps-plus.mapTile">cartodb_light</option>
        <option name="leaflet_maps_app.maps-plus.mapZoom">4</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLat">39.5</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLon">-98.35</option>
        <option name="leaflet_maps_app.maps-plus.defaultHeight">400</option>
        <option name="leaflet_maps_app.maps-plus.layerControl">true</option>
        <option name="leaflet_maps_app.maps-plus.kmlOverlay">sample.kml, https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.kml, KMZ_URL_HERE</option>
      </viz>
    </panel>
    <panel>
      <html>
        <h3>Panel 4: Mixed Sources</h3>
        <p>Three files loaded simultaneously: one local KML, one network KML, one network KMZ.</p>
        <p><b>What to verify:</b></p>
        <ul>
          <li>All three file types load and render.</li>
          <li>Layer control shows <b>three separate entries</b>, one per file, each independently toggleable.</li>
          <li>Toggling one entry does not affect the other two.</li>
          <li>Entries are labeled by filename (no extension).</li>
        </ul>
      </html>
    </panel>
  </row>

  <row>
    <panel>
      <title>Panel 5 — Scale: USGS Earthquakes past month</title>
      <viz type="leaflet_maps_app.maps-plus">
        <search>
          <query>makeresults count=1 | eval latitude=39.5, longitude=-98.35</query>
          <earliest>-15m</earliest>
          <latest>now</latest>
        </search>
        <option name="leaflet_maps_app.maps-plus.mapTile">cartodb_light</option>
        <option name="leaflet_maps_app.maps-plus.mapZoom">4</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLat">39.5</option>
        <option name="leaflet_maps_app.maps-plus.mapCenterLon">-98.35</option>
        <option name="leaflet_maps_app.maps-plus.defaultHeight">400</option>
        <option name="leaflet_maps_app.maps-plus.layerControl">true</option>
        <option name="leaflet_maps_app.maps-plus.kmlOverlay">https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.kml</option>
      </viz>
    </panel>
    <panel>
      <html>
        <h3>Panel 5: Scale Test</h3>
        <p><b>Source:</b> USGS — all earthquakes in the past 30 days (typically 8,000–12,000 features).</p>
        <p><b>What to verify:</b></p>
        <ul>
          <li>Map remains responsive while the KML loads in the background.</li>
          <li>Layer control entry appears immediately (before features finish loading).</li>
          <li>Features render progressively or in bulk once loaded — no crash.</li>
          <li>Toggle still works after full load.</li>
        </ul>
      </html>
    </panel>
  </row>

</form>
```

- [ ] **Step 3: Verify no placeholder remains**

```bash
grep -c "KMZ_URL_HERE" default/data/ui/views/kml_overlay.xml
```

Expected output: `0`. If it returns anything else, the KMZ URL was not substituted — go back and replace both occurrences before committing.

- [ ] **Step 4: Commit**

```bash
git add default/data/ui/views/kml_overlay.xml
git commit -m "feat: add kml_overlay.xml demo dashboard (5 panels)"
```

---

### Task 5: Build, deploy, and verify

**Files:**
- Rebuild: `appserver/static/visualizations/maps-plus/visualization.js`

- [ ] **Step 1: Build and deploy to Splunk**

The Splunk Docker container must be running before deploying. If it is not running, start it first, then:

```bash
cd appserver/static/visualizations/maps-plus
npm run deploy
```

Expected: Webpack builds without errors; files sync to the Splunk Docker container. If the deploy step fails with a sync/rsync error but the build succeeded, the build artifact (`visualization.js`) is still valid — start the container and re-run `npm run deploy`.

- [ ] **Step 2: Open Splunk and navigate to the demo dashboard**

In a browser, go to the Splunk instance and open **KML Overlay** dashboard (`kml_overlay.xml`). Splunk app ID is `leaflet_maps_app`.

- [ ] **Step 3: Verify Panel 1 (local KML)**

- Three region polygons visible on map.
- Layer control has entry labeled **sample**.
- Toggle off → polygons disappear. Toggle on → polygons reappear.
- Click a polygon → popup shows name.

- [ ] **Step 4: Verify Panel 2 (network KML)**

- Earthquake points render.
- Layer control entry labeled **all_week**.
- Toggle works. No console errors.

- [ ] **Step 5: Verify Panel 3 (network KMZ)**

- KMZ features render.
- Layer control entry labeled with the KMZ filename (no extension).
- Toggle works. No console errors.

- [ ] **Step 6: Verify Panel 4 (mixed)**

- All three sources load.
- Layer control shows **three independent entries**.
- Each can be toggled without affecting the others.

- [ ] **Step 7: Verify Panel 5 (scale)**

- Map remains usable while 8k–12k features load.
- Layer control entry appears immediately.
- Toggle works after load.

- [ ] **Step 8: Verify backwards compatibility — open any existing dashboard that uses `kmlOverlay` without `layerControl`**

If one exists, confirm KML still renders and no layer control entry is added. If none exists, skip.

- [ ] **Step 9: Commit the rebuilt `visualization.js` artifact**

```bash
cd appserver/static/visualizations/maps-plus
git add visualization.js
git commit -m "build: rebuild visualization.js for KML layer control toggle"
```

---

### Task 6: Update `backlog.md`

**Files:**
- Modify: `docs/backlog.md`

- [ ] **Step 1: Mark #41 closed in `docs/backlog.md`**

Find the **Layer visibility UI** entry under P2 and update it to reflect closure:

```markdown
### Layer visibility UI / #41 — KML layer control toggle ✅ CLOSED
**Type:** Feature gap + Bug fixes
Each KML/KMZ file loaded via `kmlOverlay` now registers as a named, toggleable entry in `L.control.layers`. A `L.featureGroup` is created synchronously per file and registered with the layer control before the async fetch begins. Also fixed: KMZ error handling (ignored `e` param, no `.catch()`), null guard for KMZ with no embedded `.kml`, and deduplication of `style`/`onEachFeature` callbacks. Bundled `contrib/kml/sample.kml` added for local testing. Demo dashboard: `kml_overlay.xml`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/backlog.md
git commit -m "docs: close #41 KML layer control toggle in backlog"
```
