# Maps+ for Splunk — Release Notes v4.6.9

## Preserve Viewport on Refresh

Addresses [GitHub #63](https://github.com/sghaskell/maps-plus/issues/63).

Dashboards with auto-refresh could reset the map to its default zoom and re-fit all markers every time new data loaded, even after a user had panned or zoomed into a specific area. A new **Preserve Viewport on Refresh** option in Map Settings keeps the map at its current zoom and position after the first load.

When enabled:

- The map fits to all markers on initial load (same as today with Auto Fit & Zoom enabled).
- Subsequent refreshes update markers in place without moving the viewport.
- Right-click **Auto Fit & Zoom** still re-centers the map on demand.

When disabled (default):

- Existing behavior is unchanged — the map continues to auto-fit on every search completion.

## Upgrade Notes

- Drop-in upgrade — no dashboard changes required unless you want the new behavior.
- To enable for a dashboard panel, open the visualization format menu → **Map Settings** → set **Preserve Viewport on Refresh** to **Enabled**.
- Or add to the panel XML: `<option name="leaflet_maps_app.maps-plus.preserveViewportOnRefresh">1</option>`
