// Phase 3 Wave 0 PROBE STUB — TEMPORARY.
//
// Purpose: prove the file is reachable and that the chosen Splunk Web load
// mechanism actually executes app-scoped static JS on Dashboard Studio
// dashboard view pages. NO message listener, NO fetch, NO state machine —
// any behaviour beyond logging would invalidate the probe.
//
// Replaced by the production shim in Task T03-01-W1.
(function () {
  'use strict';
  if (window.__MAPS_PLUS_PARENT_BRIDGE__) { return; }
  window.__MAPS_PLUS_PARENT_BRIDGE__ = 'probe';
  // UAT-grep anchor: the literal substring "[maps-plus:parent-bridge] loaded"
  // is the exact match Plan 03-01 W0 verifies on each candidate page.
  console.info('[maps-plus:parent-bridge] loaded');
}());
