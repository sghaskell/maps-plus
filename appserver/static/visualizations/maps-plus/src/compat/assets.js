// Builds root-relative URLs for contrib assets. Works in classic dashboards
// (honours root_endpoint + locale) and in the Dashboard Studio sandboxed
// iframe (location.origin === "null"), where root-relative URLs resolve
// against the parent page.
var LEGACY = '/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib'

function contribBase(win) {
    var C = win && win.$C
    if (!C) return LEGACY
    var root = String(C.MRSPARKLE_ROOT_PATH || '').replace(/\/+$/, '')
    var locale = C.LOCALE || 'en-US'
    return root + '/' + locale + '/static/app/leaflet_maps_app/visualizations/maps-plus/contrib'
}

function assetUrl(base, sub, file) {
    file = String(file)
    if (/^https?:\/\//.test(file) || file.charAt(0) === '/') return file
    return base + '/' + sub + '/' + file
}

module.exports = { contribBase: contribBase, assetUrl: assetUrl, LEGACY: LEGACY }
