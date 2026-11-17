# Maps+ probe harness

Test dashboards for reproducing and verifying Maps+ (`leaflet_maps_app.maps-plus`) defects.
Each probe exists twice: a Dashboard Studio definition in `studio/` and a Simple XML view in
`classic/`. Panels share the same SPL and options in both formats. Every search uses
`makeresults`, so no index or data is needed.

Run `python -I test/validate.py` from the repo root to check that every file parses, every Studio
Maps+ viz has an existing data source, and no `key=` value is present.

## Files

| File | Panels | Notes |
|---|---|---|
| `studio/probe.json`, `classic/probe.xml` | A, A2, B, C, C2, D, M13 | markers, nulls, row-0 check |
| `studio/probe2.json`, `classic/probe2.xml` | E, F (+ readout), G (+ readout) | customIcon, drilldown token, click token |
| `studio/probe3.json`, `classic/probe3.xml` | H, H2 | heat layers, feature, markers; refresh test |
| `studio/probe4.json`, `classic/probe4.xml` | P1, P2, P3, P4 | paths, playback, ant paths, hidden markers |
| `studio/probe5.json`, `classic/probe5.xml` | T1 to T6 | basemaps |
| `studio/probe6.json`, `classic/probe6.xml` | V1, V2 | issue #67 layerVisibility; dark theme (classic only sets theme) |
| `validate.py` | n/a | structural checks (stdlib only) |

## Defect IDs

| ID | Summary |
|---|---|
| MP-01 | Icon glyphs show as boxes in Studio (font blocked) |
| MP-02 | Null cells treated as set: `null.split` crash, red instead of blue, hidden layers, layer named `null` |
| MP-03 | Hidden heat layer crashes on `_animating` |
| MP-04 | Heat, feature and path layers listed twice in the layer control and pile up on refresh |
| MP-05 | `customIcon` broken in Studio |
| MP-06 | Playback stalls (1969 clock) |
| MP-07 | `clickLatLngToken` does not set the token in Studio |
| MP-08 | CARTO watermark on the default basemap |
| MP-09 | `&` in `mapTile` is HTML-escaped |
| MP-10 | `antPathPaused="false"` treated as true |
| MP-13 | Field check uses row 0 only |
| MP-14 | Layer control checkboxes reset (`layerVisibility` ignored) |
| MP-15 | Dark-mode error in Studio |

## Panel matrix

"TODAY" is 4.6.9. "AFTER" is the expected result once the fix lands. Where a result is
unverified, the cell says so.

| probe file | panel ID | defect ID(s) | what to do | expected result TODAY (4.6.9) | expected result AFTER fix |
|---|---|---|---|---|---|
| probe | A | MP-01 | Look at the four markers (png, svg, circle, icon `train`). Open the layer control. | Studio: the `train` icon shows as an empty box. Row 2 is blue-hex, others red. | Icon renders in Studio. Colors unchanged. |
| probe | A2 | MP-01 | Look at the three svg markers with `fab/github`, `ion/md-train`, `glyphicon/star`. | Studio: glyphs are empty boxes. | Glyphs render. |
| probe | B | MP-02 | One marker plus one feature polygon from an `append`. | Unverified. Expect the polygon and marker to draw. | Same. |
| probe | C | MP-02 | Row 2 has `markerColor` null. | Row 2 is red, or the panel errors with `null.split`. | Row 2 is default blue. |
| probe | C2 | MP-02 | Nulls in markerType, clusterGroup, markerVisibility, layerVisibility, layerGroup. | A layer named `null` appears; some markers hidden or the panel errors. | Defaults apply. No layer named `null`. Nothing hidden. |
| probe | D | MP-02 | Two polygons, no latitude or longitude columns. | Unverified. | Both polygons draw. |
| probe | M13 | MP-13 | Row 1 has no coordinates (`tooltip=header`), rows 2 and 3 have them. | Unverified. Expect the row-0 field check to drop or break the markers. | Panel renders with 2 markers. |
| probe2 | E | MP-05 | Two rows with `customIcon=marker-icon.png`. | Studio: broken images. Classic: images load. | Studio images load. |
| probe2 | F | MP-07 (control) | Click the marker `Click: area1` then `area2`. Read `Picked:` below. | Works per the skill reference: `Picked:` changes to `area1` or `area2`. Starts at `none`. | Same. |
| probe2 | G | MP-07 | Click a marker, then click empty map. Read `Clicked:` (Studio) and `Clicked:` / `Lat` / `Lng` (classic). | Studio: a marker click sets `Clicked:` to that marker's `lat,lng` row value (drilldown, not the map click). Map click does nothing. Classic: a map click sets `$clickedLatLng$`, `$clickedLat$`, `$clickedLng$`. | Studio: map click sets the token (if the fix supports it). Classic unchanged. |
| probe3 | H | MP-03, MP-04 | Load, then refresh the panel 3 times. Count layer-control entries for `heatA`, `heatB`, `Zone polygon`. Check the browser console for `_animating`. | Each heat and feature layer is listed 2 or more times and copies pile up. `heatB` is hidden at load. Console may show `_animating`. | One entry per layer after each refresh. No `_animating` error. |
| probe3 | H2 | MP-03, MP-04 | Same as H, both heat layers hidden at load. | `_animating` error on load (hidden heat layer). Duplicate entries as in H. | No error. One entry per layer. |
| probe4 | P1 | MP-04 | Three paths. Refresh 3 times, count path entries in the layer control. | Path layers duplicated on refresh. | One entry per path. |
| probe4 | P2 | MP-06 | Classic: play the playback control, read the clock. Studio: expect the panel to break (`showPlayback` is classic only, by design). | Classic: playback stalls and the clock reads 1969. Studio: panel breaks. | Classic: clock shows the path dates and playback advances. Studio: unchanged (still unsupported). |
| probe4 | P3 | MP-10 | Look at the three paths. Ant-path pulses animate or not. | Ant paths do not animate (`"false"` is treated as paused). | Ant paths animate. |
| probe4 | P4 | (control) | Five markers, `markerVisibility` false on the last two. Toggle them in the layer control. | Two markers hidden until toggled in the layer control. | Same. |
| probe5 | T1 | MP-08 (control) | OpenStreetMap `mapTile`. | Tiles load. | Same. |
| probe5 | T2 | MP-08 (control) | `useOpenFreeMap=1`. | OpenFreeMap vector style loads. | Same. |
| probe5 | T3 | MP-08 | Explicit CARTO light_all URL with no key. | "API KEY REQUIRED" watermark appears. | Unverified. An explicit no-key CARTO URL may keep the watermark. Use T6 to judge the default. |
| probe5 | T4 | MP-08 (control) | Esri World Imagery `mapTile`. | Imagery tiles load. | Same. |
| probe5 | T5 | MP-09 | `mapTile` with `?a=1&b=2`. Check the network tab: the request should contain `a=1&b=2`. | Tiles fail. Requests carry `&amp;`. | Tiles load. Requests carry `&`. |
| probe5 | T6 | MP-08 | No basemap options. This is the default. | CARTO light with the watermark. | Default basemap has no watermark. |
| probe6 | V1 | MP-14 | Issue #67 SPL verbatim, layer control expanded. Compare the checkboxes with `layerVisibility`. | Only the `true` group (Alexander Davis) is checked at first, then all checkboxes become enabled and checked. | Only Alexander Davis is checked at load. Others stay unchecked. |
| probe6 | V2 | MP-15 | Probe A with `contextMenu=1`. Save the Studio dashboard with theme Dark. Open the console. | Studio dark theme: an error appears in the console and the panel may not render. Classic: dark theme renders. | No error. Panel renders in dark theme. |

## Studio dashboards

### Create a Studio dashboard from a JSON file
1. In Splunk Web, go to Dashboards, then click Create New Dashboard.
2. Choose Dashboard Studio, then Grid or Absolute.
3. Open Source (the code view in the editor) and replace the contents with the JSON from `studio/*.json`.
4. Save. Open the dashboard and check that the panels render.

### Notes for Studio files
- Theme is not in the JSON. For probe6, set the dashboard theme to Dark before saving (in the dashboard settings in Studio).
- The markdown panels use `splunk.markdown` with `options.markdown`. This is the expected Studio text type, not checked against a live Studio instance. If the panel does not render, check the type name first.
- Drilldown is set with `eventHandlers` (`drilldown.setToken`) and the `row.<field>.value` key. Token defaults are in `defaults.tokens`.
- `showPlayback` (probe4 P2) is classic-only and is expected to break the Studio panel.

## Other notes
- No API key is used anywhere. No panel needs one, since T3 is the no-key default URL. If a keyed CARTO test is wanted, set `mapTileOverride` to `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_KEY}` and replace the placeholder by hand. That panel is not included.
- probe3 (H, H2) adds `heatmapInclude="false"` on non-heat rows and `markerVisibility="false"` on heat rows, as the skill's KNOWN_ISSUES recommends. This is a deviation from a bare heat-layer test; it keeps the phantom-layer effect out of the way of the MP-04 check.
- probe4 P1 to P3 sort by `id` then `_time`, so each path runs oldest first. Times are `now()-n*60`.
- probe2 E uses `marker-icon.png`. The file exists in `appserver/static/visualizations/maps-plus/contrib/images/`. Whether `customIcon` resolves to that path is unverified. The upstream example uses `kovar.png`.
- probe6 V1 uses the SPL from upstream issue #67 (`sghaskell/maps-plus`, "Bug in layerVisibility in 4.6.9"). The issue has no options, so `layerControl=1` and `layerControlCollapsed=0` come from its description ("Control Collapsed setting Disabled").
- probe6 classic sets `theme="dark"` on the whole dashboard, so V1 is also dark. Studio has no theme in the JSON.
- Refresh tests (probe3 H, H2; probe4 P1) use the panel's refresh action, three times, then count the layer-control entries.
