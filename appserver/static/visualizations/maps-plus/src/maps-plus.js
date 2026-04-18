define([
            'jquery',
            'underscore',
            'leaflet',
            '@mapbox/togeojson',
            '@turf/turf',
            'jszip',
            'jszip-utils',
            'milsymbol',
            'api/SplunkVisualizationBase',
            'api/SplunkVisualizationUtils',
            'load-google-maps-api',
            'moment',
            '../contrib/js/Modal',
            '../contrib/js/theme-utils',
            './ds-tile-proxy-helpers',
            'spin.js',
            'leaflet-bing-layer',
			'leaflet-contextmenu',
			'leaflet-dialog',
            'leaflet-google-places-autocomplete',
            'leaflet.markercluster',
            'leaflet-ant-path',
            'simpleheat',
            'proj4leaflet',
            '../contrib/js/HeatLayer',
            '../contrib/js/leaflet.spin',
            '../contrib/js/leaflet.featuregroup.subgroup-src',
            '../contrib/js/leaflet-measure',
			'../contrib/js/leaflet.awesome-markers',
            '../contrib/js/leaflet-vector-markers',
            '../contrib/js/LeafletPlayback',
            '../contrib/js/CLDRPluralRuleParser',
            '../contrib/js/jquery.i18n',
            '../contrib/js/jquery.i18n.messagestore',
            '../contrib/js/jquery.i18n.fallbacks',
            '../contrib/js/jquery.i18n.language',
            '../contrib/js/jquery.i18n.parser',
            '../contrib/js/jquery.i18n.emitter',
            '../contrib/js/jquery.i18n.emitter.bidi',
            '@geoman-io/leaflet-geoman-free',
            'maplibre-gl',
            '@maplibre/maplibre-gl-leaflet'

        ],
        function(
            $,
            _,
            L,
            toGeoJSON,
            turf,
            JSZip,
            JSZipUtils,
            ms,
            SplunkVisualizationBase,
            SplunkVisualizationUtils,
            loadGoogleMapsAPI,
            moment,
            Modal,
            themeUtils,
            DsTileProxyHelpers
        ) {

// Phase 2: resolve Splunk REST root for the DS tile proxy.
//
// In Dashboard Studio, the viz runs in a sandboxed iframe with origin 'null'
// (srcdoc). Relative URLs resolve against that null origin and fail. We must
// emit an absolute URL whose origin is the Splunk Web host.
//
// Resolution strategy (fail-safe — never throws during module top-level eval):
//   1. Detect the origin from this module's own <script src> — the bundle was
//      loaded from http(s)://<splunkweb-host>/static/@.../visualization.js, so
//      we can recover the host from document.currentScript.src or by scanning
//      loaded <script> tags for one whose src includes this bundle's path.
//   2. Build the REST URL as `<origin>/en-US/splunkd/__raw/services`. The
//      `/en-US/splunkd/__raw/` prefix is Splunk Web's proxy path for
//      authenticated REST calls from browsers. Phase 1 UAT confirmed this
//      shape works (01-UAT.md:33,108).
//   3. If origin detection fails (unexpected), fall back to relative
//      '/services' — which at least works in Classic contexts; DS will
//      error visibly (T2-03: blank tiles + stable-prefix console.warn).
//
// NOTE: we do NOT call `window.require('splunkjs/mvc/utils')` here.
// Synchronous `require(name)` throws in RequireJS if the module is not
// pre-cached, and DS does not pre-cache splunkjs/mvc modules. That throw
// propagated through RequireJS's own error path and was not caught by our
// try/catch, poisoning viz initialize().
function _detectSplunkOrigin() {
    try {
        // Preferred: the script tag that loaded this bundle (currentScript is
        // set during script parse; usable inside our define() factory because
        // Webpack defers our code into that script's execution).
        if (typeof document !== 'undefined') {
            var cs = document.currentScript;
            if (cs && cs.src) {
                var u = new URL(cs.src);
                if (u.origin && u.origin !== 'null') { return u.origin; }
            }
            // Fallback: find any <script> whose src path contains our bundle.
            var scripts = document.getElementsByTagName('script');
            for (var i = 0; i < scripts.length; i++) {
                var src = scripts[i].src || '';
                if (src.indexOf('/visualizations/maps-plus/visualization.js') !== -1) {
                    var u2 = new URL(src);
                    if (u2.origin && u2.origin !== 'null') { return u2.origin; }
                }
            }
        }
    } catch (e) { /* fall through */ }
    return '';
}
function _resolveSplunkRestRoot() {
    var origin = _detectSplunkOrigin();
    if (origin) {
        return origin + '/en-US/splunkd/__raw/services';
    }
    return '/services';
}
var _DS_REST_ROOT = _resolveSplunkRestRoot();
// Splunk Web origin (e.g. 'http://localhost:8000') — cached once at module
// load. In DS the viz runs in an iframe with origin 'null', so
// `location.origin` returns the string 'null' which breaks contribUri URLs
// (seen at UAT-2 as '.../maps-plus-ds-uat/null/en-US/static/...'). In
// Classic the iframe hosts the viz at the Splunk Web origin, so the
// detected origin matches `location.origin` — no regression.
var _SPLUNK_ORIGIN = _detectSplunkOrigin();

// Phase 2: DsProxyTileLayer — Leaflet TileLayer subclass that routes
// getTileUrl through the Phase 1 REST proxy. Used ONLY when
// _isDashboardStudio is true. Stores the inner upstream template on
// _innerTemplate so existing equality checks (e.g.
// `this.tileLayer._url != this.activeTile` at ~line 2955) continue to
// detect real template changes. Overrides setUrl to update
// _innerTemplate without breaking Leaflet's redraw lifecycle.
var DsProxyTileLayer = L.TileLayer.extend({
    initialize: function (url, options) {
        this._innerTemplate = url;
        // Leaflet will store `url` on this._url via its own initialize;
        // we keep both so _url tracks what maps-plus.js expects.
        L.TileLayer.prototype.initialize.call(this, url, options);
    },
    setUrl: function (url, noRedraw) {
        this._innerTemplate = url;
        return L.TileLayer.prototype.setUrl.call(this, url, noRedraw);
    },
    getTileUrl: function (coords) {
        var template = this._innerTemplate || this._url;
        var normalized = DsTileProxyHelpers.normalizeTileTemplate(template, this.options || {});
        var extras = {};
        if (this.options && this.options.subdomains) {
            // Leaflet default: first subdomain; match client-side D-10 ('a' default).
            var subs = this.options.subdomains;
            extras.s = (typeof subs === 'string') ? subs.charAt(0) : (subs && subs[0]) || 'a';
        }
        // {r} defaults come from Leaflet's detectRetina / this.options.detectRetina;
        // send the actual pixelRatio when known.
        if (this.options && typeof this.options.detectRetina !== 'undefined') {
            extras.r = (L.Browser && L.Browser.retina) ? '2' : '1';
        }
        var restRoot = (this._dsRestRoot) || '/services';
        return DsTileProxyHelpers.buildTileProxyUrl(restRoot, normalized, {
            z: this._getZoomForUrl(),
            x: coords.x,
            y: coords.y
        }, extras);
    }
});

// Factory: returns either a proxied subclass instance (DS mode) or a
// plain L.tileLayer call (Classic mode, unchanged).
function _createMapsPlusTileLayer(viz, template, tileOptions) {
    if (viz._isDashboardStudio) {
        var layer = new DsProxyTileLayer(template, tileOptions);
        // Attach restRoot so getTileUrl can access it without closure-scope.
        layer._dsRestRoot = viz._dsRestRoot;
        // Optional instrumentation per D-15: warn on load error with stable prefix.
        layer.on('tileerror', function (evt) {
            try {
                var c = evt && evt.coords;
                console.warn('[maps-plus:ds-proxy] tile load failed z=' +
                    (c && c.z) + ' x=' + (c && c.x) + ' y=' + (c && c.y));
            } catch (e) { /* noop */ }
        });
        return layer;
    }
    return L.tileLayer(template, tileOptions);
}


return SplunkVisualizationBase.extend({
maxResults: 0,
paneZIndex: 400,
tileLayer: null,
measureDialogOpen: false,
parentEl: null,
parentView: null,
showClearPlayback: false,
mapOptions: {},
tileOptions: {},
map: {},
contribUri: '/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib',
validMarkerTypes: ["custom", "png", "icon", "svg", "circle", "milsymbol"],
// Known valid SPL field names — used by validateFields to isolate drilldown data
validFields: ['latitude',
               'longitude',
               'title',
               'tooltip',
               'description',
               'icon',
               'customIcon',
               'customIconShadow',
               'markerType',
               'markerColor',
               'markerPriority',
               'markerSize',
               'markerAnchor',
               'markerVisibility',
               'iconColor',
               'shadowAnchor',
               'shadowSize',
               'prefix',
               'extraClasses',
               'layerDescription',
               'layerVisibility',
               'pathLayer',
               'pathWeight',
               'pathOpacity',
               'playback',
               'layerGroup',
               'layerPriority',
               'layerIcon',
               'layerIconSize',
               'layerIconColor',
               'layerIconPrefix',
               'clusterGroup',
               'pathColor',
               'popupAnchor',
               'heatmapInclude',
               'heatmapLayer',
               'heatmapPointIntensity',
               'heatmapMinOpacity',
               'heatmapRadius',
               'heatmapBlur',
               'heatmapColorGradient',
               'circleStroke',
               'circleRadius',
               'circleColor',
               'circleWeight',
               'circleOpacity',
               'circleFillColor',
               'circleFillOpacity',
               'antPath',
               'antPathDelay',
               'antPathPulseColor',
               'antPathPaused',
               'antPathReverse',
               'antPathDashArray',
               'feature',
               'featureLayer',
               'featureDescription',
               'featureTooltip',
               'featureColor',
               'featureWeight',
               'featureOpacity',
               'featureStroke',
               'featureFill',
               'featureFillColor',
               'featureFillOpacity',
               'featureRadius',
               'msStrokeWidth',
               '_time'],
isDarkTheme: themeUtils.getCurrentTheme && themeUtils.getCurrentTheme() === 'dark',
defaultConfig:  {
    'display.visualizations.custom.leaflet_maps_app.maps-plus.cluster': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.allPopups': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.multiplePopups': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.animate': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.singleMarkerMode': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.disableClusteringAtZoom': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.disableClusteringAtZoomLevel': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.maxClusterRadius': 80,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.maxSpiderfySize': 100,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.spiderfyDistanceMultiplier': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.mapTile': 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.mapTileOverride': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.mapAttributionOverride': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.layerControl' : 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.layerControlCollapsed': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.scrollWheelZoom': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.fullScreen': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.drilldown': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.drilldownAction': "dblclick",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.contextMenu': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.defaultHeight': 600,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.autoFitAndZoom': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.autoFitAndZoomDelay': 500,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.mapCenterZoom': 6,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.mapCenterLat': 39.50,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.mapCenterLon': -98.35,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.minZoom': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.maxZoom': 19,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.permanentTooltip': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.stickyTooltip': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.i18nLanguage': 'en',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.googlePlacesSearch': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.googlePlacesApiKeyUser': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.googlePlacesApiKeyRealm': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.googlePlacesZoomLevel': "12",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.googlePlacesPosition': "topleft",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.bingMapsApiKey': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.bingMapsApiKeyUser': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.bingMapsApiKeyRealm': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.useOpenFreeMap': '0',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.maplibreStylePreset': 'liberty',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.maplibreStyleOverride': '',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.kmlOverlay' : "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.clusterGroupColors': '',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.rangeOneBgColor': "#B5E28C",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.rangeOneFgColor': "#6ECC39",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.warningThreshold': 55,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.rangeTwoBgColor': "#F1D357",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.rangeTwoFgColor': "#F0C20C",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.criticalThreshold': 80,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.rangeThreeBgColor': "#FD9C73",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.rangeThreeFgColor': "#F18017",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measureTool': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measureIconPosition': "topright",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measurePrimaryLengthUnit': "feet",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measureSecondaryLengthUnit': "miles",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measurePrimaryAreaUnit': "acres",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measureSecondaryAreaUnit': "sqmiles",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measureActiveColor': "#00ff00",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measureCompletedColor': "#0066ff",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.measureLocalization': "en",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showPathLines': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.pathIdentifier': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.pathColorList': "#0003F0,#D43C29,darkgreen,0xe2d400,darkred,#23A378",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.pathSplits': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.renderer': "svg",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.pathSplitInterval': 60,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showPlayback': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showPlaybackSliderControl': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showPlaybackDateControl': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showPlaybackPlayControl': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.playbackTickLength': 50, 
    'display.visualizations.custom.leaflet_maps_app.maps-plus.playbackSpeed': 1.0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.heatmapEnable': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.heatmapOnly': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.heatmapMinOpacity': 1.0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.heatmapRadius': 25,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.heatmapBlur': 15,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.splunkVersionCheck': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.antarcticProj': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.antarcticMapTile': "https://tile.gbif.org/3031/omt/{z}/{x}/{y}@{r}x.png?gbif-geyser",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.gibsLayerId': "MODIS_Aqua_CorrectedReflectance_TrueColor",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.gibsFormat': "image/jpeg",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.gibsLowerCorner': -4194304,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.gibsUpperCorner': 4194304,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.gibsTileMatrixSet': "250m",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.gibsTime': "",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.tileSize': 512,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.heatmapColorGradient': '{"0.4":"blue","0.6":"cyan","0.7":"lime","0.8":"yellow","1":"red"}',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showProgress': 1,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.msIconColor': '""',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.msFrameColor': '""',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.msColorMode': "Light",
    'display.visualizations.custom.leaflet_maps_app.maps-plus.msInfoColor': '""',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.msInfoBackground': '""',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.msInfoBackgroundFrame': '""',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.msOutlineColor': '""',
    'display.visualizations.custom.leaflet_maps_app.maps-plus.selectingMarkers': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.clickLatLngToken': 0,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.clickLatLngPrecision': 4,
    'display.visualizations.custom.leaflet_maps_app.maps-plus.showClickMarker': 1,
},
ATTRIBUTIONS: {
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>',
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>',
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png': 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}': 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
},

initialize: function() {
    SplunkVisualizationBase.prototype.initialize.apply(this, arguments)
    this.$el = $(this.el)
    this.isInitializedDom = false
    this.curPage = 0
    this.allDataProcessed = false

    this.pixelRatio = parseInt(window.devicePixelRatio) || 1
    this._clickMarker = null

    // Phase 2 (DS-JS-01): detect Dashboard Studio runtime.
    // Truthy check on documented Splunk global; fails closed to Classic.
    this._isDashboardStudio = DsTileProxyHelpers.isDashboardStudio(typeof window !== 'undefined' ? window : null)
    this._dsRestRoot = _DS_REST_ROOT
},

// Search data params
getInitialDataParams: function() {
    return ({
        outputMode: SplunkVisualizationBase.RAW_OUTPUT_MODE,
        count: this.maxResults
    })
},

reflow: function() {
    if(this.isInitializedDom) {
        this.map.invalidateSize()
    }
},

_darkModeInit: function () {
    // Set dialog to black
    this.map.on('dialog:opened', function(e) {                        
        $('.leaflet-control-dialog').css({'background-color': '#000000'})
        $('.leaflet-control-dialog input[type="text"]').css({'background-color': '#1a1a1a',
                                                             'color': '#ffffff',
                                                             'border': '1px solid #555555'})
        $('.leaflet-control-layers').css({'color': '#fff'})
    })

    // Change popup colors
    this.map.on('popupopen', function(e) {    
        $('.leaflet-popup-content-wrapper, .leaflet-popup-tip').css({'background-color': '#000000',
                                                                        'color': "#FFFFFF"})
    })
    
    // Change tooltip colors
    this.map.on('tooltipopen', function(e) {  
        $('.leaflet-tooltip').css({'background': '#000000',
                                    'color': '#FFFFFF',
                                    'border': '1px solid #000000'})
        $('.leaflet-tooltip-right').toggleClass('dark', true)
        $('.leaflet-tooltip-left').toggleClass('dark', true)
        $('.leaflet-tooltip-bottom').toggleClass('dark', true)
        $('.leaflet-tooltip-top').toggleClass('dark', true)
    })

    
    // Update Zoom Controls
    $('.leaflet-control-zoom-in').css({'background-color': '#000000',
                                        'color': '#FFFFFF'})
    $('.leaflet-control-zoom-out').css({'background-color': '#000000',
                                        'color': '#FFFFFF'})
    
    // context menu dark mode styles
    var styles = ['.leaflet-contextmenu{display:none;box-shadow:0 1px 7px rgba(0,0,0,.4);-webkit-border-radius:4px;border-radius:4px;padding:4px 0;background-color:#000;cursor:default;-webkit-user-select:none;-moz-user-select:none;user-select:none}',
                  '.leaflet-contextmenu a.leaflet-contextmenu-item{display:block;color:#fff;font-size:12px;line-height:20px;text-decoration:none;padding:0 12px;border-top:1px solid transparent;border-bottom:1px solid transparent;cursor:default;outline:0}',
                  '.leaflet-contextmenu a.leaflet-contextmenu-item-disabled{opacity:.5}',
                  '.leaflet-contextmenu a.leaflet-contextmenu-item.over{background-color:#2b3033;border-top:1px solid #2b3033;border-bottom:1px solid #2b3033}',
                  '.leaflet-contextmenu a.leaflet-contextmenu-item-disabled.over{background-color:inherit;border-top:1px solid transparent;border-bottom:1px solid transparent}',
                  '.leaflet-contextmenu-icon{margin:2px 8px 0 0;width:16px;height:16px;float:left;border:0}',
                  '.leaflet-contextmenu-separator{border-bottom:1px solid #fff;margin:5px 0}']

    // Find the contextmenu @import sub-stylesheet inside visualization.css by
    // walking cssRules and identifying it by content (.leaflet-contextmenu selector),
    // rather than relying on a hardcoded index or taking the first @import found.
    var sheet = $('link[rel="stylesheet"][href*="visualization.css"]')[0].sheet
    var darkModeStylesheet = null
    for (var r = 0; r < sheet.cssRules.length; r++) {
        var rule = sheet.cssRules[r]
        if (rule.styleSheet) {
            var subSheet = rule.styleSheet
            for (var s = 0; s < subSheet.cssRules.length; s++) {
                if (subSheet.cssRules[s].selectorText &&
                    subSheet.cssRules[s].selectorText.indexOf('leaflet-contextmenu') >= 0) {
                    darkModeStylesheet = subSheet
                    break
                }
            }
            if (darkModeStylesheet) break
        }
    }
    if (!darkModeStylesheet) return

    // delete styles from newest to oldest
    for(var i = darkModeStylesheet.cssRules.length - 1; i >= 0; i--) {
        darkModeStylesheet.deleteRule(i)
    }

    // insert dark styles
    for(var i = 0; i < styles.length; i++) {
        darkModeStylesheet.insertRule(styles[i], i)
    }
},

_darkModeUpdate: function() {
    $('.leaflet-control-measure').css('background-color', '#000000')

    $('.leaflet-control-layers').css({'background-color': '#000',
    'color': '#fff'})

    // Set initial background color of control to black
    $('.leaflet-bar a').css('background-color', '#000000')

    // Re-set background color on collapse
    this.map.on('measurecollapsed', function() {
        $('.leaflet-bar a').css('background-color', '#000000')
        
    })

    $('.leaflet-control-layers').css({'background-color': '#000',
                                                  'color': '#fff'})
},

onConfigChange: function(configChanges, previousConfig) {
    const configBase = this.getPropertyNamespaceInfo().propertyNamespace
    let bgRgb,
        bgRgba,
        fgRgb,
        fgRgba,
        html,
        mapTile = this._propertyExists('mapTile', configChanges) ? this._getSafeUrlProperty('mapTile', configChanges):this._getSafeUrlProperty('mapTile', previousConfig),
        mapCenterZoom = this._propertyExists('mapCenterZoom', configChanges) ? parseInt(this._getEscapedProperty('mapCenterZoom', configChanges)):parseInt(this._getEscapedProperty('mapCenterZoom', previousConfig)),
        mapCenterLat = this._propertyExists('mapCenterLat', configChanges) ? parseFloat(this._getSafeUrlProperty('mapCenterLat', configChanges)):parseFloat(this._getSafeUrlProperty('mapCenterLat', previousConfig)),
        mapCenterLon = this._propertyExists('mapCenterLon', configChanges) ? parseFloat(this._getSafeUrlProperty('mapCenterLon', configChanges)):parseFloat(this._getSafeUrlProperty('mapCenterLon', previousConfig)),
        mapTileOverride = this._propertyExists('mapTileOverride', configChanges) ? this._getEscapedProperty('mapTileOverride', configChanges):this._getEscapedProperty('mapTileOverride', previousConfig),
        scrollWheelZoom = this._propertyExists('scrollWheelZoom', configChanges) ? this.isArgTrue(parseInt(this._getEscapedProperty('scrollWheelZoom', configChanges))):this.isArgTrue(parseInt(this._getEscapedProperty('scrollWheelZoom', previousConfig))),
        mapAttributionOverride = this._propertyExists('mapAttributionOverride', configChanges) ? this._getEscapedProperty('mapAttributionOverride', configChanges):this._getEscapedProperty('mapAttributionOverride', previousConfig),
        fullScreen = this._propertyExists('fullScreen', configChanges) ? this.isArgTrue(parseInt(this._getEscapedProperty('fullScreen', configChanges))):this.isArgTrue(parseInt(this._getEscapedProperty('fullScreen', previousConfig))),
        defaultHeight = this._propertyExists('defaultHeight', configChanges) ? parseInt(this._getEscapedProperty('defaultHeight', configChanges)):parseInt(this._getEscapedProperty('defaultHeight', previousConfig)),
        contextMenu = this._propertyExists('contextMenu', configChanges) ? this.isArgTrue(parseInt(this._getEscapedProperty('contextMenu', configChanges))):this.isArgTrue(parseInt(this._getEscapedProperty('contextMenu', previousConfig))),
        rangeOneBgColor = this._propertyExists('rangeOneBgColor', configChanges) ? this.hexToRgb(this._getEscapedProperty('rangeOneBgColor', configChanges)):this.hexToRgb(this._getEscapedProperty('rangeOneBgColor', previousConfig)),
        rangeOneFgColor = this._propertyExists('rangeOneFgColor', configChanges) ? this.hexToRgb(this._getEscapedProperty('rangeOneFgColor', configChanges)):this.hexToRgb(this._getEscapedProperty('rangeOneFgColor', previousConfig)),
        rangeTwoBgColor = this._propertyExists('rangeTwoBgColor', configChanges) ? this.hexToRgb(this._getEscapedProperty('rangeTwoBgColor', configChanges)):this.hexToRgb(this._getEscapedProperty('rangeTwoBgColor', previousConfig)),
        rangeTwoFgColor = this._propertyExists('rangeTwoFgColor', configChanges) ? this.hexToRgb(this._getEscapedProperty('rangeTwoFgColor', configChanges)):this.hexToRgb(this._getEscapedProperty('rangeTwoFgColor', previousConfig)),
        rangeThreeBgColor = this._propertyExists('rangeThreeBgColor', configChanges) ? this.hexToRgb(this._getEscapedProperty('rangeThreeBgColor', configChanges)):this.hexToRgb(this._getEscapedProperty('rangeThreeBgColor', previousConfig)),
        rangeThreeFgColor = this._propertyExists('rangeThreeFgColor', configChanges) ? this.hexToRgb(this._getEscapedProperty('rangeThreeFgColor', configChanges)):this.hexToRgb(this._getEscapedProperty('rangeThreeFgColor', previousConfig)),
        disableClusteringAtZoom = this._propertyExists('disableClusteringAtZoom', configChanges) ? this.isArgTrue(parseInt(this._getEscapedProperty('disableClusteringAtZoom', configChanges))):this.isArgTrue(parseInt(this._getEscapedProperty('disableClusteringAtZoom', previousConfig))),
        disableClusteringAtZoomLevel = this._propertyExists('disableClusteringAtZoomLevel', configChanges) ? parseInt(this._getEscapedProperty('disableClusteringAtZoomLevel', configChanges)):parseInt(this._getEscapedProperty('disableClusteringAtZoomLevel', previousConfig)),
        minZoom = this._propertyExists('minZoom', configChanges) ? parseInt(this._getEscapedProperty('minZoom', configChanges)):parseInt(this._getEscapedProperty('minZoom', previousConfig)),
        maxZoom = this._propertyExists('maxZoom', configChanges) ? parseInt(this._getEscapedProperty('maxZoom', configChanges)):parseInt(this._getEscapedProperty('maxZoom', previousConfig)),
        layerControl = this._propertyExists('layerControl', configChanges) ? parseInt(this._getEscapedProperty('layerControl', configChanges)):parseInt(this._getEscapedProperty('layerControl', previousConfig)),
        layerControlCollapsed = this._propertyExists('layerControlCollapsed', configChanges) ? parseInt(this._getEscapedProperty('layerControlCollapsed', configChanges)):parseInt(this._getEscapedProperty('layerControlCollapsed', previousConfig)),
        measureTool = this._propertyExists('measureTool', configChanges) ? parseInt(this._getEscapedProperty('measureTool', configChanges)):parseInt(this._getEscapedProperty('measureTool', previousConfig)),
        showPlayback = this._propertyExists('showPlayback', configChanges) ? parseInt(this._getEscapedProperty('showPlayback', configChanges)):parseInt(this._getEscapedProperty('showPlayback', previousConfig)),
        showPlaybackSliderControl = this._propertyExists('showPlaybackSliderControl', configChanges) ? this.isArgTrue(parseInt(this._getEscapedProperty('showPlaybackSliderControl', configChanges))):this.isArgTrue(parseInt(this._getEscapedProperty('showPlaybackSliderControl', previousConfig))),
        showPlaybackDateControl = this._propertyExists('showPlaybackDateControl', configChanges) ? this.isArgTrue(parseInt(this._getEscapedProperty('showPlaybackDateControl', configChanges))):this.isArgTrue(parseInt(this._getEscapedProperty('showPlaybackDateControl', previousConfig))),
        showPlaybackPlayControl = this._propertyExists('showPlaybackPlayControl', configChanges) ? this.isArgTrue(parseInt(this._getEscapedProperty('showPlaybackPlayControl', configChanges))):this.isArgTrue(parseInt(this._getEscapedProperty('showPlaybackPlayControl', previousConfig))),
        measureIconPosition = this._propertyExists('measureIconPosition', configChanges) ? this._getEscapedProperty('measureIconPosition', configChanges):this._getEscapedProperty('measureIconPosition', previousConfig),
        measureActiveColor = this._propertyExists('measureActiveColor', configChanges) ? this._getEscapedProperty('measureActiveColor', configChanges):this._getEscapedProperty('measureActiveColor', previousConfig),
        measureCompletedColor = this._propertyExists('measureCompletedColor', configChanges) ? this._getEscapedProperty('measureCompletedColor', configChanges):this._getEscapedProperty('measureCompletedColor', previousConfig),
        antarcticMapTile = this._propertyExists('antarcticMapTile', configChanges) ? this._getEscapedProperty('antarcticMapTile', configChanges):this._getEscapedProperty('antarcticMapTile', previousConfig),
        gibsLayerId = this._propertyExists('gibsLayerId', configChanges) ? this._getEscapedProperty('gibsLayerId', configChanges):this._getEscapedProperty('gibsLayerId', previousConfig),
        gibsFormat = this._propertyExists('gibsFormat', configChanges) ? this._getEscapedProperty('gibsFormat', configChanges):this._getEscapedProperty('gibsFormat', previousConfig),
        gibsLowerCorner = this._propertyExists('gibsLowerCorner', configChanges) ? this._getEscapedProperty('gibsLowerCorner', configChanges):this._getEscapedProperty('gibsLowerCorner', previousConfig),
        gibsUpperCorner = this._propertyExists('gibsUpperCorner', configChanges) ? this._getEscapedProperty('gibsUpperCorner', configChanges):this._getEscapedProperty('gibsUpperCorner', previousConfig),
        gibsTileMatrixSet = this._propertyExists('gibsTileMatrixSet', configChanges) ? this._getEscapedProperty('gibsTileMatrixSet', configChanges):this._getEscapedProperty('gibsTileMatrixSet', previousConfig),
        gibsTime = this._propertyExists('gibsTime', configChanges) ? this._getEscapedProperty('gibsTime', configChanges):this._getEscapedProperty('gibsTime', previousConfig),
        tileSize = this._propertyExists('tileSize', configChanges) ? this._getEscapedProperty('tileSize', configChanges):this._getEscapedProperty('tileSize', previousConfig),
        useOpenFreeMap = this._propertyExists('useOpenFreeMap', configChanges)
            ? this.isArgTrue(parseInt(this._getEscapedProperty('useOpenFreeMap', configChanges)))
            : this.isArgTrue(parseInt(this._getEscapedProperty('useOpenFreeMap', previousConfig))),
        maplibreStylePreset = this._propertyExists('maplibreStylePreset', configChanges)
            ? this._getEscapedProperty('maplibreStylePreset', configChanges)
            : this._getEscapedProperty('maplibreStylePreset', previousConfig),
        maplibreStyleOverride = this._propertyExists('maplibreStyleOverride', configChanges)
            ? this._getSafeUrlProperty('maplibreStyleOverride', configChanges)
            : this._getSafeUrlProperty('maplibreStyleOverride', previousConfig)


    if (!useOpenFreeMap) {
        // Update tile layer
        if(this._propertyExists('mapTile', configChanges) && (_.isUndefined(mapTileOverride) ||  mapTileOverride == "")) {
            this.tileLayer.setUrl(mapTile)
        }

        // Handle map tile override
        if(this._propertyExists('mapTileOverride', configChanges)) {
            if(mapTileOverride == "") {
                this.tileLayer.setUrl(mapTile)
            } else {
                this.tileLayer.setUrl(mapTileOverride)
            }
        }
    }

    // Handle OpenFreeMap style changes
    if (useOpenFreeMap && (
        this._propertyExists('useOpenFreeMap', configChanges) ||
        this._propertyExists('maplibreStylePreset', configChanges) ||
        this._propertyExists('maplibreStyleOverride', configChanges) ||
        this._propertyExists('mapAttributionOverride', configChanges)
    )) {
        if (this.tileLayer) {
            this.tileLayer.remove();
            this.tileLayer = null;
        }
        const styleUrl = this._getMaplibreStyleUrl({ maplibreStylePreset, maplibreStyleOverride });
        const attribution = mapAttributionOverride
            || '© <a href="https://openfreemap.org">OpenFreeMap</a> '
            + '© <a href="https://openmaptiles.org">OpenMapTiles</a> '
            + '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
        this.tileLayer = L.maplibreGL({ style: styleUrl, attribution }).addTo(this.map);
    }

    // Handle scroll wheel zoom
    if(this._propertyExists('scrollWheelZoom', configChanges)) {
        if(scrollWheelZoom) {
            this.map.scrollWheelZoom.enable()
        } else {
            this.map.scrollWheelZoom.disable()
        }
    }

    // Handle center zoom change
    if(this._propertyExists('mapCenterZoom', configChanges)) {
        this.map.setZoom(mapCenterZoom)
    }

    // Handle latitude change
    if(this._propertyExists('mapCenterLat', configChanges) || this._propertyExists('mapCenterLon', configChanges)) {                
        this.map.setZoom(mapCenterZoom)
        this.map.panTo([mapCenterLat, 
                        mapCenterLon])
    }
    
    // update map tile attribution
    if(this._propertyExists('mapAttributionOverride', configChanges)) {
        // Remove current and previous map tile attributions
        this.map.attributionControl.removeAttribution(this.ATTRIBUTIONS[mapTile])
        this.map.attributionControl.removeAttribution(this.ATTRIBUTIONS[previousConfig[configBase + 'mapTile']])
        this.map.attributionControl.removeAttribution(previousConfig[configBase + 'mapAttributionOverride'])

        // Add current attribution
        this.map.attributionControl.addAttribution(mapAttributionOverride)

        // Reset to current map tile if unset
        if(mapAttributionOverride == "") {
            this.map.attributionControl.addAttribution(this.ATTRIBUTIONS[mapTile])    
        }
    }

    // Handle full sceen mode enable/disable
    // if(_.has(configChanges, configBase + 'fullScreen')) {
    if(this._propertyExists('fullScreen', configChanges)) {
        if(fullScreen) {
            this._setFullScreenMode(this.map, {parentEl: this.parentEl})
        } else {
            this._setDefaultHeight(this.map, {parentEl: this.parentEl,
                                              defaultHeight: this.defaultHeight})                    
        }
    }

    // Handle height re-size
    // if(_.has(configChanges, configBase + 'defaultHeight')) {
    if(this._propertyExists('defaultHeight', configChanges)) {
        this._setDefaultHeight(this.map, {parentEl: this.parentEl,
                                          defaultHeight: defaultHeight})   
    }

    // Handle context menu enable/disable
    if(this._propertyExists('contextMenu', configChanges)) {
        if(contextMenu) {
            if(showPlayback) {
                _.each(this.pathLineLayers, function(lg) {
                    lg.eachLayer(function(layer) {
                        // Ant Path
                        if(_.has(layer, '_animatedPathClass')) { 
                            layer.eachLayer(function(p) {
                                if(layer.options.playback) {
                                    p.bindContextMenu(layer.options.pathContextMenuRemove)
                                } else {
                                    p.bindContextMenu(layer.options.pathContextMenuAdd)
                                }
                            }, this)
                        }  else {
                            if(layer.options.playback) {
                                layer.bindContextMenu(layer.options.pathContextMenuRemove)
                            } else {
                                layer.bindContextMenu(layer.options.pathContextMenuAdd)
                            }                                
                        }
                    }) 
                })
            }

            this.contextMenuEnabled = true
            this.map.contextmenu.enable()

        } else {
            if(showPlayback) {
                _.each(this.pathLineLayers, function(lg) {
                    lg.eachLayer(function(layer) {
                        // Ant Path
                        if(_.has(layer, '_animatedPathClass')) { 
                            layer.eachLayer(function(p) {
                                p.unbindContextMenu()
                                //layer.options.playback = false
                            }, this)
                        }  else {
                            layer.unbindContextMenu()
                            //layer.options.playback = false
                        }
                    }) 
                }, this)
            }
            
            this.contextMenuEnabled = false
            this.map.contextmenu.disable()
        }
    }

    // Cluster Background Range 1
    if(this._propertyExists('rangeOneBgColor', configChanges)) {
        bgRgb = rangeOneBgColor
        bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', 0.6)'

        html = '.marker-cluster-one { background-color: ' + bgRgba + ';}'
        if(this._clusterStyleOneBg) { this._clusterStyleOneBg.html(html) }
        else { this._clusterStyleOneBg = $("<style>").prop("type", "text/css").html(html).appendTo("head") }
    }

    // Cluster Foreground Range 1
    if(this._propertyExists('rangeOneFgColor', configChanges)) {
        fgRgb = rangeOneFgColor
        fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)'

        html = '.marker-cluster-one div { background-color: ' + fgRgba + ';}'
        if(this._clusterStyleOneFg) { this._clusterStyleOneFg.html(html) }
        else { this._clusterStyleOneFg = $("<style>").prop("type", "text/css").html(html).appendTo("head") }
    }

    // Cluster Background Range 2
    if(this._propertyExists('rangeTwoBgColor', configChanges)) {
        bgRgb = rangeTwoBgColor
        bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', 0.6)'

        html = '.marker-cluster-two { background-color: ' + bgRgba + ';}'
        if(this._clusterStyleTwoBg) { this._clusterStyleTwoBg.html(html) }
        else { this._clusterStyleTwoBg = $("<style>").prop("type", "text/css").html(html).appendTo("head") }
    }

    // Cluster Foreground Range 2
    if(this._propertyExists('rangeTwoFgColor', configChanges)) {
        fgRgb = rangeTwoFgColor
        fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)'

        html = '.marker-cluster-two div { background-color: ' + fgRgba + ';}'
        if(this._clusterStyleTwoFg) { this._clusterStyleTwoFg.html(html) }
        else { this._clusterStyleTwoFg = $("<style>").prop("type", "text/css").html(html).appendTo("head") }
    }

    // Cluster Background Range 3
    if(this._propertyExists('rangeThreeBgColor', configChanges)) {
        bgRgb = rangeThreeBgColor
        bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', 0.6)'

        html = '.marker-cluster-three { background-color: ' + bgRgba + ';}'
        if(this._clusterStyleThreeBg) { this._clusterStyleThreeBg.html(html) }
        else { this._clusterStyleThreeBg = $("<style>").prop("type", "text/css").html(html).appendTo("head") }
    }

    // Cluster Foreground Range 3
    if(this._propertyExists('rangeThreeFgColor', configChanges)) {
        fgRgb = rangeThreeFgColor
        fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)'

        html = '.marker-cluster-three div { background-color: ' + fgRgba + ';}'
        if(this._clusterStyleThreeFg) { this._clusterStyleThreeFg.html(html) }
        else { this._clusterStyleThreeFg = $("<style>").prop("type", "text/css").html(html).appendTo("head") }
    }

    // Handle cluster group zoom disable/enable
    if(this._propertyExists('disableClusteringAtZoom', configChanges)) {
        _.each(this.layerFilter, function(lf) {
            if(disableClusteringAtZoom) {
                lf.clusterGroup[0].cg.options.disableClusteringAtZoom = disableClusteringAtZoomLevel
            } else {
                delete lf.clusterGroup[0].cg.options.disableClusteringAtZoom
            }
            let layers = lf.clusterGroup[0].cg.getLayers()
            lf.clusterGroup[0].cg.clearLayers()
            lf.clusterGroup[0].cg.addLayers(layers)
        }, this)
    }

    // Handle min zoom change
    if(this._propertyExists('minZoom', configChanges)) {
        this.map.setMinZoom(minZoom)
    }

    // Handle max zoom change
    if(this._propertyExists('maxZoom', configChanges)) {
        this.map.setMaxZoom(maxZoom)
    }

    // Handle layer control add/remove
    if(this._propertyExists('layerControl', configChanges)) {
        if(!layerControl) {
            this.control.remove()
        } else {
            this.control.addTo(this.map)
            if(this.isDarkTheme) { this._darkModeUpdate() }
        } 
    }

    // Handle measure tool add/remove
    if(this._propertyExists('measureTool', configChanges)) {
        if(!measureTool) {
            this.measureControl.remove()
        } else {
            this.measureControl.addTo(this.map)
        }
        if(this.isDarkTheme) { this._darkModeUpdate() }
    }

    if(this._propertyExists('showPlaybackSliderControl', configChanges)) {
        this.playback.options.sliderControl = showPlaybackSliderControl
        this.updatePlaybackControls()
    }

    if(this._propertyExists('showPlaybackDateControl', configChanges)) {
        this.playback.options.dateControl = showPlaybackDateControl
        this.updatePlaybackControls()
    }

    if(this._propertyExists('showPlaybackPlayControl', configChanges)) {
        this.playback.options.playControl = showPlaybackPlayControl
        this.updatePlaybackControls()
    }

    // Handle Playback
    if(this._propertyExists('showPlayback', configChanges)) {
        if(!showPlayback) {
            this.playback.clearData()
            this.playback.options.playControl = false
            this.playback.options.dateControl = false
            this.playback.options.sliderControl = false

            this.playback.hideControls()
            if(this.showClearPlayback) {
                this.map.contextmenu.removeItem(0)
                this.map.contextmenu.removeItem(0)
                this.map.contextmenu.removeItem(0)
                this.showClearPlayback = false  
            }

            _.each(this.pathLineLayers, function(lg) {
                lg.eachLayer(function(layer) {
                    // Ant Path
                    if(_.has(layer, '_animatedPathClass')) { 
                        layer.eachLayer(function(p) {
                            p.unbindContextMenu()
                        }, this)
                    }  else {
                        layer.unbindContextMenu()
                    }
                    layer.options.playback = false
                }) 
            }, this)
        } else {
            if(contextMenu) {
                this.map.contextmenu.insertItem({text: 'Clear Playback',
                                                context: this,
                                                callback: this.clearPlayback}, 0)
                this.map.contextmenu.insertItem({text: 'Reset Playback',
                                                context: this,
                                                callback: this.resetPlayback}, 1)
                this.map.contextmenu.insertItem({text: 'Add All To Playback',
                                                context: this,
                                                callback: this.addAllToPlayback}, 2)

                _.each(this.pathLineLayers, function(lg) {
                    lg.eachLayer(function(layer) {
                        // Ant Path
                        if(_.has(layer, '_animatedPathClass')) { 
                            layer.eachLayer(function(p) {
                                if(layer.options.playback) {
                                    p.bindContextMenu(layer.options.pathContextMenuRemove)
                                } else {
                                    p.bindContextMenu(layer.options.pathContextMenuAdd)
                                }
                            }, this)
                        }  else {
                            if(layer.options.playback) {
                                layer.bindContextMenu(layer.options.pathContextMenuRemove)
                            } else {
                                layer.bindContextMenu(layer.options.pathContextMenuAdd)
                            }                                
                        }
                    }) 
                })
            }
            
            if(showPlaybackSliderControl) { this.playback.options.sliderControl = true }
            if(showPlaybackPlayControl) { this.playback.options.playControl = true }
            if(showPlaybackDateControl) { this.playback.options.dateControl = true }
            
            this.playback._showPlayback = true
            this.showClearPlayback = true
        }

        this.updatePlaybackControls()
    }

    // Handle layer control expand/collapse
    if(this._propertyExists('layerControlCollapsed', configChanges)) {
        if(!layerControlCollapsed) {
            this.control.expand()
        } else {
            this.control.collapse()
        } 
    }

    // Handle measure tool icon position change
    if(this._propertyExists('measureIconPosition', configChanges)) {
        this.measureControl.remove()
        this.control.remove()
        this.measureControl.options.position = measureIconPosition
        this.measureControl.addTo(this.map)
        this.control.addTo(this.map)

        if(this.isDarkTheme) { this._darkModeUpdate() }
    }

    // Handle measure tool active/completed color changes
    if(this._propertyExists('measureActiveColor', configChanges) || this._propertyExists('measureCompletedColor', configChanges)) {
        this.measureControl.remove()
        this.control.remove()

        let measureOptions = { position: measureIconPosition,
            activeColor: measureActiveColor,
            completedColor: measureCompletedColor,
            primaryLengthUnit: this._getEscapedProperty('measurePrimaryLengthUnit', configChanges),
            secondaryLengthUnit: this._getEscapedProperty('secondaryLengthUnit', configChanges),
            primaryAreaUnit: this._getEscapedProperty('primaryAreaUnit', configChanges),
            secondaryAreaUnit: this._getEscapedProperty('secondaryAreaUnit', configChanges),
            localization: this._getEscapedProperty('localization', configChanges),
            features: this.measureFeatures,
            map: this.map}

        this.measureControl = new L.Control.Measure(measureOptions)
        this.measureControl.addTo(this.map)
        this.control.addTo(this.map)
        if(this.isDarkTheme) { this._darkModeUpdate() }

    }

    // Handle clickLatLngToken cursor style change
    if(this._propertyExists('clickLatLngToken', configChanges)) {
        if(this.isArgTrue(parseInt(this._getEscapedProperty('clickLatLngToken', configChanges)))) {
            this.map.getContainer().style.cursor = 'crosshair';
        } else {
            this.map.getContainer().style.cursor = '';
            if (this._clickMarker) {
                this.map.removeLayer(this._clickMarker);
                this._clickMarker = null;
            }
        }
    }
    if(this._propertyExists('showClickMarker', configChanges)) {
        if(!this.isArgTrue(parseInt(this._getEscapedProperty('showClickMarker', configChanges))) && this._clickMarker) {
            this.map.removeLayer(this._clickMarker);
            this._clickMarker = null;
        }
    }
},

// Build object of key/value pairs for invalid fields
// to be used as data for _drilldown action
validateFields: function(obj) {
    var invalidFields = {}
    $.each(obj, function(key, value) {
        if($.inArray(key, this.validFields) === -1) {
            invalidFields[key] = value
        }
    }.bind(this))

    return(invalidFields)
},

_stringToJSON: function(value) {
    if(_.isUndefined(value)) {
        return
    }
    
    var cleanJSON = value.replace(/'/g, '"')
    return JSON.parse(cleanJSON)
},

_getProperty: function(name, config) {
    var propertyValue = config[this.getPropertyNamespaceInfo().propertyNamespace + name]
    return propertyValue
},

_getEscapedProperty: function(name, config) {
    var propertyValue = config[this.getPropertyNamespaceInfo().propertyNamespace + name]
    return SplunkVisualizationUtils.escapeHtml(propertyValue)
},

_getSafeUrlProperty: function(name, config) {
    var propertyValue = config[this.getPropertyNamespaceInfo().propertyNamespace + name]
    return SplunkVisualizationUtils.makeSafeUrl(propertyValue)

},

_getMaplibreStyleUrl: function({ maplibreStylePreset, maplibreStyleOverride }) {
    if (maplibreStyleOverride) {
        return maplibreStyleOverride
    }
    return 'https://tiles.openfreemap.org/styles/' + (maplibreStylePreset || 'liberty')
},

_propertyExists: function(name, config) {
    return _.has(config, this.getPropertyNamespaceInfo().propertyNamespace + name)
},

// Helper: returns the value of a config property from configChanges if it was changed,
// otherwise falls back to previousConfig. Optional transform function applied to the raw string.
// This eliminates the ~25 identical ternary patterns in onConfigChange:
//   foo = this._propertyExists('foo', changes) ? this._getEscapedProperty('foo', changes)
//                                               : this._getEscapedProperty('foo', prev)
// becomes: foo = this._getConfigValue('foo', changes, prev)
// With a transform: foo = this._getConfigValue('foo', changes, prev, parseInt)
_getConfigValue: function(name, configChanges, previousConfig, transform) {
    var getter = this._getEscapedProperty.bind(this)
    var raw = this._propertyExists(name, configChanges)
        ? getter(name, configChanges)
        : getter(name, previousConfig)
    return transform ? transform(raw) : raw
},

// Custom drilldown behavior for markers
_drilldown: function(drilldownFields, resource) {
    var payload = {
        action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
        data: drilldownFields
    }

    this.drilldown(payload)
},

/* 
/ Convert 0x|# prefixed hex values to # prefixed for consistency
/ Splunk's eval tostring('hex') method returns 0x prefix
*/
convertHex: function(value) {
    // Pass markerColor prefixed with # regardless of given prefix ("#" or "0x")
    var hexRegex = /^(?:#|0x)([a-f\d]{6})$/i
    if (hexRegex.test(value)) {
        var markerColor = "#" + hexRegex.exec(value)[1]
        return(markerColor)
    } else {
        return(value)
    }
},

// Convert hex values to RGB for marker icon colors
hexToRgb: function(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null
},

// Normalize any CSS color string (hex, rgb, rgba, named) to the browser's
// canonical form ('#rrggbb' or 'rgba(r,g,b,a)'). Returns null for invalid input.
parseColor: function(str) {
    if (!str || !str.trim()) { return null }
    var ctx = document.createElement('canvas').getContext('2d')
    // Sentinel approach: invalid assignments leave fillStyle unchanged
    ctx.fillStyle = 'rgba(1,2,3,0.004)'
    var sentinel = ctx.fillStyle
    ctx.fillStyle = str.trim()
    if (ctx.fillStyle === sentinel) {
        console.warn('Maps+: invalid cluster color "' + str + '", ignoring')
        return null
    }
    return ctx.fillStyle
},

// Convert string '1/0' or 'true/false' to boolean true/false
isArgTrue: function(arg) {
    if(arg === 1 || arg === 'true' || arg === true) {
        return true
    } else {
        return false
    }
},

renderModal: function(id, title, body, buttonText, callback=function(){}, callbackArgs=null) {
    function anonCallback(callback=function(){}, callbackArgs=null) {
        if(callbackArgs) {
            callback.apply(this, callbackArgs)
        } else {
            callback()
        }
    }

    // Create the modal
    var myModal = new Modal(id, {
                title: title,
                backdrop: 'static',
                keyboard: false,
                destroyOnHide: true,
                type: 'wide'
    })

    // Add content
    myModal.body.append($(body))

    // Add cancel button for update/delete action
    if(id == "user-delete-confirm" || id == "update-user-form") {
        myModal.footer.append($('<cancel>').attr({
            type: 'button',
            'data-dismiss': 'modal'
        })
        .addClass('btn btn-secondary').text("Cancel")).on('click', function(){})
    }

    // Add footer
    myModal.footer.append($('<button>').attr({
        type: 'button',
        'data-dismiss': 'modal'
    })
    .addClass('btn btn-primary').text(buttonText).on('click', function () {
            anonCallback(callback, callbackArgs)
    }))

    // Launch it!  
    myModal.show()
},

// Get API key from storage/passwords REST endpoint
getStoredApiKey: function(options) {
    var deferred = $.Deferred()

    // Detect version from REST API
    $.ajax({
        type: "GET",
        async: true,
        context: this,
        url: "/en-US/splunkd/__raw/servicesNS/-/-/storage/passwords/" + options.realm + ":" + options.user +":",
        success: function(s) {                                        
            var xml = $(s)
            var that = this
            $(xml).find('content').children().children().each(function(i, v) {
                if(/name="clear_password"/.test(v.outerHTML)) {
                    deferred.resolve(v.textContent)
                } 
            })
        },
        error: function(e) {
            if(_.isEmpty(options.realm)) {
                var realm = "undefined"
            } else {
                var realm = options.realm
            }
            options.context.renderModal('api-key-warning',
                                        "API Key Failure",
                                        "<div class=\"alert alert-warning\"><i class=\"icon-alert\"></i>Failed to get API key for user: <b>" + options.user + "</b>, realm: <b>" + realm + "</b> - Verify credentials and try again.</div>",
                                        'Close')
            console.error("Failed to get API key for user: " + options.user + ", realm: " + options.realm)
        }
    })

    return deferred.promise()
},

// Create RGBA string and corresponding HTML to dynamically set marker CSS in HTML head.
// Uses idempotent update-or-create so repeated calls (e.g. on config change) never
// accumulate duplicate <style> tags in the document head.
createMarkerStyle: function(bgHex, fgHex, markerName) {
    var bgRgb = this.hexToRgb(bgHex)
    var fgRgb = this.hexToRgb(fgHex)
    var bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', 0.6)'
    var fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)'

    var html = '.marker-cluster-' + markerName + ' { background-color: ' + bgRgba + ';} .marker-cluster-' + markerName + ' div { background-color: ' + fgRgba + ';}'
    var cacheKey = '_markerStyle_' + markerName
    if(this[cacheKey]) {
        this[cacheKey].html(html)
    } else {
        this[cacheKey] = $("<style>")
            .prop("type", "text/css")
            .html(html)
            .appendTo("head")
    }
},

// Return '#ffffff' or '#000000' based on WCAG relative luminance of a normalized
// CSS color string (rgba(r,g,b,a) or #rrggbb).
_clusterTextColor: function(normalizedColor) {
    var r, g, b
    var rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(normalizedColor)
    if (rgba) {
        r = parseInt(rgba[1]); g = parseInt(rgba[2]); b = parseInt(rgba[3])
    } else {
        var hex = /^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/.exec(normalizedColor)
        if (!hex) { return '#000000' }
        r = parseInt(hex[1], 16); g = parseInt(hex[2], 16); b = parseInt(hex[3], 16)
    }
    var toLinear = function(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
    var L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    return L > 0.179 ? '#000000' : '#ffffff'
},

// Inject a per-group cluster CSS class using pre-normalized color strings from
// parseColor. Unlike createMarkerStyle, this does NOT call hexToRgb and does NOT
// override user-supplied alpha with 0.6.
createMarkerStyleFromColor: function(bgColor, fgColor, markerName) {
    var textColor = this._clusterTextColor(fgColor)
    var html = '.marker-cluster-' + markerName + ' { background-color: ' + bgColor + ';} ' +
               '.marker-cluster-' + markerName + ' div { background-color: ' + fgColor + ';} ' +
               '.marker-cluster-' + markerName + ' div span { color: ' + textColor + ';}'
    var cacheKey = '_markerStyle_' + markerName
    if (this[cacheKey]) {
        this[cacheKey].html(html)
    } else {
        this[cacheKey] = $("<style>").prop("type", "text/css").html(html).appendTo("head")
    }
},

// Parse the clusterGroupColors formatter string into a color lookup map.
// Input format: "servers:#E74C3C, routers:rgba(52,152,219,0.8), default:red"
// Returns: { servers: '#e74c3c', routers: 'rgba(52, 152, 219, 0.8)', default: '#ff0000' }
// NOTE: Split on commas NOT inside parentheses so rgba(r,g,b,a) values are not broken.
parseClusterGroupColors: function(str) {
    var result = {}
    if (!str || !str.trim()) { return result }
    var self = this
    // Split on ',' only when not inside parentheses (handles rgba(r,g,b,a) values)
    str.split(/,(?![^(]*\))/).forEach(function(pair) {
        var idx = pair.indexOf(':')
        if (idx < 1) { return }
        var key = pair.substring(0, idx).trim()
        var val = pair.substring(idx + 1).trim()
        if (!key || !val) { return }
        var normalized = self.parseColor(val)
        if (normalized) { result[key] = self.deriveClusterColors(normalized) }
    })
    return result
},

// Derive outer-ring (bg) and inner-circle (fg) colors from a single normalized color.
// Hex inputs (#rrggbb) get automatic alpha: 0.6 for outer, 0.8 for inner — matching
// the Leaflet cluster aesthetic. rgba() inputs with explicit alpha are kept as-is.
deriveClusterColors: function(normalizedColor) {
    if (!normalizedColor) { return null }
    var hexMatch = /^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/.exec(normalizedColor)
    if (hexMatch) {
        var r = parseInt(hexMatch[1], 16)
        var g = parseInt(hexMatch[2], 16)
        var b = parseInt(hexMatch[3], 16)
        return {
            bg: 'rgba(' + r + ',' + g + ',' + b + ',0.6)',
            fg: 'rgba(' + r + ',' + g + ',' + b + ',0.8)'
        }
    }
    // User supplied rgba() with explicit alpha — honor it for both rings
    return { bg: normalizedColor, fg: normalizedColor }
},

stringToPoint: function(stringPoint) {
    var point = _.map(stringPoint.split(','), function(val) {
        return parseInt(val)
    })
    return point
},

// Draw path line
drawPath: function(options) {
    //var paneZIndex = 400
   
    _.each(options.data, function(p) {   
        let id = p[0]['id'],
          layerDescription = p[0]['layerDescription'],
          layerPriority = p[0]['layerPriority'],
          layerVisibility = options.context.isArgTrue(p[0]['layerVisibility']),
          layerType = options.context.isArgTrue(p[0]['antPath']) ? "antPath":"path",
          pathLayer = p[0]['pathLayer'],
          pathFg,
          pathName

        // Check if feature group exists for current layerGroup or id
        // Use existing FG or create new accordingly.
        if(_.has(options.pathLineLayers, id)) {
            pathFg = options.pathLineLayers[id]
        } else if(_.has(options.pathLineLayers, pathLayer)) {
            pathFg = options.pathLineLayers[pathLayer]
        } else {
            pathFg = L.featureGroup()
            
            // Prefer layerGroup and fallback to id
            if(!_.isUndefined(pathLayer)) {
                pathName = pathLayer
            } else {
                pathName = id                        
            }
            options.pathLineLayers[pathName] = pathFg
            pathFg.options.name = pathName
            pathFg.options.layerPriority = layerPriority
            pathFg.options.layerType = layerType
            pathFg.options.layerDescription = layerDescription || ('Path: ' + (pathName || id))
            pathFg.options.layerVisibility = layerVisibility
        }

        const pathContextMenuAdd = {
            contextmenu: true,
            contextmenuInheritItems: true,
            contextmenuItems: [{
                    text: 'Add To Playback',
                    index: 0,
                    context: options.context,
                    callback: options.context.addToPlayback
                },{
                    index: 1,
                    separator: true
                }]
        }

        const pathContextMenuRemove = {
            contextmenu: true,
            contextmenuInheritItems: true,
            contextmenuItems: [{
                    text: 'Remove From Playback',
                    index: 0,
                    context: options.context,
                    callback: options.context.removeFromPlayback
                },{
                    index: 1,
                    separator: true
                }]
        }

        // Single-pass extraction of the three arrays needed below —
        // avoids three separate full iterations over the same path array.
        var pCoordinates = [], pLatlngs = [], pUnixtimes = []
        _.each(p, function(pt) {
            pCoordinates.push(pt.coordinates)
            pLatlngs.push(pt.latlng)
            pUnixtimes.push(pt.unixtime)
        })

        const geoJSON = {
            "type": "Feature",
            "geometry": {
              "type": "LineString",
              "coordinates": pLatlngs
            },
            "properties": {
                "title" : p[0]['id'],
                "prefix": p[0]['prefix'],
                "icon": p[0]['icon'],
                "path_options" : { "color" : options.context.convertHex(p[0]['color']) },
                "time": pUnixtimes
            }
        }

        // Ant Path
        if(!_.isNull(p[0]['antPath']) && options.context.isArgTrue(p[0]['antPath'])) {
            let antPathOptions = {
                                        color: options.context.convertHex(p[0]['color']),
                                        weight: p[0]['pathWeight'],
                                        opacity: p[0]['pathOpacity'],
                                        "delay": p[0]['antPathDelay'],
                                        "dashArray": options.context.stringToPoint(p[0]['antPathDashArray']),
                                        "pulseColor": p[0]['antPathPulseColor'],
                                        "paused": p[0]['antPathPaused'],
                                        "reverse": p[0]['antPathReverse']
                                    }

            // Bind appropriate context menu for playback
            if(options.context.contextMenuEnabled && options.context.isArgTrue(p[0]['showPlayback'])) {  
                if(options.context.isArgTrue(p[0]['playback'])) {
                    _.defaults(antPathOptions, pathContextMenuRemove)
                } else {
                    _.defaults(antPathOptions, pathContextMenuAdd)
                }
            }
            
            var pl = L.polyline.antPath(pCoordinates, antPathOptions).bindPopup(p[0]['description'])
        } else {
            let pathOptions = { 
                color: options.context.convertHex(p[0]['color']),
                weight: p[0]['pathWeight'],
                opacity: p[0]['pathOpacity']
            }

            // Bind appropriate context menu for playback
            if(options.context.contextMenuEnabled && options.context.isArgTrue(p[0]['showPlayback'])) {  
                if(options.context.isArgTrue(p[0]['playback'])) {
                    _.defaults(pathOptions, pathContextMenuRemove)
                } else {
                    _.defaults(pathOptions, pathContextMenuAdd)
                }
            }

            // create polyline and bind popup
            var pl = L.polyline(pCoordinates, pathOptions).bindPopup(p[0]['description'])
        }

        // Apply tooltip to polyline
        if(p[0]['tooltip'] != "") {
            pl.bindTooltip(p[0]['tooltip'], {permanent: p[0]['permanentTooltip'],
                                             direction: 'auto',
                                             sticky: p[0]['stickyTooltip']})
        }

        pl.options.geoJSON = geoJSON
        pl.options.playback = options.context.isArgTrue(p[0]['playback'])
        pl.options.pathContextMenuAdd = pathContextMenuAdd
        pl.options.pathContextMenuRemove = pathContextMenuRemove

        // Add polyline to feature group
        pathFg.addLayer(pl)
    })
},

// Create a control icon and description in the layer control legend
addLayerToControl: function(options) {
    let name,
        iconHtml,
        styleColor = _.has(options.layerGroup, 'layerIconColor') ? options.layerGroup.layerIconColor:undefined,
        layerIconSize = _.has(options.layerGroup, 'layerIconSize') ? this.stringToPoint(options.layerGroup.layerIconSize):undefined

    // Add Heatmap layer to controls and use layer name for control label
    if(options.layerType == "heat" || options.layerType == "path" || options.layerType == "feature") {
        // Exclude layer from layer controls
        if(_.has(options.featureGroup.options, "layerInclude") && !options.featureGroup.options.layerInclude) { return }

        if(_.has(options.featureGroup.options, "layerDescription") && options.featureGroup.options.layerDescription != "") {
            name = options.featureGroup.options.layerDescription
        } else {
            name = _.has(options.featureGroup.options, "name") ? options.featureGroup.options.name : name
        }

        options.control.addOverlay(options.featureGroup, name)
        if(_.has(options.featureGroup.options, "layerVisibility") && !options.featureGroup.options.layerVisibility) { 
            options.featureGroup.remove()
        }
        return
    }

    if(!options.layerGroup.layerExists) {
        // Cluster group with assigned color: render colored SVG dot + name
        if (options.layerGroup.clusterColor) {
            var cgLabel = options.layerGroup.layerDescription || options.layerGroup.name || ""
            iconHtml = '<svg width="12" height="12" style="margin-right:4px;vertical-align:middle"><circle cx="6" cy="6" r="6" fill="' + options.layerGroup.clusterColor + '"/></svg>' + cgLabel
        // Circle Marker
        } else if(_.has(options.layerGroup.circle, "fillColor")) {
            styleColor = options.layerGroup.circle.fillColor
            iconHtml = "<i class=\"legend-toggle-icon fa fa-" + options.layerGroup.layerIcon + "\" style=\"color: " + options.layerGroup.circle.fillColor + "\"></i> " + options.layerGroup.layerDescription 
        } else {
            // Custom Icon
            if(_.has(options.layerGroup.icon.options, 'iconUrl')) {
                iconHtml = '<img src="' + options.layerGroup.icon.options.iconUrl + '" style="height: ' + layerIconSize[0] + 'px; width: ' + layerIconSize[1] + 'px">' + options.layerGroup.layerDescription
            }
            
            // Awesome Marker, Vector Marker or Icon only
            if(options.layerGroup.icon.options.className == "awesome-marker" || options.layerGroup.icon.options.className == "vector-marker" || options.layerGroup.icon.options.className == "icon-only") {
                if(options.layerGroup.layerIconPrefix == "fab") {
                    iconHtml = "<i class=\"legend-toggle-icon " + options.layerGroup.layerIconPrefix + " fa-" + options.layerGroup.layerIcon + "\" style=\"color: " + styleColor + "\"></i> " + options.layerGroup.layerDescription
                } else {
                    iconHtml = "<i class=\"legend-toggle-icon " + options.layerGroup.layerIconPrefix + " " + options.layerGroup.layerIconPrefix + "-" + options.layerGroup.layerIcon + "\" style=\"color: " + styleColor + "\"></i> " + options.layerGroup.layerDescription
                }
            }
        }

        // Fallback for marker types that do not match any icon branch (e.g. milsymbol DivIcon):
        // build label from layerIcon (FA name) + layerDescription so control never shows undefined.
        if (_.isUndefined(iconHtml)) {
            var label = options.layerGroup.layerDescription || options.layerGroup.name || ""
            if (options.layerGroup.layerIcon) {
                var iconColor = styleColor || options.layerGroup.clusterColor || options.layerGroup.layerIconColor || "#333"
                iconHtml = "<i class=\"legend-toggle-icon fa fa-" + options.layerGroup.layerIcon + "\" style=\"color: " + iconColor + "\"></i> " + label
            } else if (options.layerGroup.clusterColor) {
                iconHtml = '<svg width="12" height="12" style="margin-right:4px;vertical-align:middle"><circle cx="6" cy="6" r="6" fill="' + options.layerGroup.clusterColor + '"/></svg>' + label
            } else {
                iconHtml = label
            }
        }
        options.control.addOverlay(options.layerGroup.group, iconHtml)
        if(!options.layerGroup.layerVisibility) {
          options.layerGroup.group.remove()
        }
        options.layerGroup.layerExists = true
    }

},

// Show dialog box with pointer lat/lon and center lat/lon
// coordinates. Allow user to copy and paste center coordinates into 
// Center Lat and Center Lon format menu options.
showCoordinates: function (e) {
    var coordinates = e.latlng.toString().match(/([-\d\.]+)/g)
    var centerCoordinates = this.map.getCenter().toString().match(/([-\d\.]+)/g)
    var curZoom = this.map.getZoom()    
    var content = "Pointer Latitude: <input type=\"text\" name=\"pointer_lat\" value=\"" + coordinates[0] + "\">" +
          "<br>Pointer Longitude: <input type=\"text\" name=\"pointer_long\" value=\"" + coordinates[1] + "\">" +
          "<br>Zoom Level: <input type=\"text\" name=\"zoom_level\" value=\"" + curZoom + "\">" +
          "<br></br>Copy and paste the following values into Format menu to change <b>Center Lat</b> and <b>Center Lon</b> (visualization API does not currently support programmatically setting format menu options):<br>" +
          "<br>Center Latitude: <input type=\"text\" name=\"center_lat\" value=\"" + centerCoordinates[0] + "\">" +
          "<br>Center Longitude: <input type=\"text\" name=\"center_lon\" value=\"" + centerCoordinates[1] + "\">"

    var coordDialog = this.coordDialog = L.control.dialog({size: [300,435], 
            minSize: [100,100], 
            maxSize: [350,500], 
            position: 'topleft', 
            anchor: [100, 500],
            initOpen: true
        })
        .setContent(content)
        .addTo(this.map)
        .open()
    },

addToPlayback: function(e) {
    if(this.playback._showPlayback) {
        _.each(this.pathLineLayers, function(l, i){                   
            l.eachLayer(function(layer) {
                if(layer.options.geoJSON.properties.title === this.contextMenuTarget.options.geoJSON.properties.title && !this.isArgTrue(layer.options.playback)) {
                    if(_.has(layer, '_animatedPathClass')) { 
                        layer.eachLayer(function(p) {
                            p.unbindContextMenu()    
                            p.bindContextMenu(this.contextMenuTarget.options.pathContextMenuRemove)
                        }, this)
                    }  else {
                        layer.unbindContextMenu()
                        layer.bindContextMenu(this.contextMenuTarget.options.pathContextMenuRemove)
                    }
                    layer.options.playback = true
                    this.playback.updateData(this.contextMenuTarget.options.geoJSON)
                }
            }, this)
         }, this)

        this.updatePlaybackControls()
    }
},

resetPlayback: function(e) {
    this.playback.clearData()

    _.each(this.pathLineLayers, function(l, i){                   
        l.eachLayer(function(layer) {
            if(layer.options.playback) {
                this.playback.updateData(layer.options.geoJSON)
            }
        }, this)
    }, this)

    this.updatePlaybackControls()
}, 

clearPlayback: function(e) {
    _.each(this.pathLineLayers, function(l, i){
        l.eachLayer(function(layer) {
            layer.options.playback = false

            if(_.has(layer, '_animatedPathClass')) { 
                layer.eachLayer(function(p) {
                    p.unbindContextMenu()    
                    p.bindContextMenu(layer.options.pathContextMenuAdd)
                }, this)
            }  else {
                layer.unbindContextMenu()
                layer.bindContextMenu(layer.options.pathContextMenuAdd)
            }
        }, this)
     }, this)

    this.playback.clearData()
    this.updatePlaybackControls()
},

addAllToPlayback: function(e) {
    this.playback.clearData()
    
    _.each(this.pathLineLayers, function(l, i){                   
        l.eachLayer(function(layer) {
            this.playback.updateData(layer.options.geoJSON)
            layer.options.playback = true

            if(_.has(layer, '_animatedPathClass')) { 
                layer.eachLayer(function(p) {
                    p.unbindContextMenu()    
                    p.bindContextMenu(layer.options.pathContextMenuRemove)
                }, this)
            }  else {
                layer.unbindContextMenu()
                layer.bindContextMenu(layer.options.pathContextMenuRemove)
            }
        }, this)
    }, this)

    this.updatePlaybackControls()
},

removeFromPlayback: function(e) {
    if(this.playback._showPlayback) {
        _.each(this.pathLineLayers, function(l, i){                   
            l.eachLayer(function(layer) {
                if(layer.options.geoJSON.properties.title === this.contextMenuTarget.options.geoJSON.properties.title) {
                    layer.options.playback = false
                    this.playback.removeData(this.contextMenuTarget)

                    if(_.has(layer, '_animatedPathClass')) { 
                        layer.eachLayer(function(p) {
                            p.unbindContextMenu()    
                            p.bindContextMenu(this.contextMenuTarget.options.pathContextMenuAdd)
                        }, this)
                    }  else {
                        layer.unbindContextMenu()
                        layer.bindContextMenu(this.contextMenuTarget.options.pathContextMenuAdd)
                    }
                }
            }, this)
        }, this)
     }

    this.updatePlaybackControls()
 },

updatePlaybackControls: function() {
    this.playback.setCursor(this.playback.getStartTime())
    this.playback.hideControls()
    this.playback.showControls()
    if(this.isDarkTheme) { this._darkModeUpdate() }
},

centerMap: function (e) {
    this.map.panTo(e.latlng)
},

zoomIn: function (e) {
    this.map.zoomIn()
},

zoomOut: function (e) {
    this.map.zoomOut()
},

fitLayerBounds: function (options) {
    var map = _.isUndefined(options.map) ? this.map:options.map
    var layerFilter = _.isUndefined(options.layerFilter) ? this.layerFilter:options.layerFilter
    var pathLineLayers = _.isUndefined(options.pathLineLayers) ? this.pathLineLayers:options.pathLineLayers
    var heatLayers = _.isUndefined(options.heatLayers) ? this.heatLayers:options.heatLayers
    var featureLayers = _.isUndefined(options.featureLayers) ? this.featureLayers:options.featureLayers
    var tmpGroup = new L.featureGroup()
    var layers = [layerFilter, pathLineLayers, heatLayers, featureLayers]

    // loop through layers and build one big feature group to fit bounds against
    _.each(layers, function(l, i) {
        if(!_.isEmpty(l)) {
            _.each(l, function(lg, i) {
                // It's a normal feature group or cluster feature group
                if(!_.isUndefined(lg.group)) {
                    tmpGroup.addLayer(lg.group)
                    return
                }

                // It's a path or heatmap
                var curLayers = lg.getLayers()
                _.each(curLayers, function(cl, i) {
                    tmpGroup.addLayer(cl)
                })
            })
        }
    })
    
    map.fitBounds(tmpGroup.getBounds())
},

// Fetch KMZ or KML files and add to map
fetchKmlAndMap: function(url, file, fg, paneZIndex) {
    var self = this

    // Shared style + feature callbacks — used by both KMZ and KML code paths
    var kmlStyle = function(feature) {
        var p = feature.properties || {}
        return {
            color:       _.has(p, 'stroke')         ? p['stroke']         : '#3388ff',
            weight:      _.has(p, 'stroke-width')   ? p['stroke-width']   : 2,
            opacity:     _.has(p, 'stroke-opacity') ? p['stroke-opacity'] : 1.0,
            fillColor:   _.has(p, 'fill')           ? p['fill']           : '#3388ff',
            fillOpacity: _.has(p, 'fill-opacity')   ? p['fill-opacity']   : 0.2
        }
    }

    // Filter out features whose coordinates contain undefined/NaN values.
    // JSON.stringify coerces both to null, so a 'null' hit flags invalid geometry.
    var kmlValidFeatures = function(features) {
        return (features || []).filter(function(f) {
            if (!f || !f.geometry || !f.geometry.coordinates) return false
            var s = JSON.stringify(f.geometry.coordinates)
            return s && s.indexOf('null') === -1
        })
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
                // DOMParser is more lenient than $.parseXML — handles BOM and encoding edge cases
                var kmlDom = new DOMParser().parseFromString(text.replace(/^\uFEFF/, ''), 'application/xml')
                if (kmlDom.querySelector('parsererror')) { throw new Error('Maps+: KML parse error inside KMZ: ' + url) }
                var geojson = toGeoJSON.kml(kmlDom)
                L.geoJson(kmlValidFeatures(geojson.features), {
                    style: kmlStyle,
                    onEachFeature: kmlOnEachFeature
                }).addTo(fg)
            })
            .catch(function(err) {
                console.error('Maps+: Error processing KMZ overlay from ' + url, err)
            })
        })
    } else {
        // Fetch as text so jQuery doesn't run its strict XML parser before we can clean the response.
        // DOMParser handles UTF-8 BOM and encoding edge cases that $.parseXML rejects.
        $.ajax({url: url, dataType: 'text', context: this})
        .done(function(responseText) {
            var kml = new DOMParser().parseFromString(responseText.replace(/^\uFEFF/, ''), 'application/xml')
            if (kml.querySelector('parsererror')) {
                console.error('Maps+: Failed to parse KML from ' + url)
                return
            }
            var geojson = toGeoJSON.kml(kml)
            L.geoJson(kmlValidFeatures(geojson.features), {
                style: kmlStyle,
                onEachFeature: kmlOnEachFeature
            }).addTo(fg)
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
            console.error('Maps+: Failed to load KML overlay from ' + url + ' (' + textStatus + ')', errorThrown)
        })
    }
},

_setFullScreenMode: function(map, options) {
    var vh = $(window).height() - 120
    $("div[data-cid=" + options.parentEl + "]").css("height", vh)

    $(window).resize(function() {
        var vh = $(window).height() - 120
        $("div[data-cid=" + options.parentEl + "]").css("height", vh)
    })
    map.invalidateSize()
},

_setDefaultHeight: function(map, options) {
    $("div[data-cid=" + options.parentEl + "]").css("height", options.defaultHeight)
    map.invalidateSize()
},

_createClusterGroup: function(disableClusteringAtZoom,
                              disableClusteringAtZoomLevel,
                              maxClusterRadius,
                              maxSpiderfySize,
                              spiderfyDistanceMultiplier,
                              singleMarkerMode,
                              animate,
                              criticalThreshold,
                              warningThreshold,
                              antarcticProj,
                              cgBgColor,
                              cgFgColor,
                              safeGroupName,
                              context) {

    // Redefine spiderfy and extend it
    L.MarkerCluster.include({
        spiderfy: function () {
            if (this._group._spiderfied === this || this._group._inZoomAnimation) {
                return
            }

            var childMarkers = this.getAllChildMarkers(),
                group = this._group,
                map = group._map,
                center = map.latLngToLayerPoint(this._latlng),
                positions

            // Don't spiderfy cluster groups that exeed warning size
            if (childMarkers.length > this._group.options.maxSpiderfySize) {
                return context.renderModal("cluster-warning",
                                           $.i18n('cluster-warning'),
                                           "<div class=\"alert alert-warning\"><i class=\"icon-alert\"></i>" + $.i18n('cluster-message', childMarkers.length, this._group.options.maxSpiderfySize) + "</div>",
                                           $.i18n('cluster-warning-close'))
            }
            
            this._group._unspiderfy()
            this._group._spiderfied = this

            //TODO Maybe: childMarkers order by distance to center

            if (childMarkers.length >= this._circleSpiralSwitchover) {
                positions = this._generatePointsSpiral(childMarkers.length, center)
            } else {
                center.y += 10 // Otherwise circles look wrong => hack for standard blue icon, renders differently for other icons.
                positions = this._generatePointsCircle(childMarkers.length, center)
            }

            this._animationSpiderfy(childMarkers, positions)
        }
    })

    // Inject per-group cluster CSS if colors are configured
    if (cgBgColor && cgFgColor) {
        context.createMarkerStyleFromColor(cgBgColor, cgFgColor, safeGroupName)
    }

    var mcg = new L.MarkerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: maxClusterRadius,
        maxSpiderfySize: maxSpiderfySize,
        spiderfyDistanceMultiplier: spiderfyDistanceMultiplier,
        removeOutsideVisibleBounds: true,
        singleMarkerMode: (this.isArgTrue(singleMarkerMode)),
        animate: (this.isArgTrue(animate)),
        iconCreateFunction: function(cluster) {
            var childCount = cluster.getChildCount()
            // Use per-group color class when configured; fall back to threshold classes
            if (cgBgColor) {
                return new L.DivIcon({ html: '<div><span><b>' + childCount + '</span></div></b>', className: 'marker-cluster marker-cluster-' + safeGroupName, iconSize: new L.Point(40, 40) })
            }
            var c = ' marker-cluster-'
            if (childCount >= criticalThreshold) {
                c += 'three'
            } else if (childCount >= warningThreshold) {
                c += 'two'
            } else {
                c += 'one'
            }
            return new L.DivIcon({ html: '<div><span><b>' + childCount + '</span></div></b>', className: 'marker-cluster' + c, iconSize: new L.Point(40, 40) })
        }
    })

    if(this.isArgTrue(antarcticProj)) {
        mcg.options.removeOutsideVisibleBounds = false
    }
   
    if(this.isArgTrue(disableClusteringAtZoom)) {
        mcg.options.disableClusteringAtZoom = disableClusteringAtZoomLevel
        mcg.options.spiderfyOnMaxZoom = false
    }

    return mcg
},

// ─── Milsymbol zoom-scaling helper ───────────────────────────────────────────
// Builds a Leaflet divIcon from raw milsymbol userData at a given size.
// Extracted so the zoomend redraw and the initial render share identical logic.
// Results are cached per render cycle (cache is reset at the top of updateView)
// keyed on a JSON hash of the inputs, so identical symbols share one SVG build.
_buildMilsymbolIcon: function(userData, overrideSize, renderer, msColorMode, msFrameColor, msIconColor, msInfoColor, msInfoBackground, msInfoBackgroundFrame, msOutlineColor, msStandard) {
    // Cache lookup — avoids redundant ms.Symbol() SVG generation for duplicate rows
    if(!this._milsymbolIconCache) { this._milsymbolIconCache = {} }
    var cacheKey = JSON.stringify([userData, overrideSize, renderer, msColorMode])
    if(this._milsymbolIconCache[cacheKey]) { return this._milsymbolIconCache[cacheKey] }

    var msSidc                = _.has(userData, "msSidc")                ? userData["msSidc"]                : ""
    var msAdditionalInformation = _.has(userData, "msAdditionalInformation") ? userData["msAdditionalInformation"] : ""
    var msAltitudeDepth       = _.has(userData, "msAltitudeDepth")       ? userData["msAltitudeDepth"]       : ""
    var msCombatEffectiveness = _.has(userData, "msCombatEffectiveness") ? userData["msCombatEffectiveness"] : ""
    var msCommonIdentifier    = _.has(userData, "msCommonIdentifier")    ? userData["msCommonIdentifier"]    : ""
    var msCountry             = _.has(userData, "msCountry")             ? userData["msCountry"]             : ""
    var msDirection           = _.has(userData, "msDirection")           ? parseFloat(userData["msDirection"])        : ""
    var msDtg                 = _.has(userData, "msDtg")                 ? userData["msDtg"]                 : ""
    var msEngagementBar       = _.has(userData, "msEngagementBar")       ? userData["msEngagementBar"]       : ""
    var msEngagementType      = _.has(userData, "msEngagementType")      ? userData["msEngagementType"]      : ""
    var msEquipmentTeardownTime = _.has(userData, "msEquipmentTeardownTime") ? userData["msEquipmentTeardownTime"] : ""
    var msEvaluationRating    = _.has(userData, "msEvaluationRating")    ? userData["msEvaluationRating"]    : ""
    var msGuardedUnit         = _.has(userData, "msGuardedUnit")         ? userData["msGuardedUnit"]         : ""
    var msHeadquartersElement = _.has(userData, "msHeadquartersElement") ? userData["msHeadquartersElement"] : ""
    var msHigherFormation     = _.has(userData, "msHigherFormation")     ? userData["msHigherFormation"]     : ""
    var msHostile             = _.has(userData, "msHostile")             ? userData["msHostile"]             : ""
    var msIffSif              = _.has(userData, "msIffSif")              ? userData["msIffSif"]              : ""
    var msLocation            = _.has(userData, "msLocation")            ? userData["msLocation"]            : ""
    var msPlatformType        = _.has(userData, "msPlatformType")        ? userData["msPlatformType"]        : ""
    var msQuantity            = _.has(userData, "msQuantity")            ? userData["msQuantity"]            : ""
    var msReinforcedReduced   = _.has(userData, "msReinforcedReduced")   ? userData["msReinforcedReduced"]   : ""
    var msSigint              = _.has(userData, "msSigint")              ? userData["msSigint"]              : ""
    var msSpecialDesignator   = _.has(userData, "msSpecialDesignator")   ? userData["msSpecialDesignator"]   : ""
    var msSignatureEquipment  = _.has(userData, "msSignatureEquipment")  ? userData["msSignatureEquipment"]  : ""
    var msSpecialHeadquarters = _.has(userData, "msSpecialHeadquarters") ? userData["msSpecialHeadquarters"] : ""
    var msSpeed               = _.has(userData, "msSpeed")               ? userData["msSpeed"]               : ""
    var msSpeedLeader         = _.has(userData, "msSpeedLeader")         ? userData["msSpeedLeader"]         : 0
    var msStaffComments       = _.has(userData, "msStaffComments")       ? userData["msStaffComments"]       : ""
    var msTargetNumber        = _.has(userData, "msTargetNumber")        ? userData["msTargetNumber"]        : ""
    var msType                = _.has(userData, "msType")                ? userData["msType"]                : ""
    var msUniqueDesignation   = _.has(userData, "msUniqueDesignation")   ? userData["msUniqueDesignation"]   : ""
    var msAlternateMedal      = _.has(userData, "msAlternateMedal")      ? this.isArgTrue(userData["msAlternateMedal"])      : false
    var msCivilianColor       = _.has(userData, "msCivilianColor")       ? this.isArgTrue(userData["msCivilianColor"])       : true
    var resolvedColorMode     = _.has(userData, "msColorMode")           ? userData["msColorMode"]           : msColorMode
    var msFill                = _.has(userData, "msFill")                ? this.isArgTrue(userData["msFill"])                : true
    var msFillOpacity         = _.has(userData, "msFillOpacity")         ? userData["msFillOpacity"]         : 1
    var msFontfamily          = _.has(userData, "msFontfamily")          ? userData["msFontfamily"]          : "Arial"
    var msFrame               = _.has(userData, "msFrame")               ? this.isArgTrue(userData["msFrame"])               : true
    var resolvedFrameColor    = _.has(userData, "msFrameColor")          ? _.extend(msFrameColor, this._stringToJSON(userData["msFrameColor"])) : msFrameColor
    var msHqStaffLength       = _.has(userData, "msHqStaffLength")       ? userData["msHqStaffLength"]       : ""
    var msIcon                = _.has(userData, "msIcon")                ? this.isArgTrue(userData["msIcon"])                : true
    var resolvedInfoBackground      = _.has(userData, "msInfoBackground")      ? _.extend(_.isUndefined(msInfoBackground) ? {} : msInfoBackground, this._stringToJSON(userData["msInfoBackground"]))           : msInfoBackground
    var resolvedInfoBackgroundFrame = _.has(userData, "msInfoBackgroundFrame") ? _.extend(_.isUndefined(msInfoBackgroundFrame) ? {} : msInfoBackgroundFrame, this._stringToJSON(userData["msInfoBackgroundFrame"])) : msInfoBackgroundFrame
    var resolvedIconColor     = _.has(userData, "msIconColor")           ? _.extend(_.isUndefined(msIconColor) ? {} : msIconColor, this._stringToJSON(userData["msIconColor"]))   : msIconColor
    var resolvedInfoColor     = _.has(userData, "msInfoColor")           ? _.extend(_.isUndefined(msInfoColor) ? {} : msInfoColor, this._stringToJSON(userData["msInfoColor"]))   : msInfoColor
    var msOutlineWidth        = _.has(userData, "msOutlineWidth")        ? userData["msOutlineWidth"]        : 0
    var msPadding             = _.has(userData, "msPadding")             ? userData["msPadding"]             : 0
    var msSimpleStatusModifier = _.has(userData, "msSimpleStatusModifier") ? this.isArgTrue(userData["msSimpleStatusModifier"]) : false
    var resolvedStandard      = _.has(userData, "msStandard")            ? userData["msStandard"]            : msStandard
    var msSquare              = _.has(userData, "msSquare")              ? this.isArgTrue(userData["msSquare"])              : false
    var msStrokeWidth         = _.has(userData, "msStrokeWidth")         ? userData["msStrokeWidth"]         : 3
    var resolvedOutlineColor  = _.has(userData, "msOutlineColor")        ? _.extend(_.isUndefined(msOutlineColor) ? {} : msOutlineColor, this._stringToJSON(userData["msOutlineColor"])) : msOutlineColor

    // Suppress modifier text labels at low zoom to prevent crowding.
    // Per-marker msInfoFields overrides the zoom-based default.
    // Threshold is proportional to baseSize: labels appear when the rendered
    // symbol is at least 85% of its native size — i.e. at or above BASE_ZOOM.
    // This ensures small/medium/large all get the same zoom-level behaviour.
    var zoomInfoFields
    if (_.has(userData, "msInfoFields")) {
        zoomInfoFields = this.isArgTrue(userData["msInfoFields"])
    } else {
        var msBaseForThreshold = _.has(userData, "msSize") ? parseFloat(userData["msSize"]) : 35
        zoomInfoFields = overrideSize >= Math.round(msBaseForThreshold * 0.85)
    }

    // Scale modifier text (infoSize) proportionally with the rendered symbol size.
    // milsymbol's infoSize default of 40 is designed for large standalone symbols —
    // for map overlays it produces text nearly as tall as the symbol frame, which
    // causes crowding when symbols are geographically close. We use 25 as the native
    // cap (what you get at base zoom with full-size symbols), and scale down from
    // there as zoom decreases. Text never grows larger than 25 regardless of zoom.
    // Per-marker msInfoSize field overrides this calculation entirely.
    var msBaseForInfoSize = _.has(userData, "msSize") ? parseFloat(userData["msSize"]) : 35
    var msInfoSize
    if (_.has(userData, "msInfoSize")) {
        msInfoSize = userData["msInfoSize"]
    } else {
        var infoSizeRatio = overrideSize / msBaseForInfoSize
        var scaledInfoSize = Math.round(25 * infoSizeRatio)
        msInfoSize = Math.min(scaledInfoSize, 25)  // cap at 25 — never grows at high zoom
    }

    var sym = new ms.Symbol(msSidc, {
        additionalInformation: msAdditionalInformation,
        altitudeDepth:         msAltitudeDepth,
        combatEffectiveness:   msCombatEffectiveness,
        commonIdentifier:      msCommonIdentifier,
        country:               msCountry,
        direction:             isNaN(msDirection) ? "" : msDirection,
        dtg:                   msDtg,
        engagementBar:         msEngagementBar,
        engagementType:        msEngagementType,
        equipmentTeardownTime: msEquipmentTeardownTime,
        evaluationRating:      msEvaluationRating,
        guardedUnit:           msGuardedUnit,
        headquartersElement:   msHeadquartersElement,
        higherFormation:       msHigherFormation,
        hostile:               msHostile,
        iffSif:                msIffSif,
        location:              msLocation,
        platformType:          msPlatformType,
        quantity:              msQuantity,
        reinforcedReduced:     msReinforcedReduced,
        sigint:                msSigint,
        specialDesignator:     msSpecialDesignator,
        signatureEquipment:    msSignatureEquipment,
        specialHeadquarters:   msSpecialHeadquarters,
        speed:                 msSpeed,
        speedLeader:           msSpeedLeader,
        staffComments:         msStaffComments,
        targetNumber:          msTargetNumber,
        type:                  msType,
        uniqueDesignation:     msUniqueDesignation,
        alternateMedal:        msAlternateMedal,
        civilianColor:         msCivilianColor,
        colorMode:             resolvedColorMode,
        fill:                  msFill,
        fillOpacity:           msFillOpacity,
        fontfamily:            msFontfamily,
        frame:                 msFrame,
        frameColor:            resolvedFrameColor,
        hqStaffLength:         msHqStaffLength,
        icon:                  msIcon,
        infoBackground:        resolvedInfoBackground,
        infoBackgroundFrame:   resolvedInfoBackgroundFrame,
        iconColor:             resolvedIconColor,
        infoColor:             resolvedInfoColor,
        infoFields:            zoomInfoFields,
        infoSize:              msInfoSize,
        monoColor:             _.has(userData, "msMonoColor") ? userData["msMonoColor"] : "",
        outlineColor:          resolvedOutlineColor,
        outlineWidth:          msOutlineWidth,
        padding:               msPadding,
        size:                  overrideSize,
        simpleStatusModifier:  msSimpleStatusModifier,
        standard:              resolvedStandard,
        square:                msSquare,
        strokeWidth:           msStrokeWidth
    })

    var symSize = sym.getSize()
    var icon = L.divIcon({
        html:       renderer === "canvas" ? sym.asCanvas() : sym.asSVG(),
        className:  "",
        iconSize:   [symSize.width, symSize.height],
        iconAnchor: [symSize.width / 2, symSize.height]
    })
    this._milsymbolIconCache[cacheKey] = icon
    return icon
},

// ─── Compute a zoom-proportional milsymbol size ───────────────────────────────
// Base: the size stored on the marker's userData (or 35 if absent), anchored
// at zoom 12.  Each zoom step doubles/halves the visual scale.
// Clamped to [8, 150] so symbols stay visible but never fill the screen.
_getMilsymbolSizeForZoom: function(baseSize, zoom) {
    // Anchor: baseSize renders at its native value at zoom 13 (operational level).
    // Scale factor 1.5 per zoom step gives gentler growth than true map doubling.
    // Floor and ceiling scale proportionally with baseSize so that the chosen
    // symbol size (small/medium/large) behaves consistently at all zoom levels —
    // a user who picks "large" gets proportionally larger symbols throughout,
    // not just at the native zoom.
    var BASE_ZOOM = 13
    var SCALE_FACTOR = 1.4   // gentler per-step growth than 1.5
    var floor   = Math.round(baseSize * 0.55)   // ~55% of baseSize — min readable shape
    var ceiling = Math.round(baseSize * 1.5)     // 1.5x baseSize — symbols stay compact at high zoom
    var size = baseSize * Math.pow(SCALE_FACTOR, zoom - BASE_ZOOM)
    return Math.min(Math.max(Math.round(size), floor), ceiling)
},

_addMarker: function(options) {
    if(options.markerType == "circle") {
        var marker = L.circleMarker([parseFloat(options.userData["latitude"]),
                                     parseFloat(options.userData["longitude"])],
                                      {radius: options.radius,
                                       color: options.color,
                                       weight: options.weight,
                                       stroke: options.stroke,
                                       opacity: options.opacity,
                                       fillColor: options.fillColor,
                                       fillOpacity: options.fillOpacity,                                    
                                       contextmenu: true,
                                       contextmenuItems: [{
                                            text: 'Circle item',
                                            index: 0
                                        }, {
                                            separator: true,
                                            index: 1
                                        }]
                                    })
        if (!_.isUndefined(options.layerFilter[options.layerGroup])) {                
            options.layerFilter[options.layerGroup].circle = {radius: options.radius,
                color: options.color,
                weight: options.weight,
                stroke: options.stroke,
                opacity: options.opacity,
                fillColor: options.fillColor,
                fillOpacity: options.fillOpacity,
                layerPriority: options.layerPriority}
        }                                               
    } else {
        var marker = L.marker([parseFloat(options.userData['latitude']),
                               parseFloat(options.userData['longitude'])],
                               {icon: options.markerIcon,
                                layerDescription: options.layerDescription,
                                zIndexOffset: options.markerPriority,
                                contextmenu: true,
                                contextmenuItems: [{
                                    text: 'Marker item',
                                    index: 0
                                }, {
                                    separator: true,
                                    index: 1
                                }]})                
    }

    if (!_.isUndefined(options.layerFilter[options.layerGroup]) && !_.isUndefined(options.markerIcon)) {                
        options.layerFilter[options.layerGroup].icon = options.markerIcon
    }

    // Tag milsymbol markers so the zoomend handler can redraw them at the correct size
    if(options.markerType === "milsymbol") {
        marker._isMilsymbol = true
        marker._milsymbolUserData = options.userData
        marker._milsymbolBaseSize = _.has(options.userData, "msSize") ? parseFloat(options.userData["msSize"]) : 35
    }

    // Bind tooltip: default tooltip field, fallback to title field for backwards compatibility
    if(options.tooltip) {
        marker.bindTooltip(options.tooltip, {permanent: options.permanentTooltip,
                                             direction: 'auto',
                                             sticky: options.stickyTooltip})
    } else if (options.title) {
        marker.bindTooltip(options.title, {permanent: options.permanentTooltip,
                                           direction: 'auto',
                                           sticky: options.stickyTooltip})
    }

    if(this.isArgTrue(options.drilldown)) {
        var drilldownFields = this.validateFields(options.userData)
        // iOS doesn't fire native dblclick; use a timestamp-based double-tap
        // detector on touch devices so drilldown works when a tooltip is bound.
        if(options.drilldownAction === 'dblclick' && L.Browser.touch) {
            var lastTap = 0
            marker.on('click', function() {
                var now = Date.now()
                if(now - lastTap < 350) { this._drilldown(drilldownFields) }
                lastTap = now
            }.bind(this))
        } else {
            marker.on(options.drilldownAction, this._drilldown.bind(this, drilldownFields))
        }
    }

    // Bind description popup if description exists
    if(_.has(options.userData, "description") && !_.isEmpty(options.userData["description"])) {
        marker.bindPopup(options.userData['description'])
    }

    if (options.cluster) {           
        _.findWhere(options.layerFilter[options.layerGroup].clusterGroup, {groupName: options.clusterGroup}).markerList.push(marker)
    } else {
        options.layerFilter[options.layerGroup].markerList.push(marker)
    }
},

_addClustered: function(map, options) {
    // Process layers
    _.each(options.layerFilter, function(lg, i) {
        if(!_.isEmpty(lg.clusterGroup) && !_.isEmpty(lg.clusterGroup[0].markerList)) {
            // Process cluster groups
            _.each(lg.clusterGroup, function(cg, i) {                        
                this.tmpFG = L.featureGroup.subGroup(cg.cg, cg.markerList)
                lg.group.addLayer(this.tmpFG)
            })

            lg.group.addTo(map)
            
            if(options.layerControl) {
                options.context.addLayerToControl({layerGroup: lg, control: options.control})
            }
        }
    })
},

_addUnclustered: function(map, options) {
    _.chain(options.layerFilter)
    .sortBy(function(d) {
        if(_.has(d.circle, "layerPriority") && !_.isUndefined(d.circle.layerPriority)){
            return +d.circle.layerPriority
        } else {
            return d
        }                
    })
    .each(function(lg) {
        if(!_.isEmpty(lg.markerList)) {
            if(_.has(lg.circle, "layerPriority") && !_.isUndefined(lg.circle.layerPriority)){
                map.createPane(options.paneZIndex.toString())
                map.getPane(options.paneZIndex.toString()).style.zIndex = options.paneZIndexs
            }

            // Loop through markers and add to map
            _.each(lg.markerList, function(m) {                    
                if(options.allPopups) {
                    m.addTo(lg.group).bindPopup(m.options.icon.options.description).openPopup()
                } else {
                    m.addTo(lg.group)
                }
            })

            if(_.has(lg.circle, "layerPriority") && !_.isUndefined(lg.circle.layerPriority)){
                lg.group.setStyle({pane: options.paneZIndex.toString()})
                options.paneZIndex += 1
            }

            // Add layergroup to map
            lg.group.addTo(map)
            
            //options.paneZIndex += 1

            // Add layer controls
            if(options.layerControl) {
                options.context.addLayerToControl({layerGroup: lg, control: options.control})
            }
        }
    })
},

_renderLayersToMap: function(map, options) {
    _.chain(options.layers)
    .sortBy(function(d) {
        if(!_.isUndefined(d.options.layerPriority)){
            return +d.options.layerPriority
        } else {
            return d
        }
    })
    .each(function(lg) {
        // Create pane and set zIndex
        if(!_.isUndefined(lg.options.layerPriority)){
            let styleOptions = {pane: options.paneZIndex.toString(), 
                                renderer: L.svg({pane: options.paneZIndex.toString()})}

            map.createPane(options.paneZIndex.toString())
            map.getPane(options.paneZIndex.toString()).style.zIndex = options.paneZIndex
            lg.setStyle(styleOptions)
        }

        lg.eachLayer(function(l) {
            if(options.context.isArgTrue(l.options.playback)) { options.playback.updateData(l.options.geoJSON) }
        })                
        
        // Check if layer is already on the map, remove before re-adding
        if(map.hasLayer(lg)) {
            map.removeLayer(lg)
        }
        // Add layer controls
        lg.addTo(map)

        // Increment zIndex
        if(!_.isUndefined(lg.options.layerPriority)){ options.paneZIndex += 1 }

        // Add layer to control
        if(options.layerControl) {
            var layerOptions = {layerType: options.layerType,
                                featureGroup: lg,
                                control: options.control}
            options.context.addLayerToControl(layerOptions)   
        }
    })
},

formatData: function(data) {
    if(data.results.length == 0 && data.fields.length >= 1 && data.meta.done){
        this.allDataProcessed = true
        return this
    }
    
    if(data.results.length == 0)  {
        return this
    }

    this.allDataProcessed = false
    return data
},

// Do the work of creating the viz
updateView: function(data, config) {
    // viz gets passed empty config until you click the 'format' dropdown
    // intialize with defaults
    if(_.keys(config).length <= 1) {
        config = this.defaultConfig
    }

    // Clear per-render milsymbol icon cache — icons are keyed on a hash of
    // their inputs and rebuilt fresh each render cycle, but reused within it.
    this._milsymbolIconCache = {}

    // Populate any missing config values with defaults
    _.defaults(config, this.defaultConfig)

    // get configs
    var cluster     = parseInt(this._getEscapedProperty('cluster', config)),
        allPopups   = parseInt(this._getEscapedProperty('allPopups', config)),
        multiplePopups = parseInt(this._getEscapedProperty('multiplePopups', config)),
        animate     = parseInt(this._getEscapedProperty('animate', config)),
        singleMarkerMode = parseInt(this._getEscapedProperty('singleMarkerMode', config)),
        disableClusteringAtZoom = parseInt(this._getEscapedProperty('disableClusteringAtZoom', config)),
        disableClusteringAtZoomLevel = parseInt(this._getEscapedProperty('disableClusteringAtZoomLevel', config)),
        maxClusterRadius = parseInt(this._getEscapedProperty('maxClusterRadius', config)),
        maxSpiderfySize = parseInt(this._getEscapedProperty('maxSpiderfySize', config)),
        spiderfyDistanceMultiplier = parseInt(this._getEscapedProperty('spiderfyDistanceMultiplier', config)),
        mapTile     = SplunkVisualizationUtils.makeSafeUrl(this._getEscapedProperty('mapTile', config)),
        i18nLanguage     = SplunkVisualizationUtils.makeSafeUrl(this._getEscapedProperty('i18nLanguage', config)),
        mapTileOverride  = this._getSafeUrlProperty('mapTileOverride', config),
        mapAttributionOverride = this._getEscapedProperty('mapAttributionOverride', config),
        layerControl = parseInt(this._getEscapedProperty('layerControl', config)),
        layerControlCollapsed = parseInt(this._getEscapedProperty('layerControlCollapsed', config)),
        scrollWheelZoom = parseInt(this._getEscapedProperty('scrollWheelZoom', config)),
        fullScreen = parseInt(this._getEscapedProperty('fullScreen', config)),
        drilldown = parseInt(this._getEscapedProperty('drilldown', config)),
        drilldownAction = this._getEscapedProperty('drilldownAction', config),
        contextMenu = parseInt(this._getEscapedProperty('contextMenu', config)),
        defaultHeight = parseInt(this._getEscapedProperty('defaultHeight', config)),
        autoFitAndZoom = parseInt(this._getEscapedProperty('autoFitAndZoom', config)),
        autoFitAndZoomDelay = parseInt(this._getEscapedProperty('autoFitAndZoomDelay', config)),
        mapCenterZoom = parseInt(this._getEscapedProperty('mapCenterZoom', config)),
        mapCenterLat = parseFloat(this._getEscapedProperty('mapCenterLat', config)),
        mapCenterLon = parseFloat(this._getEscapedProperty('mapCenterLon', config)),
        minZoom     = parseInt(this._getEscapedProperty('minZoom', config)),
        maxZoom     = parseInt(this._getEscapedProperty('maxZoom', config)),
        permanentTooltip = parseInt(this._getEscapedProperty('permanentTooltip', config)),
        stickyTooltip = parseInt(this._getEscapedProperty('stickyTooltip', config)),
        googlePlacesSearch = parseInt(this._getEscapedProperty('googlePlacesSearch', config)),
        googlePlacesApiKeyUser = this._getEscapedProperty('googlePlacesApiKeyUser', config),
        googlePlacesApiKeyRealm = this._getEscapedProperty('googlePlacesApiKeyRealm', config),
        googlePlacesZoomLevel = parseInt(this._getEscapedProperty('googlePlacesZoomLevel', config)),
        googlePlacesPosition = this._getEscapedProperty('googlePlacesPosition', config),
        bingMaps = parseInt(this._getEscapedProperty('bingMaps', config)),
        bingMapsApiKey = this._getEscapedProperty('bingMapsApiKey', config),
        bingMapsApiKeyUser = this._getEscapedProperty('bingMapsApiKeyUser', config),
        bingMapsApiKeyRealm = this._getEscapedProperty('bingMapsApiKeyRealm', config),
        bingMapsTileLayer = this._getEscapedProperty('bingMapsTileLayer', config),
        bingMapsLabelLanguage = this._getEscapedProperty('bingMapsLabelLanguage', config),
        useOpenFreeMap = parseInt(this._getEscapedProperty('useOpenFreeMap', config)),
        maplibreStylePreset = this._getEscapedProperty('maplibreStylePreset', config),
        maplibreStyleOverride = this._getSafeUrlProperty('maplibreStyleOverride', config),
        kmlOverlay  = this._getEscapedProperty('kmlOverlay', config),
        clusterGroupColors = this._getEscapedProperty('clusterGroupColors', config),
        rangeOneBgColor = this._getEscapedProperty('rangeOneBgColor', config),
        rangeOneFgColor = this._getEscapedProperty('rangeOneFgColor', config),
        warningThreshold = this._getEscapedProperty('warningThreshold', config),
        rangeTwoBgColor = this._getEscapedProperty('rangeTwoBgColor', config),
        rangeTwoFgColor = this._getEscapedProperty('rangeTwoFgColor', config),
        criticalThreshold = this._getEscapedProperty('criticalThreshold', config),
        rangeThreeBgColor = this._getEscapedProperty('rangeThreeBgColor', config),
        rangeThreeFgColor = this._getEscapedProperty('rangeThreeFgColor', config),
        measureTool = parseInt(this._getEscapedProperty('measureTool', config)),
        measureIconPosition = this._getEscapedProperty('measureIconPosition', config),
        measurePrimaryLengthUnit = this._getEscapedProperty('measurePrimaryLengthUnit', config),
        measureSecondaryLengthUnit = this._getEscapedProperty('measureSecondaryLengthUnit', config),
        measurePrimaryAreaUnit = this._getEscapedProperty('measurePrimaryAreaUnit', config),
        measureSecondaryAreaUnit = this._getEscapedProperty('measureSecondaryAreaUnit', config),
        measureActiveColor = this._getEscapedProperty('measureActiveColor', config),
        measureCompletedColor = this._getEscapedProperty('measureCompletedColor', config),
        measureLocalization = this._getEscapedProperty('measureLocalization', config),
        showPathLines = parseInt(this._getEscapedProperty('showPathLines', config)),
        pathIdentifier = this._getEscapedProperty('pathIdentifier', config),
        pathColorList = this._getEscapedProperty('pathColorList', config),
        showPlayback = parseInt(this._getEscapedProperty('showPlayback', config)),
        showPlaybackSliderControl = parseInt(this._getEscapedProperty('showPlaybackSliderControl', config)),
        showPlaybackDateControl = parseInt(this._getEscapedProperty('showPlaybackDateControl', config)),
        showPlaybackPlayControl = parseInt(this._getEscapedProperty('showPlaybackPlayControl', config)),
        playbackTickLength = parseFloat(this._getEscapedProperty('playbackTickLength', config)),
        playbackSpeed = parseFloat(this._getEscapedProperty('playbackSpeed', config)),
        heatmapEnable = parseInt(this._getEscapedProperty('heatmapEnable', config)),
        heatmapOnly = parseInt(this._getEscapedProperty('heatmapOnly', config)),
        heatmapMinOpacity = parseFloat(this._getEscapedProperty('heatmapMinOpacity', config)),
        heatmapRadius = parseInt(this._getEscapedProperty('heatmapRadius', config)),
        heatmapBlur = parseInt(this._getEscapedProperty('heatmapBlur', config)),
        heatmapColorGradient = this._stringToJSON(this._getProperty('heatmapColorGradient', config)),
        antarcticProj = parseInt(this._getEscapedProperty('antarcticProj', config)),
        antarcticMapTile = this._getEscapedProperty('antarcticMapTile', config),
        gibsLayerId = this._getEscapedProperty('gibsLayerId', config),
        gibsFormat = this._getEscapedProperty('gibsFormat', config),
        gibsLowerCorner = parseInt(this._getEscapedProperty('gibsLowerCorner', config)),
        gibsUpperCorner = parseInt(this._getEscapedProperty('gibsUpperCorner', config)),
        gibsTileMatrixSet = this._getEscapedProperty('gibsTileMatrixSet', config),
        gibsTime = this._getEscapedProperty('gibsTime', config),
        tileSize = parseInt(this._getEscapedProperty('tileSize', config)),
        showProgress = parseInt(this._getEscapedProperty('showProgress', config)),
        msIconColor = this._stringToJSON(this._getProperty('msIconColor', config)),
        msFrameColor = this._stringToJSON(this._getProperty('msFrameColor', config)),
        msInfoColor = this._stringToJSON(this._getProperty('msInfoColor', config)),
        msColorMode = this._getEscapedProperty('msColorMode', config),
        msInfoBackground = this._stringToJSON(this._getProperty('msInfoBackground', config)),
        msInfoBackgroundFrame = this._stringToJSON(this._getProperty('msInfoBackgroundFrame', config)),
        msStandard = this._getEscapedProperty('msInfoBackgroundFrame', config),
        msOutlineColor = this._stringToJSON(this._getProperty('msOutlineColor', config)),
        selectingMarkers = parseInt(this._getEscapedProperty('selectingMarkers', config)),
        clickLatLngToken = parseInt(this._getEscapedProperty('clickLatLngToken', config)),
        clickLatLngPrecision = parseInt(this._getEscapedProperty('clickLatLngPrecision', config)) || 4


    // Auto Fit & Zoom once we've processed all data
    if(this.allDataProcessed) {
        // this._updateMap(this.map, {
        //   showProgress: showProgress,
        //   heatmapEnable: heatmapEnable,
        //   heatLayers: this.heatLayers,
        //   control: this.control,
        //   layerControl: layerControl,
        // })

        if(this.isArgTrue(showProgress)) {
            if(!_.isUndefined(this.map)) {
                this.map.spin(false)
            }
        }
        
        // Render hetmap layer on map
        if(this.isArgTrue(heatmapEnable) && !_.isEmpty(this.heatLayers)) {
            this._renderLayersToMap(this.map, {layers: this.heatLayers,
                                              control: this.control,
                                              layerControl: this.isArgTrue(layerControl),
                                              layerType: "heat",
                                              paneZIndex: this.paneZIndex,
                                              context: this})
        }

        // Render paths to map
        if(this.isArgTrue(showPathLines) && !_.isEmpty(this.pathLineLayers)) {
            this._renderLayersToMap(this.map, {layers: this.pathLineLayers,
                                               control: this.control,
                                               layerControl: this.isArgTrue(layerControl),
                                               layerType: "path",
                                               paneZIndex: this.paneZIndex,
                                               //playback: true,
                                               playback: this.playback,
                                               showPlayback: this.isArgTrue(showPlayback),
                                               context: this})
        }
        
        if(!_.isEmpty(this.featureLayers)) {
            this._renderLayersToMap(this.map, {layers: this.featureLayers,
                control: this.control,
                layerControl: this.isArgTrue(layerControl),
                layerType: "feature",
                paneZIndex: this.paneZIndex,
                context: this})    
        }

        if(this.isArgTrue(autoFitAndZoom)) {
            setTimeout(this.fitLayerBounds, autoFitAndZoomDelay, {map: this.map, 
                                                                  layerFilter: this.layerFilter,
                                                                  heatLayers: this.heatLayers,
                                                                  pathLineLayers: this.pathLineLayers,
                                                                  featureLayers: this.featureLayers,
                                                                  context: this})
        }
    } 
    
    // Get data rows — formatData returns `this` (no .results) for empty/unfinished searches.
    // Use an empty array so the map still initializes and shows a blank tile instead of a white div.
    // Guard with Array.isArray: SplunkVisualizationBase may set this.results = null, so
    // _.has returns true but data.results is null, crashing dataRows.length below.
    var dataRows = (_.has(data, 'results') && Array.isArray(data.results)) ? data.results : []

    // If the map is already rendered and there's no new data, nothing to update
    if (dataRows.length === 0 && this.isInitializedDom) {
        return this
    }

    // renderer is read inside the isInitializedDom block (canvas preferCanvas option), so
    // it must be declared before that block regardless of whether we have data.
    var pathSplits = parseInt(this._getEscapedProperty('pathSplits', config)),
        renderer = this._getEscapedProperty('renderer', config),
        pathSplitInterval = parseInt(this._getEscapedProperty('pathSplitInterval', config))

    // Auto-select CartoDB Dark when Splunk dark theme is active and the user
    // has not explicitly chosen a tile (i.e. mapTile is still the default value).
    // An explicit user selection in the Format panel always takes precedence.
    var _defaultTile = this.defaultConfig[this.getPropertyNamespaceInfo().propertyNamespace + 'mapTile']
    var _effectiveTile = (this.isDarkTheme && mapTile === _defaultTile)
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        : mapTile

    this.activeTile = (mapTileOverride) ? mapTileOverride : _effectiveTile
    this.attribution = (mapAttributionOverride) ? mapAttributionOverride : this.ATTRIBUTIONS[_effectiveTile]

    // Initialize the DOM
    if (!this.isInitializedDom) {
        // Set defaul icon image path
        L.Icon.Default.imagePath = (_SPLUNK_ORIGIN || location.origin) + this.contribUri + '/images/'

        // Create layer filter object
        var layerFilter = this.layerFilter = {}

        // Create clusterGroups
        var clusterGroups = this.clusterGroups = {}

        // Setup cluster marker CSS
        this.createMarkerStyle(rangeOneBgColor, rangeOneFgColor, "one")
        this.createMarkerStyle(rangeTwoBgColor, rangeTwoFgColor, "two")
        this.createMarkerStyle(rangeThreeBgColor, rangeThreeFgColor, "three")

        // Parse per-group color mapping from formatter config.
        // Declared here (before the per-row processing loop) so it is in scope at the
        // cluster group creation block below. JavaScript var hoisting ensures availability.
        var clusterColorMap = this.parseClusterGroupColors(clusterGroupColors)

        // Enable all or multiple popups
        if(this.isArgTrue(allPopups) || this.isArgTrue(multiplePopups)) {
            L.Map = L.Map.extend({
                openPopup: function (popup, latlng, options) {
                    if (!(popup instanceof L.Popup)) {
                        popup = new L.Popup(options).setContent(popup)
                    }

                    if (latlng) {
                        popup.setLatLng(latlng)
                    }

                    if (this.hasLayer(popup)) {
                        return this
                    }

                    this._popup = popup
                    return this.addLayer(popup)
                }
            })

            // Disable close popup on click to allow multiple popups
            $.extend(this.mapOptions, { closePopupOnClick: false })
        }

        // Create canvas render and prever canvas for paths
        if(renderer == "canvas") {
            $.extend(this.mapOptions, { preferCanvas: true })
        }

        // Configure context menu
        if(this.isArgTrue(contextMenu)) {
            var contextMenuTarget = this.contextMenuTarget = undefined
            var contextMenuEnabled = this.contextMenuEnabled = true

            $.extend(this.mapOptions, {contextmenu: true,
                               contextmenuWidth: 140,
                               minZoom: minZoom,
                               maxZoom: maxZoom,
                               contextmenuItems: [{
                                   text: 'Show details',
                                   context: this,
                                   callback: this.showCoordinates
                               }, {
                                   text: 'Center map here',
                                   context: this,
                                   callback: this.centerMap
                               }, '-', {
                                       text: 'Auto Fit & Zoom',
                                       context: this,
                                       callback: this.fitLayerBounds
                               }, {
                                   text: 'Zoom in',
                                   iconCls: 'fa fa-search-plus',
                                   context: this,
                                   callback: this.zoomIn
                               }, {
                                   text: 'Zoom out',
                                   iconCls: 'fa fa-search-minus',
                                   context: this,
                                   callback: this.zoomOut
                               }]})
        }


        if(this.isArgTrue(antarcticProj)) {
            // Set tile size
            $.extend(this.tileOptions, {tileSize: tileSize})

            // GIBS
            if(antarcticMapTile.match(/gibs/g)) {
                var crsGibs = this.crsGibs = new L.Proj.CRS(
                    'EPSG:3031',
                    '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 ' +
                    '+ellps=WGS84 +datum=WGS84 +units=m +no_defs', {
                    origin: [gibsLowerCorner, gibsUpperCorner],
                    resolutions: [
                      8192.0,
                      4096.0,
                      2048.0,
                      1024.0,
                      512.0,
                      256.0
                    ],
                    bounds: L.Bounds([
                      [gibsLowerCorner, gibsLowerCorner],
                      [gibsUpperCorner, gibsUpperCorner]
                    ])
                  })

                $.extend(this.tileOptions, {tileSize: tileSize,
                                            gibsLayerId: gibsLayerId,
                                            gibsTileMatrixSet: gibsTileMatrixSet,
                                            gibsFormat: gibsFormat,
                                            gibsTime: gibsTime,
                                            subdomains: 'abc',
                                            attribution:
                                              '<a href="https://wiki.earthdata.nasa.gov/display/GIBS">' +
                                              'NASA EOSDIS GIBS</a>'
                })

                $.extend(this.mapOptions, {
                    crs: this.crsGibs,
                })
            } else {
                //GBIS
                antarcticMapTile = antarcticMapTile.replace("{r}", this.pixelRatio) 

                this.extent = 12367396.2185; // To the Equator
                this.resolutions = Array(maxZoom + 1)
                    .fill()
                    .map((_, i) => this.extent / tileSize / Math.pow(2, i - 1));
    
                var crsGbis = this.crsGbis = new L.Proj.CRS(
                    "EPSG:3031",
                    "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs",
                    {
                      origin: [-this.extent, this.extent],
                      projectedBounds: L.bounds(
                        L.point(-this.extent, this.extent),
                        L.point(this.extent, -this.extent)
                      ),
                      resolutions: this.resolutions
                    }
                  );

                $.extend(this.mapOptions, {
                    crs: this.crsGbis,
                })
            }
        }
        

        // Create map 
        this.map = new L.Map(this.el, this.mapOptions).setView([mapCenterLat, mapCenterLon], mapCenterZoom)

        // Set cursor style and click handler for clickLatLngToken
        if(this.isArgTrue(clickLatLngToken)) {
            this.map.getContainer().style.cursor = 'crosshair';
        }
        var _mapClickSelf = this;
        this.map.on('click', function(e) {
            if(!_mapClickSelf.isArgTrue(parseInt(_mapClickSelf._getEscapedProperty('clickLatLngToken', _mapClickSelf.getCurrentConfig())))) {
                return;
            }
            var precision = parseInt(_mapClickSelf._getEscapedProperty('clickLatLngPrecision', _mapClickSelf.getCurrentConfig())) || 4;
            var lat = e.latlng.lat.toFixed(precision);
            var lng = e.latlng.lng.toFixed(precision);
            var defaultTokenModel = splunkjs.mvc.Components.get('default');
            var submittedTokenModel = splunkjs.mvc.Components.get('submitted');
            if (defaultTokenModel) {
                defaultTokenModel.set('clickedLat', lat);
                defaultTokenModel.set('clickedLng', lng);
                defaultTokenModel.set('clickedLatLng', lat + ',' + lng);
            }
            if (submittedTokenModel) {
                submittedTokenModel.set('clickedLat', lat);
                submittedTokenModel.set('clickedLng', lng);
                submittedTokenModel.set('clickedLatLng', lat + ',' + lng);
            }
            if (_mapClickSelf.isArgTrue(parseInt(_mapClickSelf._getEscapedProperty('showClickMarker', _mapClickSelf.getCurrentConfig())))) {
                if (_mapClickSelf._clickMarker) {
                    _mapClickSelf.map.removeLayer(_mapClickSelf._clickMarker);
                }
                _mapClickSelf._clickMarker = L.marker(e.latlng, {
                    icon: L.divIcon({
                        className: 'maps-plus-click-marker',
                        html: '<i class="fa fa-crosshairs"></i>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(_mapClickSelf.map);
            }
        });

        // Dark Mode Support
        if(this.isDarkTheme) { this._darkModeInit() }

        // Load Google Places Search Control
        if(this.isArgTrue(googlePlacesSearch)) {
            this.getStoredApiKey({user: googlePlacesApiKeyUser,
                                  realm: googlePlacesApiKeyRealm,
                                  context: this})
            .then($.proxy(function(googlePlacesApiKey) {
                loadGoogleMapsAPI({key: googlePlacesApiKey,
                                   libraries: ['places']}).then(function(google) {
                    new L.Control.GPlaceAutocomplete({
                        position: googlePlacesPosition,
                        callback: function(l){
                            var latlng = L.latLng(l.geometry.location.lat(), l.geometry.location.lng())
                            map.flyTo(latlng, googlePlacesZoomLevel)
                        }
                    }).addTo(map)
                }).catch(function(err) {
                    console.error("Failed to initialize Google Places search control", err)
                })
            }, this))
        }

        // Create OpenFreeMap vector tile layer
        if (this.isArgTrue(useOpenFreeMap)) {
            if (this.tileLayer) {
                this.tileLayer.remove();
                this.tileLayer = null;
            }
            const styleUrl = this._getMaplibreStyleUrl({ maplibreStylePreset, maplibreStyleOverride });
            const attribution = this._getEscapedProperty('mapAttributionOverride', config)
                || '© <a href="https://openfreemap.org">OpenFreeMap</a> '
                + '© <a href="https://openmaptiles.org">OpenMapTiles</a> '
                + '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
            this.tileLayer = L.maplibreGL({
                style: styleUrl,
                attribution: attribution
            }).addTo(this.map);
        } else if(this.isArgTrue(bingMaps)) {
            if(!_.isEmpty(bingMapsApiKeyUser)) {
                this.getStoredApiKey({user: bingMapsApiKeyUser,
                                      realm: bingMapsApiKeyRealm,
                                      context: this})
                .then($.proxy(function(bingMapsApiKey) {
                    var bingOptions = this.bingOptions = {bingMapsKey: bingMapsApiKey,
                                                          imagerySet: bingMapsTileLayer,
                                                          culture: bingMapsLabelLanguage,
                                                          minZoom: minZoom,
                                                          maxZoom: maxZoom}

                    this.tileLayer = L.tileLayer.bing(this.bingOptions)
                }, this))
                .done($.proxy(function() {
                    // Add tile layer to map
                    this.map.addLayer(this.tileLayer)
                }, this))
            } else {
                var bingOptions = this.bingOptions = {bingMapsKey: bingMapsApiKey,
                                                      imagerySet: bingMapsTileLayer,
                                                      culture: bingMapsLabelLanguage,
                                                      minZoom: minZoom,
                                                      maxZoom: maxZoom}
                this.tileLayer = L.tileLayer.bing(this.bingOptions)
                // Add tile layer to map
                this.map.addLayer(this.tileLayer)
            }
        } else {
            $.extend(this.tileOptions, {
                attribution: this.attribution,
                minZoom: minZoom,
                maxZoom: maxZoom
            })

            if(this.isArgTrue(antarcticProj)) {
                this.activeTile = antarcticMapTile
            }

            // Setup the tile layer with map tile, zoom and attribution
            // Phase 2 (DS-JS-02/03): route through proxy subclass in DS mode, plain L.tileLayer in Classic.
            this.tileLayer = _createMapsPlusTileLayer(this, this.activeTile, this.tileOptions)

            // Add tile layer to map
            this.map.addLayer(this.tileLayer)
        }

        // Add map controls which allow user to draw a polygon to select markers
        if(this.isArgTrue(selectingMarkers) && !this.hasOwnProperty('selectingMarkersToolbar')) {
            var _viz = this;
            _viz.selectingMarkersLayer = new L.FeatureGroup();
            _viz.selectingMarkersToolbar = true;
            _viz.map.addLayer(_viz.selectingMarkersLayer);
            _viz.map.pm.addControls({
                drawPolygon:      true,
                drawRectangle:    true,
                removalMode:      true,
                drawMarker:       false,
                drawCircleMarker: false,
                drawPolyline:     false,
                drawCircle:       false,
                drawText:         false,
                editMode:         false,
                dragMode:         false,
                cutPolygon:       false,
                rotateMode:       false
            });

            function updateSelectedPoints() {
                var ptsWithinbuff = turf.pointsWithinPolygon(_viz.allDataPoints, _viz.selectingMarkersLayer.toGeoJSON());
                var selectedPoints = [];
                for (var i=0; i<ptsWithinbuff.features.length;i++ ) {
                    selectedPoints.push(dataRows[ptsWithinbuff.features[i].properties.row]);
                }
                var defaultTokenModel = splunkjs.mvc.Components.get('default');
                var submittedTokenModel = splunkjs.mvc.Components.get('submitted');
                var selected_points = JSON.stringify(selectedPoints);
                if (defaultTokenModel) {
                    defaultTokenModel.set("mapmarkers", selected_points);
                }
                if (submittedTokenModel) {
                    submittedTokenModel.set("mapmarkers", selected_points);
                }
            }

            _viz.map.on('pm:create', function(e) {
                _viz.selectingMarkersLayer.addLayer(e.layer);
                e.layer.on('pm:remove', function() {
                    _viz.selectingMarkersLayer.removeLayer(e.layer);
                    updateSelectedPoints();
                });
                updateSelectedPoints();
            });

            _viz.map.on('pm:edit', function() {
                updateSelectedPoints();
            });
        }

        this.markers = new L.MarkerClusterGroup({ 
            chunkedLoading: true,
            maxClusterRadius: maxClusterRadius,
            removeOutsideVisibleBounds: true,
            maxSpiderfySize: maxSpiderfySize,
            spiderfyDistanceMultiplier: spiderfyDistanceMultiplier,
            singleMarkerMode: (this.isArgTrue(singleMarkerMode)),
            animate: (this.isArgTrue(animate)),
            iconCreateFunction: function(cluster) {
                var childCount = cluster.getChildCount()
                var c = ' marker-cluster-'
                if (childCount >= criticalThreshold) {
                    c += 'three'
                } else if (childCount >= warningThreshold) {
                    c += 'two'
                } else {
                    c += 'one'
                }
                return new L.DivIcon({ html: '<div><span><b>' + childCount + '</span></div></b>', className: 'marker-cluster' + c , iconSize: new L.Point(40, 40) })
            }
        })

        // Create layer control
        var control = this.control = L.control.layers({}, {}, { collapsed: this.isArgTrue(layerControlCollapsed) })
        if (this.isArgTrue(layerControl)) {
            this.control.addTo(this.map)
            if(this.isDarkTheme) { this._darkModeUpdate() }
        }

        let measureControl = this.measureControl

        var measureFeatures = this.measureFeatures = L.layerGroup()
        
        // Get map size
        var mapSize = this.mapSize = this.map.getSize()

        // Get parent element of div to resize 
        // Nesting of Div's is different, try 7.x first
        this.parentEl = $(this.el).parent().parent().parent().parent().parent().closest("div").attr("data-cid")
        this.parentView = $(this.el).parent().parent().parent().parent().parent().closest("div").attr("data-view")

        // Default to 6.x view
        if(this.parentView != 'views/shared/ReportVisualizer') {
            this.parentEl = $(this.el).parent().parent().closest("div").attr("data-cid")
            this.parentView = $(this.el).parent().parent().closest("div").attr("data-view")
        }

        // Map Full Screen Mode
        if (this.isArgTrue(fullScreen)) {
            this._setFullScreenMode(this.map, {parentEl: this.parentEl})
        } else {
            this._setDefaultHeight(this.map, {parentEl: this.parentEl,
                                              defaultHeight: defaultHeight})
        }

        // Enable measure tool plugin and add to map
        if(this.isArgTrue(measureTool)) {
            var measureOptions = { position: measureIconPosition,
                                   activeColor: measureActiveColor,
                                   completedColor: measureCompletedColor,
                                   primaryLengthUnit: measurePrimaryLengthUnit,
                                   secondaryLengthUnit: measureSecondaryLengthUnit,
                                   primaryAreaUnit: measurePrimaryAreaUnit,
                                   secondaryAreaUnit: measureSecondaryAreaUnit,
                                   localization: measureLocalization,
                                   features: this.measureFeatures,
                                   map: this.map}

                    // Add fix for measurement jumping to center of map - https://github.com/ljagis/leaflet-measure/issues/171#issuecomment-1137483548
                    L.Control.Measure.include({
                        // set icon on the capture marker
                        _setCaptureMarkerIcon: function () {
                            // disable autopan
                            this._captureMarker.options.autoPanOnFocus = false;

                            // default function
                            this._captureMarker.setIcon(
                                L.divIcon({
                                    iconSize: this._map.getSize().multiplyBy(2)
                                })
                            );
                        },
                    });

                    this.measureControl = new L.Control.Measure(measureOptions)
                    this.measureControl.addTo(this.map)

            if(this.isDarkTheme) { this._darkModeUpdate() }                    
        }

        var pathLineLayers = this.pathLineLayers = {}
        
        // Store heatmap layers
        var heatLayers = this.heatLayers = {}

        // Polygon layers
        var featureLayers = this.featureLayers = {}
       
        // Init defaults
        this.chunk = 50000
        this.offset = 0
        this.isInitializedDom = true         
        this.allDataProcessed = false

        // Load localization file and init locale.
        // In Dashboard Studio the viz runs in a sandboxed srcdoc iframe with
        // origin 'null'; the i18n JSON XHR is blocked by CORS regardless of
        // URL. jquery.i18n's internal $.getJSON().then(...) chain has no
        // error handler and surfaces an unhandled rejection ("Cannot read
        // properties of undefined (reading 'default')") which the DS viz
        // adapter treats as a fatal updateView error. We skip the load entirely
        // in DS mode — UI strings fall back to the English source literals.
        var i18n = $.i18n()
        i18n.locale = i18nLanguage
        if (!this._isDashboardStudio) {
            try {
                var i18nPromise = i18n.load((_SPLUNK_ORIGIN || location.origin) + this.contribUri + '/i18n/' + i18nLanguage + '.json', i18n.locale)
                if (i18nPromise && typeof i18nPromise.fail === 'function') {
                    i18nPromise.fail(function () { /* noop */ })
                } else if (i18nPromise && typeof i18nPromise.catch === 'function') {
                    i18nPromise.catch(function () { /* noop */ })
                }
            } catch (i18nErr) { /* noop */ }
        }
        
        if(this.isArgTrue(showProgress)) {
            this.map.spin(true)
        }

        // Init playback
        var playbackOptions = {                   
            playControl: this.isArgTrue(showPlayback) ? this.isArgTrue(showPlaybackPlayControl):false,
            dateControl: this.isArgTrue(showPlayback) ? this.isArgTrue(showPlaybackDateControl): false,
            sliderControl: this.isArgTrue(showPlayback) ? this.isArgTrue(showPlaybackSliderControl):false,
            tracksLayer: false,
            tickLen: playbackTickLength,
            speed: playbackSpeed,
            showPlayback: this.isArgTrue(showPlayback),
            labels: true,
            marker: function(f){
                return {
                    icon: L.VectorMarkers.icon({
                        icon: f.properties.icon,
                        markerColor: f.properties.path_options.color,
                        prefix: f.properties.prefix,
                    })
                }
            }
        }

        // Add clear playback menu item to contextmenu
        if(this.isArgTrue(showPlayback) && !this.showClearPlayback && this.isArgTrue(contextMenu)) {
            this.map.contextmenu.insertItem({text: 'Clear Playback',
                                             context: this,
                                             callback: this.clearPlayback}, 0)
            this.map.contextmenu.insertItem({text: 'Reset Playback',
                                             context: this,
                                             callback: this.resetPlayback}, 1)                                                     
            this.map.contextmenu.insertItem({text: 'Add All To Playback',
                                             context: this,
                                             callback: this.addAllToPlayback}, 2)
            // Flag that we're showing menu item                                                        
            this.showClearPlayback = true                                                    
        }                        
            // Initialize playback
        var playback = this.playback = new L.Playback(this.map, null, null, playbackOptions)

        // Save context menu target to use with add/remove playback on paths
        if(this.isArgTrue(contextMenu)) {
            L.DomEvent.addListener(this.map, 'contextmenu.show', function(e) {
                if(_.has(e, 'relatedTarget')) {
                    this.contextMenuTarget = e.relatedTarget
                }
            }, this)
        }
    }

    // Load KML/KMZ overlays outside !isInitializedDom so they fire on the second
    // updateView call when real config arrives, even if the first call used defaults.
    // _loadedKmlOverlay tracks what's on the map — skip if config hasn't changed.
    if (kmlOverlay !== this._loadedKmlOverlay) {
        _.each(this._kmlFeatureGroups || [], function(fg) {
            if (this.control) { this.control.removeLayer(fg) }
            fg.remove()
        }, this)
        this._kmlFeatureGroups = []
        this._loadedKmlOverlay = kmlOverlay

        if (kmlOverlay) {
            var kmlFiles = kmlOverlay.split(/\s*,\s*/)
            var paneZIndex = this.paneZIndex = 400
            _.each(kmlFiles.reverse(), function(file, i) {
                var url = /^https?:\/\//.test(file) ? file : (_SPLUNK_ORIGIN || location.origin) + this.contribUri + '/kml/' + file
                var label = file.split('/').pop()
                var fg = L.featureGroup().addTo(this.map)
                if (this.isArgTrue(layerControl)) {
                    this.control.addOverlay(fg, label)
                }
                this._kmlFeatureGroups.push(fg)
                this.fetchKmlAndMap(url, file, fg, paneZIndex)
                paneZIndex = paneZIndex - (i + 1)
            }, this)
        }
    }

    // ─── Milsymbol zoom-scaling: register zoomend handler once per map init ──────
    // Captures formatter-level color/style config via closure so the redraw has
    // the same defaults the initial render used.
    if(!this._milsymbolZoomHandlerRegistered) {
        this._milsymbolZoomHandlerRegistered = true
        var self = this

        // Snapshot formatter-level milsymbol style config at registration time.
        // These are the fallback values used when a row doesn't override them.
        var _zoomMsColorMode           = msColorMode
        var _zoomMsFrameColor          = msFrameColor
        var _zoomMsIconColor           = msIconColor
        var _zoomMsInfoColor           = msInfoColor
        var _zoomMsInfoBackground      = msInfoBackground
        var _zoomMsInfoBackgroundFrame = msInfoBackgroundFrame
        var _zoomMsOutlineColor        = msOutlineColor
        var _zoomMsStandard            = msStandard
        var _zoomRenderer              = renderer

        self.map.on('zoomend', function() {
            var currentZoom = self.map.getZoom()

            // Walk every layer group in the filter and redraw milsymbol markers
            _.each(self.layerFilter, function(lg) {
                // Non-clustered markers live in markerList
                if(!_.isUndefined(lg.markerList)) {
                    _.each(lg.markerList, function(marker) {
                        if(!marker._isMilsymbol || !marker._milsymbolUserData) { return }
                        var newSize = self._getMilsymbolSizeForZoom(marker._milsymbolBaseSize, currentZoom)
                        var newIcon = self._buildMilsymbolIcon(
                            marker._milsymbolUserData,
                            newSize,
                            _zoomRenderer,
                            _zoomMsColorMode,
                            _zoomMsFrameColor,
                            _zoomMsIconColor,
                            _zoomMsInfoColor,
                            _zoomMsInfoBackground,
                            _zoomMsInfoBackgroundFrame,
                            _zoomMsOutlineColor,
                            _zoomMsStandard
                        )
                        marker.setIcon(newIcon)
                    })
                }

                // Clustered markers live inside clusterGroup[n].markerList
                if(!_.isUndefined(lg.clusterGroup)) {
                    _.each(lg.clusterGroup, function(cg) {
                        _.each(cg.markerList, function(marker) {
                            if(!marker._isMilsymbol || !marker._milsymbolUserData) { return }
                            var newSize = self._getMilsymbolSizeForZoom(marker._milsymbolBaseSize, currentZoom)
                            var newIcon = self._buildMilsymbolIcon(
                                marker._milsymbolUserData,
                                newSize,
                                _zoomRenderer,
                                _zoomMsColorMode,
                                _zoomMsFrameColor,
                                _zoomMsIconColor,
                                _zoomMsInfoColor,
                                _zoomMsInfoBackground,
                                _zoomMsInfoBackgroundFrame,
                                _zoomMsOutlineColor,
                                _zoomMsStandard
                            )
                            marker.setIcon(newIcon)
                        })
                    })
                }
            })
        })
    }

    // Blank map is now initialized — no data rows to render
    if (dataRows.length === 0) {
        return this
    }

    // Validate we have at least latitude and longitude fields
    if (!("latitude" in dataRows[0]) || !("longitude" in dataRows[0])) {
        if (!("feature" in dataRows[0])) {
            throw new SplunkVisualizationBase.VisualizationError(
                'Incorrect Fields Detected - latitude & longitude fields required'
            )
        }
    }

    // Map Scroll
    (this.isArgTrue(scrollWheelZoom)) ? this.map.scrollWheelZoom.enable() : this.map.scrollWheelZoom.disable()

    if(!this.isArgTrue(bingMaps) && !this.isArgTrue(useOpenFreeMap)) {
        // Reset Tile If Changed
        if(this.tileLayer._url != this.activeTile) {
            this.tileLayer.setUrl(this.activeTile)
        }
    }

    // Reset tile zoom levels if changed
    if(!_.isNull(this.tileLayer) && !this.isArgTrue(useOpenFreeMap)) {
        if (this.tileLayer.options.maxZoom != maxZoom) {
            this.tileLayer.options.maxZoom = maxZoom
        }
        
        if (this.tileLayer.options.minZoom != minZoom) {
            this.tileLayer.options.minZoom = minZoom
        }
    }

    // Reset map zoom
    if (this.map.getZoom() != mapCenterZoom) {
        this.map.setZoom(mapCenterZoom)
    }

    this.allDataPoints = {
        "type": "FeatureCollection",
        "features": []
    };


   
    /********* BEGIN PROCESSING DATA **********/

    // Iterate through each row creating layer groups per icon type
    // and create markers appending to a markerList in each layerfilter object
    _.each(dataRows, function(userData, i) {

        if(this.isArgTrue(selectingMarkers)) {
            if(userData.hasOwnProperty('latitude') && userData.hasOwnProperty('longitude')) {
                this.allDataPoints.features.push({
                    "type": "Feature",
                    "properties": { row: i },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [ parseFloat(userData['longitude']), parseFloat(userData['latitude']) ]
                    }
                })
            }
        }

        // Get marker and icon properties	
        var markerType = _.has(userData, "markerType") ? userData["markerType"]:"png",
            markerColor = _.has(userData, "markerColor") ? userData["markerColor"]:"blue",
            iconColor = _.has(userData, "iconColor") ? userData["iconColor"]:"white",
            customIcon = _.has(userData, "customIcon") ? userData["customIcon"]:null,
            markerSize = _.has(userData, "markerSize") ? this.stringToPoint(userData["markerSize"]):[35,45],
            markerAnchor = _.has(userData, "markerAnchor") ? this.stringToPoint(userData["markerAnchor"]):[15,50],
            shadowSize = _.has(userData, "shadowSize") ? this.stringToPoint(userData["shadowSize"]):[30,46],
            shadowAnchor = _.has(userData, "shadowAnchor") ? this.stringToPoint(userData["shadowAnchor"]):[30,30],
            markerPriority = _.has(userData, "markerPriority") ? parseInt(userData["markerPriority"]):0,
            layerPriority = _.has(userData, "layerPriority") ? parseInt(userData["layerPriority"]):undefined,
            title = _.has(userData, "title") ? userData["title"]:null,
            tooltip = _.has(userData, "tooltip") ? userData["tooltip"]:null,
            prefix = _.has(userData, "prefix") ? userData["prefix"]:"fa",
            extraClasses = _.has(userData, "extraClasses") ? userData["extraClasses"]:"fa-lg",
            circleStroke = _.has(userData, "circleStroke") ? this.isArgTrue(userData["circleStroke"]):true,
            circleRadius = _.has(userData, "circleRadius") ? parseInt(userData["circleRadius"]):10,
            circleColor = _.has(userData, "circleColor") ? this.convertHex(userData["circleColor"]):this.convertHex("#3388ff"),
            circleWeight = _.has(userData, "circleWeight") ? parseInt(userData["circleWeight"]):3,
            circleOpacity = _.has(userData, "circleOpacity") ? parseFloat(userData["circleOpacity"]):1.0,
            circleFillColor = _.has(userData, "circleFillColor") ? userData["circleFillColor"]:circleColor,
            circleFillOpacity = _.has(userData, "circleFillOpacity") ? parseFloat(userData["circleFillOpacity"]):0.2,
            layerDescription  = _.has(userData, "layerDescription") ? userData["layerDescription"]:"",
            layerVisibility = _.has(userData, "layerVisibility") ? this.isArgTrue(userData["layerVisibility"]):true,
            description = _.has(userData, "description") ? userData["description"]:null,
            featureDescription = _.has(userData, "featureDescription") ? userData["featureDescription"]:null,
            featureTooltip = _.has(userData, "featureTooltip") ? userData["featureTooltip"]:null,
            featureColor = _.has(userData, "featureColor") ? this.convertHex(userData["featureColor"]):this.convertHex("#3388ff"),
            featureWeight = _.has(userData, "featureWeight") ? userData["featureWeight"]:3,
            featureOpacity = _.has(userData, "featureOpacity") ? userData["featureOpacity"]:1.0,
            featureStroke = _.has(userData, "featureStroke") ? this.isArgTrue(userData["featureStroke"]):true,
            featureFill = _.has(userData, "featureFill") ? this.isArgTrue(userData["featureFill"]):true,
            featureFillColor = _.has(userData, "featureFillColor") ? this.convertHex(userData["featureFillColor"]):featureColor,
            featureFillOpacity = _.has(userData, "featureFillOpacity") ? userData["featureFillOpacity"]:0.2,
            featureRadius = _.has(userData, "featureRadius") ? userData["featureRadius"]:10                    

        // Add heatmap layer
        if (this.isArgTrue(heatmapEnable)) {
            var heatLayer = this.heatLayer = _.has(userData, "heatmapLayer") ? userData["heatmapLayer"]:"heatmap",
                heatmapMinOpacityM = _.has(userData, "heatmapMinOpacity") ? parseFloat(userData["heatmapMinOpacity"]):heatmapMinOpacity,
                heatmapRadiusM = _.has(userData, "heatmapRadius") ? parseFloat(userData["heatmapRadius"]):heatmapRadius,
                heatmapBlurM = _.has(userData, "heatmapBlur") ? parseFloat(userData["heatmapBlur"]):heatmapBlur,
                heatmapColorGradientM = _.has(userData, "heatmapColorGradient") ? this._stringToJSON(userData["heatmapColorGradient"]):heatmapColorGradient,
                heatmapInclude = _.has(userData, "heatmapInclude") ? this.isArgTrue(userData["heatmapInclude"]):true

            if(!_.has(this.heatLayers, this.heatLayer)) {
                // Create feature group
                var heatFg = L.featureGroup()

                // Create heat layer
                var heatFgLayer = L.heatLayer([], {minOpacity: heatmapMinOpacityM,
                                                radius: heatmapRadiusM,
                                                gradient: heatmapColorGradientM,
                                                blur: heatmapBlurM,
                                                map: this.map})

                // Add to feature group                                
                heatFg.addLayer(heatFgLayer)
                heatFg.options.name = this.heatLayer
                heatFg.options.layerDescription = layerDescription
                heatFg.options.layerType = "heat"
                heatFg.options.layerPriority = layerPriority
                heatFg.options.layerInclude = heatmapInclude
                heatFg.options.layerVisibility = layerVisibility
                this.heatLayers[this.heatLayer] = heatFg
            }

            var pointIntensity = this.pointIntensity = _.has(userData, "heatmapPointIntensity") ? userData["heatmapPointIntensity"]:1.0

            if(_.has(userData, "feature") && (!userData['latitude'] || !userData['longitude'])) {
                console.warn("Feature detected - not adding to heatmap")
            }

            if(userData['latitude'] && userData['longitude'] && heatmapInclude) {
                var heatLatLng = this.heatLatLng = L.latLng(parseFloat(userData['latitude']), parseFloat(userData['longitude']), parseFloat(this.pointIntensity))
                this.heatLayers[this.heatLayer].getLayers()[0].addLatLng(this.heatLatLng)
            }

            if(this.isArgTrue(heatmapOnly)) {
                return
            }
        }

        // Feature Layer implemented as polygon, but could be point, line or polygon
        if(_.has(userData, "feature")) {
            const featureLayer = this.featureLayer = _.has(userData, "featureLayer") ? userData["featureLayer"]:"feature"
            let feature

            if(!_.has(this.featureLayers, this.featureLayer)) {
                let featureFg = L.featureGroup()
                featureFg.options.name = this.featureLayer
                featureFg.options.layerDescription = layerDescription
                featureFg.options.layerPriority = layerPriority
                featureFg.options.layerVisibility = layerVisibility
                this.featureLayers[this.featureLayer] = featureFg
            }

            let latlngs = _.map(userData["feature"].split(';'), function(coordinates) {
                let latlngarr = coordinates.split(',')
                return L.latLng({lat: parseFloat(latlngarr[0]),
                                 lng: parseFloat(latlngarr[1])})
            })

            if(latlngs.length === 1) {
                feature = L.circleMarker(latlngs[0], {color: featureColor,
                    weight: featureWeight,
                    radius: featureRadius,
                    opacity: featureOpacity,
                    stroke: featureStroke,
                    fill: featureFill,
                    fillOpacity: featureFillOpacity,
                    fillColor: featureFillColor})
            } else if(!this.isArgTrue(featureFill)) {
                // Polyline: multi-point feature with fill disabled.
                // featureFill=false in SPL opts into line rendering rather than polygon.
                feature = L.polyline(latlngs, {color: featureColor,
                    weight: featureWeight,
                    opacity: featureOpacity})
            } else {
                feature = L.polygon(latlngs, {color: featureColor,
                    weight: featureWeight,
                    opacity: featureOpacity,
                    stroke: featureStroke,
                    fill: featureFill,
                    fillOpacity: featureFillOpacity,
                    fillColor: featureFillColor})
            }

            if(!_.isNull(featureDescription)) {
                feature.bindPopup(featureDescription)
            }

            if(!_.isNull(featureTooltip)) {
                feature.bindTooltip(featureTooltip, {permanent: this.isArgTrue(permanentTooltip),
                                                     direction: 'auto',
                                                     sticky: this.isArgTrue(stickyTooltip)})
            }
            this.featureLayers[this.featureLayer].addLayer(feature)

            // No latitude or longitude fields
            if(!_.has(userData, "latitude") || !_.has(userData, "longitude")) {
                return
            }
        }

        // Set icon options
        var icon = _.has(userData, "icon") ? userData["icon"]:"circle"
        var layerIcon = _.has(userData, "layerIcon") ? userData["layerIcon"]:icon
        var layerIconPrefix = _.has(userData, "layerIconPrefix") ? userData["layerIconPrefix"]:prefix
        var layerIconColor = _.has(userData, "layerIconColor") ? userData["layerIconColor"]:iconColor
        var layerIconSize = _.has(userData, "layerIconSize") ? userData["layerIconSize"]:"20,20"
        var clusterGroup = _.has(userData, "clusterGroup") ? userData["clusterGroup"]:"default"
        var layerGroup = _.has(userData, "layerGroup") ? userData["layerGroup"]:clusterGroup !== "default" ? clusterGroup:icon

        // When using ionicons use material design by default unless explicitly set
        if(prefix == "ion") { 
            if(!/^(md|ios|logo)-/.test(icon)) {
                prefix += "-md"
                layerIconPrefix += "-md"
            }
        }
    
        // Set icon class
        if(/^(fa-)?map-marker/.test(icon) || /^(fa-)?map-pin/.test(icon)) {
            var className = ""
            var popupAnchor = [-3, -35]
        } else {
            var className = "awesome-marker"
            var popupAnchor = _.has(userData, "popupAnchor") ? this.stringToPoint(userData["popupAnchor"]):[1,-35]
        }

        // SVG and PNG based markers both support hex iconColor do conversion outside
        iconColor = this.convertHex(iconColor)	

        markerType = _.isNull(customIcon) ? markerType:"custom"

        // Create marker
        // For non-milsymbol types, the icon is identical for every row in the same
        // layerGroup (same icon, color, size etc.) so we cache it on the layerFilter
        // entry after the first build and reuse it for all subsequent rows.
        // milsymbol icons vary per-row (SIDC, modifiers) so they are never cached here.
        if(markerType == "custom") {
            var _cachedIcon = this.layerFilter[layerGroup] && this.layerFilter[layerGroup].cachedIcon
            if(_cachedIcon) {
                var markerIcon = _cachedIcon
            } else {
                var customIconShadow = _.has(userData, "customIconShadow") ? (_SPLUNK_ORIGIN || location.origin) + this.contribUri + '/images/' + userData["customIconShadow"]:""
                var markerIcon = L.icon({
                    iconUrl: (_SPLUNK_ORIGIN || location.origin) + this.contribUri + '/images/' + customIcon,
                    shadowUrl: customIconShadow,
                    iconSize: markerSize,
                    iconAnchor: markerAnchor,
                    shadowAnchor: shadowAnchor,
                    popupAnchor: popupAnchor
                })
            }
        }

        if (markerType == "svg") {
            // Update marker to shade of Awesome Marker blue
            if(markerColor == "blue") { markerColor = "#38AADD" }
            markerColor = this.convertHex(markerColor)
            layerIconColor = _.has(userData, "layerIconColor") ? userData["layerIconColor"]:markerColor
            popupAnchor = _.has(userData, "popupAnchor") ? this.stringToPoint(userData["popupAnchor"]):[2,-50]

            var _cachedIcon = this.layerFilter[layerGroup] && this.layerFilter[layerGroup].cachedIcon
            var markerIcon = _cachedIcon || L.VectorMarkers.icon({
                icon: icon,
                iconColor: iconColor,
                markerColor: markerColor,
                shadowSize: shadowSize,
                shadowAnchor: shadowAnchor,
                extraIconClasses: extraClasses,
                prefix: prefix,
                popupAnchor: popupAnchor,
                iconSize: markerSize,
                iconAnchor: markerAnchor,
            })
        } 
        
        if(markerType == "png") {
            // Create markerIcon
            layerIconColor = _.has(userData, "layerIconColor") ? userData["layerIconColor"]:markerColor
            if(layerIconColor === "blue") { layerIconColor = "#38AADD"}

            var _cachedIcon = this.layerFilter[layerGroup] && this.layerFilter[layerGroup].cachedIcon
            var markerIcon = _cachedIcon || L.AwesomeMarkers.icon({
                icon: icon,
                markerColor: markerColor,
                iconColor: iconColor,
                prefix: prefix,
                className: className,
                extraClasses: extraClasses,
                popupAnchor: popupAnchor,
                description: description,
                iconAnchor: markerAnchor
            })
        }

        if(markerType == "milsymbol") {
            // Resolve the base size from per-row userData (default 35).
            // The zoomend handler will scale from this value at runtime.
            var msBaseSize = _.has(userData, "msSize") ? parseFloat(userData["msSize"]) : 35
            var msInitialSize = this._getMilsymbolSizeForZoom(msBaseSize, this.map.getZoom())

            var markerIcon = this._buildMilsymbolIcon(
                userData,
                msInitialSize,
                renderer,
                msColorMode,
                msFrameColor,
                msIconColor,
                msInfoColor,
                msInfoBackground,
                msInfoBackgroundFrame,
                msOutlineColor,
                msStandard
            )
        }


        if(markerType == "icon") {
            popupAnchor = _.has(userData, "popupAnchor") ? this.stringToPoint(userData["popupAnchor"]):[0,-55]
            className = "icon-only"

            var _cachedIcon = this.layerFilter[layerGroup] && this.layerFilter[layerGroup].cachedIcon
            if(_cachedIcon) {
                var markerIcon = _cachedIcon
            } else {
                var divIconHtml = '<i class="' + extraClasses + ' ' + prefix + ' ' + prefix + '-' + icon + '" style="color: ' + iconColor + '"></i>'
                var markerIcon = L.divIcon({
                    html: divIconHtml,
                    className: className,
                    icon: icon,
                    markerColor: iconColor,
                    iconColor: iconColor,
                    prefix: prefix,
                    extraClasses: extraClasses,
                    popupAnchor: popupAnchor,
                    description: description,
                    iconAnchor: markerAnchor
                })
            }
        }

        if(!this.validMarkerTypes.includes(markerType)) {
            // throw viz error
            throw new SplunkVisualizationBase.VisualizationError(
                'Invalid markerType ' + markerType + ' - valid types: custom, png, icon, svg, circle, milsymbol'

            )
        }

        var markerOptions = {markerType: markerType,
            radius: circleRadius,
            stroke: circleStroke,
            color: circleColor,
            weight: circleWeight,
            opacity: circleOpacity,
            fillColor: circleFillColor,
            fillOpacity: circleFillOpacity,
            userData: userData,
            markerIcon: markerIcon,
            layerDescription: layerDescription,
            markerPriority: markerPriority,
            layerPriority: layerPriority,
            permanentTooltip: this.isArgTrue(permanentTooltip),
            stickyTooltip: this.isArgTrue(stickyTooltip),
            cluster: this.isArgTrue(cluster),
            layerFilter: this.layerFilter,
            layerGroup: layerGroup,
            clusterGroup: clusterGroup,
            tooltip: tooltip,
            title: title,
            drilldown: drilldown,
            drilldownAction: drilldownAction}

        // Create Cluster Group
        // Resolve per-group color: SPL fields > formatter named entry > formatter default > null
        // If only one SPL field is provided, use it for both bg and fg.
        var cgBgColor = null
        var cgFgColor = null
        if (_.has(userData, 'clusterBgColor') || _.has(userData, 'clusterFgColor')) {
            cgBgColor = _.has(userData, 'clusterBgColor') ? this.parseColor(userData['clusterBgColor']) : null
            cgFgColor = _.has(userData, 'clusterFgColor') ? this.parseColor(userData['clusterFgColor']) : null
            // Fall back: if one field is missing, use the other for both
            cgBgColor = cgBgColor || cgFgColor
            cgFgColor = cgFgColor || cgBgColor
        } else if (clusterColorMap[clusterGroup]) {
            cgBgColor = clusterColorMap[clusterGroup].bg
            cgFgColor = clusterColorMap[clusterGroup].fg
        } else if (clusterColorMap['default']) {
            cgBgColor = clusterColorMap['default'].bg
            cgFgColor = clusterColorMap['default'].fg
        }

        // Sanitize clusterGroup name for use as a CSS class suffix
        var safeGroupName = clusterGroup.replace(/[^a-zA-Z0-9-_]/g, '-')
        if (cgBgColor && (safeGroupName === 'one' || safeGroupName === 'two' || safeGroupName === 'three')) {
            console.warn('Maps+: clusterGroup name "' + clusterGroup + '" conflicts with reserved threshold class names. Colors may not apply correctly.')
        }

        if(_.isUndefined(this.clusterGroups[clusterGroup])) {
            var cg = this._createClusterGroup(disableClusteringAtZoom,
                                                disableClusteringAtZoomLevel,
                                                maxClusterRadius,
                                                maxSpiderfySize,
                                                spiderfyDistanceMultiplier,
                                                singleMarkerMode,
                                                animate,
                                                criticalThreshold,
                                                warningThreshold,
                                                antarcticProj,
                                                cgBgColor,
                                                cgFgColor,
                                                safeGroupName,
                                                this)

            this.clusterGroups[clusterGroup] = cg
            cg.addTo(this.map)
        }

        // Create Clustered featuregroup subgroup layer
        if (_.isUndefined(this.layerFilter[layerGroup]) && this.isArgTrue(cluster)) {
            this.layerFilter[layerGroup] = {'group' : L.featureGroup.subGroup(),
                                            'name' : layerGroup,
                                            'iconStyle' : icon,
                                            'layerExists' : false,
                                            'clusterGroup': [],
                                            'clusterColor': cgFgColor || null
                                            }
        // Create regular feature group
        } else if (_.isUndefined(this.layerFilter[layerGroup])) {
            this.layerFilter[layerGroup] = {'group' : L.featureGroup(),
                                            'name' : layerGroup,
                                            'markerList' : [],
                                            'iconStyle' : icon,
                                            'layerExists' : false
                                            }
        }

        // Add clusterGroup to layerGroup
        if(this.isArgTrue(cluster)
            && clusterGroup != ""
            && typeof _.findWhere(this.layerFilter[layerGroup].clusterGroup, {groupName: clusterGroup}) == 'undefined') {
            this.layerFilter[layerGroup].clusterGroup.push({'groupName': clusterGroup,
                                                            'cg': this.clusterGroups[clusterGroup],
                                                            'markerList': [],
                                                            'clusterColor': cgFgColor || null,
                                                            'layerExists': false})
        }

        if (!_.isUndefined(this.layerFilter[layerGroup])) {
            this.layerFilter[layerGroup].layerDescription = layerDescription
            this.layerFilter[layerGroup].layerIcon = layerIcon
            this.layerFilter[layerGroup].layerIconPrefix = layerIconPrefix
            this.layerFilter[layerGroup].layerIconColor = layerIconColor
            this.layerFilter[layerGroup].layerIconSize = layerIconSize
            this.layerFilter[layerGroup].layerVisibility = layerVisibility
            // Cache the built icon for reuse by subsequent rows in this layerGroup.
            // milsymbol icons vary per-row so they are intentionally excluded here.
            if(markerType !== "milsymbol" && !this.layerFilter[layerGroup].cachedIcon && !_.isUndefined(markerIcon)) {
                this.layerFilter[layerGroup].cachedIcon = markerIcon
            }
        }

        if (_.has(userData, "markerVisibility")) {
            if (userData["markerVisibility"] == "marker" || this.isArgTrue(userData["markerVisibility"])) {
                this._addMarker(markerOptions)
            }
        } else {
            this._addMarker(markerOptions)
        }
    }, this)
    
    // Clustered
    if (this.isArgTrue(cluster)) {
        this._addClustered(this.map, {layerFilter: this.layerFilter,
                                      layerControl: this.isArgTrue(layerControl),
                                      control: this.control,
                                      context: this})
    // Single value or Circle Marker
    } else {
        this._addUnclustered(this.map, {layerFilter: this.layerFilter,
                                        layerControl: this.isArgTrue(layerControl),
                                        allPopups: this.isArgTrue(allPopups),
                                        paneZIndex: this.paneZIndex,
                                        control: this.control,
                                        context: this})
    }

    // Draw path lines
    if (this.isArgTrue(showPathLines)) {
        var activePaths = []
        var colors = _.map(pathColorList.split(','), function(color) {
            return this.convertHex(color)
        }, this)

        var pathData = this.pathData = []
        var interval = pathSplitInterval * 1000
        var intervalCounter = 0
        var previousTime = new Date()

        var paths = _.chain(dataRows)
            .map(function (d) {
                var id = undefined,
                    colorIndex = 0,
                    pathWeight = _.has(d, "pathWeight") ? d["pathWeight"]:5,
                    pathOpacity = _.has(d, "pathOpacity") ? d["pathOpacity"]:0.5,
                    dt = _.has(d, "_time") ? moment(d["_time"]):"",
                    tooltip = _.has(d, "tooltip") ? d["tooltip"]:"",
                    description = _.has(d, "description") ? d["description"]:"",
                    antPath = _.has(d, "antPath") ? d["antPath"]:null,
                    antPathDelay = _.has(d, "antPathDelay") ? d["antPathDelay"]:1000,
                    antPathPulseColor = _.has(d, "antPathPulseColor") ? d["antPathPulseColor"]:"#FFFFFF",
                    antPathPaused = _.has(d, "antPathPaused") ? d["antPathPaused"]:false,
                    antPathReverse = _.has(d, "antPathReverse") ? d["antPathReverse"]:false,
                    antPathDashArray = _.has(d, "antPathDashArray") ? d["antPathDashArray"]:"10,20",
                    layerDescription = _.has(d, "layerDescription") ? d["layerDescription"]:"",
                    layerPriority = _.has(d, "layerPriority") ? d["layerPriority"]:undefined,
                    layerVisibility = _.has(d, "layerVisibility") ? d["layerVisibility"]:true,
                    pathLayer = _.has(d, "pathLayer") ? d["pathLayer"]:undefined,
                    playback = _.has(d, "playback") ? d["playback"]:showPlayback,
                    prefix = _.has(d, "prefix") ? d["prefix"]:"fa",
                    icon = _.has(d, "icon") ? d["icon"]:"play-circle"

                if (pathIdentifier) {
                    id = d[pathIdentifier]
                    colorIndex = activePaths.indexOf(id)
                    if (colorIndex < 0) {
                        colorIndex = activePaths.push(id) - 1
                    }
                }
                var color = (_.has(d, "pathColor")) ? d["pathColor"] : colors[colorIndex % colors.length]
                return {
                    'time': dt,
                    'id': id,
                    'coordinates': L.latLng(d['latitude'], d['longitude']),
                    'latlng': [parseFloat(d['longitude']),parseFloat(d['latitude'])],
                    'colorIndex': colorIndex,
                    'pathWeight': pathWeight,
                    'pathOpacity': pathOpacity,
                    'tooltip': tooltip,
                    'description': description,
                    'permanentTooltip': permanentTooltip,
                    'stickyTooltip': stickyTooltip,
                    'color': color,
                    'antPath': antPath,
                    'antPathDelay': antPathDelay,
                    'antPathPulseColor': antPathPulseColor,
                    'antPathPaused': antPathPaused,
                    'antPathReverse': antPathReverse,
                    'antPathDashArray': antPathDashArray,
                    'layerDescription': layerDescription,
                    'layerPriority': layerPriority,
                    'layerVisibility': layerVisibility,
                    'pathLayer': pathLayer,
                    'playback': playback,
                    'showPlayback': showPlayback,
                    'layerControl': layerControl,
                    'layerType': "path",
                    'icon': icon,
                    'prefix': prefix,
                    'unixtime': dt.valueOf()
                }
            })
            .each(function(d) {
                var dt = d.time
                if (interval && Math.abs(previousTime - dt) > interval) {
                    intervalCounter++
                }
                d.interval = 'interval' + intervalCounter

                previousTime = dt
            })
            .groupBy(function(d) {
                return d.id
            })
            .values()
            .value()

        if(this.isArgTrue(pathSplits)) {
            _.each(paths, function(path, i) {
                this.pathData = _.chain(path)
                    .groupBy(function(d) {
                        return d.interval
                })
                .values()
                .value()
                this.drawPath({data: this.pathData, pathLineLayers: this.pathLineLayers, context: this})
            }, this)
        } else {
            this.pathData = paths
            this.drawPath({data: this.pathData, pathLineLayers: this.pathLineLayers, context: this})
        }
    }


     /*
     * Fix for hidden divs using tokens in Splunk
     * https://github.com/Leaflet/Leaflet/issues/2738
     */
    if(this.mapSize.x == 0 && this.mapSize.y == 0) {
        var intervalId = this.intervalId = setInterval(function(that) {
            curSize = that.curSize = that.map.getSize()
            that.map.invalidateSize()
            if(that.curSize.x > 0 && that.curSize.y > 0) {
                clearInterval(that.intervalId)
            }
        }, 500, this)
    }

    // Update offset and fetch next chunk of data
    this.offset += dataRows.length

    setTimeout(function(that) {
        that.updateDataParams({count: that.chunk, offset: that.offset})
    }, 100, this)

    return this
}
})
})