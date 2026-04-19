// Phase 3 Wave 0 PROBE — TEMPORARY load-mechanism shim.
//
// Splunk 10.x official mechanism for "load custom JS on every dashboard in
// this app" is appserver/static/dashboard.js (verified on docs.splunk.com,
// "Customize dashboard styling and behavior", 10.2.2510 page). Splunk Web's
// dashboard view-pipeline auto-includes this file when rendering any
// dashboard hosted in the leaflet_maps_app namespace.
//
// We use that auto-load to inject parent-auth-bridge.js into the top frame
// so the W0 matrix can record which dashboard pages (Classic SimpleXML,
// DS list, DS editor, DS view) actually fire it — and from which app
// namespace.
//
// This file is part of the W0 PROBE. Task T03-01-W2 either keeps it as the
// production load mechanism (winner=M1) or removes it in favour of M2 (nav
// XML) / M3 (per-dashboard <dashboard script="..."> opt-in).
(function () {
  'use strict';
  if (window.__MAPS_PLUS_BRIDGE_LOADER__) { return; }
  window.__MAPS_PLUS_BRIDGE_LOADER__ = true;
  try {
    if (window.console && console.info) {
      console.info('[maps-plus:parent-bridge] dashboard.js loader executing');
    }
    var s = document.createElement('script');
    s.src = '/static/app/leaflet_maps_app/parent-auth-bridge.js';
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    // Defensive only — never throw into Splunk Web's page init path.
    if (window.console && console.warn) {
      console.warn('[maps-plus:parent-bridge] loader injection failed: ' + (e && e.message));
    }
  }
}());
