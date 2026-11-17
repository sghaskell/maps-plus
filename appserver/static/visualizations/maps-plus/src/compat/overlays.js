// MP-04 / MP-14: helpers that keep overlays in the layer control exactly once and apply the
// layerVisibility option only on first add, so the user's later toggles survive data refreshes.
// Duck-typed (no Leaflet import) so they can be unit tested with fakes.

// Leaflet's Control.Layers does not dedupe addOverlay(). removeLayer() is a no-op when the layer
// is not registered, so remove-then-add yields exactly one entry (and refreshes the label).
function addOverlayOnce(control, layer, name) {
  control.removeLayer(layer)
  control.addOverlay(layer, name)
}

// Hide a group whose layerVisibility option is false, but only the first time it is seen.
// Returns true when the group was removed from the map.
function applyInitialVisibility(fg) {
  var opts = fg.options
  if (!opts || opts._mpVisibilityApplied) { return false }
  opts._mpVisibilityApplied = true
  if (Object.prototype.hasOwnProperty.call(opts, 'layerVisibility') && !opts.layerVisibility) {
    fg.remove()
    return true
  }
  return false
}

// Re-add an overlay group on a completed render (to pick up pane/zIndex changes) without
// undoing visibility: re-add only if it was on the map, or it has never been through
// applyInitialVisibility (first render), or there is no layer control to toggle it.
// Returns true when the group is on the map afterwards.
function readdOverlay(map, fg, hasLayerControl) {
  var wasOnMap = map.hasLayer(fg)
  var firstRender = !(fg.options && fg.options._mpVisibilityApplied)
  if (wasOnMap) { map.removeLayer(fg) }
  if (wasOnMap || firstRender || !hasLayerControl) {
    fg.addTo(map)
    return true
  }
  return false
}

module.exports = { addOverlayOnce: addOverlayOnce, applyInitialVisibility: applyInitialVisibility, readdOverlay: readdOverlay }
