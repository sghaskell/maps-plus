'use strict';

// Detects Dashboard Studio runtime.
// Primary signal: window.__SPLUNK_DASHBOARD_STUDIO__ global (set by some DS
// builds via the legacy adapter). Secondary signal: the viz is hosted in a
// sandboxed srcdoc iframe (location.href === 'about:srcdoc'), which is the
// defining runtime characteristic of DS's legacy custom-viz adapter regardless
// of whether the global is set. Tertiary: document is in an iframe (parent !==
// self) with origin 'null' — also DS-specific for legacy viz.
// Defaults to false (Classic behaviour) if anything throws.
function isDashboardStudio(win) {
  try {
    if (!win) return false;
    if (win.__SPLUNK_DASHBOARD_STUDIO__) return true;
    if (win.location && win.location.href === 'about:srcdoc') return true;
    if (win.document && win.document.URL === 'about:srcdoc') return true;
    if (win.parent && win.parent !== win && win.location &&
        win.location.origin === 'null') {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Placeholders the Phase 1 server (_resolve_tile) substitutes server-side.
// Any token in the raw template NOT in this set must be pre-resolved by the
// client before encoding, otherwise the Python server will pass it through
// verbatim to the upstream CDN and the tile fetch will 404.
var SERVER_RESOLVED_TOKENS = ['z', 'x', 'y', 's', 'r'];

// Pre-resolves any non-server token in the raw Leaflet template using the
// layer's runtime options (e.g. gibsLayerId, gibsTime, gibsFormat,
// gibsTileMatrixSet). Mirrors L.Util.template regex but runs only for
// non-server tokens. Prototype-pollution safe: ignores __proto__,
// constructor, prototype keys on the options object.
function normalizeTileTemplate(rawTemplate, layerOptions) {
  if (typeof rawTemplate !== 'string') return rawTemplate;
  var opts = layerOptions || {};
  return rawTemplate.replace(/\{ *([\w_ -]+) *\}/g, function (match, key) {
    var trimmed = key.trim();
    if (SERVER_RESOLVED_TOKENS.indexOf(trimmed) !== -1) {
      return match; // leave for server to resolve
    }
    if (trimmed === '__proto__' || trimmed === 'constructor' || trimmed === 'prototype') {
      return match;
    }
    if (Object.prototype.hasOwnProperty.call(opts, trimmed) &&
        opts[trimmed] !== undefined && opts[trimmed] !== null) {
      return String(opts[trimmed]);
    }
    return match; // unknown token — server will see it and probably 4xx; that's expected
  });
}

// Builds the proxy URL the browser fetches. The restRoot should be the
// app-scoped REST base resolved via Splunk's URL builder (Task 2).
// Returns: `${restRoot}/maps_plus/tile/proxy?url=<enc>&z=<z>&x=<x>&y=<y>[&s=<s>][&r=<r>]`
function buildTileProxyUrl(restRoot, normalizedTemplate, coords, extras) {
  var base = String(restRoot || '').replace(/\/+$/, '');
  var parts = [
    'url=' + encodeURIComponent(normalizedTemplate),
    'z=' + encodeURIComponent(coords.z),
    'x=' + encodeURIComponent(coords.x),
    'y=' + encodeURIComponent(coords.y)
  ];
  var e = extras || {};
  if (e.s !== undefined && e.s !== null && e.s !== '') {
    parts.push('s=' + encodeURIComponent(e.s));
  }
  if (e.r !== undefined && e.r !== null && e.r !== '') {
    parts.push('r=' + encodeURIComponent(e.r));
  }
  return base + '/maps_plus/tile/proxy?' + parts.join('&');
}

module.exports = {
  isDashboardStudio: isDashboardStudio,
  normalizeTileTemplate: normalizeTileTemplate,
  buildTileProxyUrl: buildTileProxyUrl,
  SERVER_RESOLVED_TOKENS: SERVER_RESOLVED_TOKENS
};
