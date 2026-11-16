'use strict'

// Basemap decision logic (MP-08 / D4).
//
// CARTO raster tiles now need an API key, so the old code default looked broken
// out of the box. OpenFreeMap (keyless) is the automatic basemap when the user
// has not chosen one. Anything the user EXPLICITLY set keeps working as before.
//
// "Explicit" means the option key was present in the config the user/dashboard
// supplied (before defaults are merged in) with a non-empty value.

var NS = 'display.visualizations.custom.leaflet_maps_app.maps-plus.'

var OPENFREEMAP_STYLES_URL = 'https://tiles.openfreemap.org/styles/'

// Options that count as "the user picked a basemap provider" when set.
// Truthiness of the value matters for the flag-style ones (bing, antarctic).
var RASTER_VALUE_KEYS = ['mapTile', 'mapTileOverride']
var RASTER_FLAG_KEYS = ['bingMaps', 'antarcticProj']

function isPresent(v) {
    return v !== undefined && v !== null && String(v).trim() !== ''
}

function isTrue(v) {
    if (!isPresent(v)) return false
    var s = String(v).trim().toLowerCase()
    if (s === 'true') return true
    var n = parseInt(s, 10)
    return !isNaN(n) && n !== 0
}

// Short names (without namespace) of options explicitly present in `config`.
// Accepts one or more config objects; a key present in any of them counts.
function explicitKeys() {
    var out = {}
    for (var i = 0; i < arguments.length; i++) {
        var cfg = arguments[i]
        if (!cfg || typeof cfg !== 'object') continue
        Object.keys(cfg).forEach(function (k) {
            if (k.indexOf(NS) === 0 && isPresent(cfg[k])) out[k.slice(NS.length)] = true
        })
    }
    return out
}

// opts: {
//   explicit: { <shortName>: true }   -- from explicitKeys()
//   values:   { <shortName>: value }  -- effective values (user value if explicit)
//   isDark:   boolean
// }
// returns { useOpenFreeMap: boolean, auto: boolean, stylePreset: string }
function resolveBasemap(opts) {
    var explicit = opts.explicit || {}
    var values = opts.values || {}
    var preset = explicit.maplibreStylePreset && isPresent(values.maplibreStylePreset)
        ? String(values.maplibreStylePreset)
        : null

    if (explicit.useOpenFreeMap) {
        var on = isTrue(values.useOpenFreeMap)
        return { useOpenFreeMap: on, auto: false, stylePreset: preset || 'liberty' }
    }

    var rasterChosen = RASTER_VALUE_KEYS.some(function (k) { return explicit[k] }) ||
        RASTER_FLAG_KEYS.some(function (k) { return explicit[k] && isTrue(values[k]) })

    if (rasterChosen) {
        return { useOpenFreeMap: false, auto: false, stylePreset: preset || 'liberty' }
    }

    // Nothing chosen: keyless OpenFreeMap. An explicit preset (or style URL override,
    // which the caller applies on top) wins; otherwise follow the theme.
    return { useOpenFreeMap: true, auto: true, stylePreset: preset || (opts.isDark ? 'dark' : 'positron') }
}

function styleUrl(stylePreset, styleOverride) {
    if (styleOverride) return styleOverride
    return OPENFREEMAP_STYLES_URL + (stylePreset || 'liberty')
}

// updateView merges defaultConfig into the caller's config object in place (other code, e.g.
// the click handler via getCurrentConfig(), relies on that). Maps+ records the keys it injected;
// this returns a copy of `cfg` without keys that still hold their injected default value, i.e.
// the options the user actually set.
function withoutInjected(cfg, injected) {
    var out = {}
    if (!cfg || typeof cfg !== 'object') return out
    injected = injected || {}
    Object.keys(cfg).forEach(function (k) {
        if (!(Object.prototype.hasOwnProperty.call(injected, k) && injected[k] === cfg[k])) out[k] = cfg[k]
    })
    return out
}

// Merge defaults into `cfg` IN PLACE and return the keys/values that were injected.
function mergeDefaultsRecording(cfg, defaults) {
    var injected = {}
    Object.keys(defaults || {}).forEach(function (k) {
        if (cfg[k] === undefined) { cfg[k] = defaults[k]; injected[k] = defaults[k] }
    })
    return injected
}

module.exports = {
    NS: NS,
    withoutInjected: withoutInjected,
    mergeDefaultsRecording: mergeDefaultsRecording,
    explicitKeys: explicitKeys,
    resolveBasemap: resolveBasemap,
    styleUrl: styleUrl,
    isTrue: isTrue
}
