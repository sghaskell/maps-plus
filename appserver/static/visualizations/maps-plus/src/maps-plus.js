define([
            'jquery',
            'underscore',
            'leaflet',
            'togeojson',
            'jszip',
            'jszip-utils',
            'api/SplunkVisualizationBase',
            'api/SplunkVisualizationUtils',
            'splunkjs/mvc',
            'load-google-maps-api',
            'moment',
            '../contrib/js/Modal',
            '../contrib/js/theme-utils',
            'spin.js',
            'leaflet-bing-layer',
			'leaflet-contextmenu',
			'leaflet-dialog',
            'leaflet-google-places-autocomplete',
            'leaflet.markercluster',
            'leaflet-ant-path',
            'simpleheat',
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
            '../contrib/js/jquery.i18n.emitter.bidi'
        ],
        function(
            $,
            _,
            L,
            toGeoJSON,
            JSZip,
            JSZipUtils,
            SplunkVisualizationBase,
            SplunkVisualizationUtils,
            mvc,
            loadGoogleMapsAPI,
            moment,
            Modal,
            themeUtils
        ) {


    
    return SplunkVisualizationBase.extend({
        maxResults: 0,
        paneZIndex: 400,
        tileLayer: null,
        measureDialogOpen: false,
        parentEl: null,
        parentView: null,
        showClearPlayback: false,
        mapOptions: {},
        contribUri: '/en-US/static/app/leaflet_maps_app/visualizations/maps-plus/contrib',
        validMarkerTypes: ["custom", "png", "icon", "svg", "circle"],
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
            'display.visualizations.custom.leaflet_maps_app.maps-plus.mapTile': 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
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
            'display.visualizations.custom.leaflet_maps_app.maps-plus.kmlOverlay' : "",
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
            'display.visualizations.custom.leaflet_maps_app.maps-plus.refreshInterval': 0,
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
            'display.visualizations.custom.leaflet_maps_app.maps-plus.heatmapColorGradient': '{"0.4":"blue","0.6":"cyan","0.7":"lime","0.8":"yellow","1":"red"}',
            'display.visualizations.custom.leaflet_maps_app.maps-plus.showProgress': 1
        },
        ATTRIBUTIONS: {
        'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png': '&copy; OpenStreetMap contributors',
        'http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png': '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
        'http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png': '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
        'http://tile.stamen.com/toner/{z}/{x}/{y}.png': 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.',
        'http://tile.stamen.com/terrain/{z}/{x}/{y}.jpg': 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://creativecommons.org/licenses/by-sa/3.0">CC BY SA</a>.',
        'http://tile.stamen.com/watercolor/{z}/{x}/{y}.jpg': 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://creativecommons.org/licenses/by-sa/3.0">CC BY SA</a>.'
        },

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments)
            this.$el = $(this.el)
            this.isInitializedDom = false
            this.isSplunkSeven = false
            this.curPage = 0
            this.allDataProcessed = false
            this.splunkVersion = parseFloat(0.0)     

            try {
                // Get version from global tokens
                this.splunkVersion = parseFloat(mvc.Components.getInstance("env").get('version'))
            } catch (error) {
                // Detect version from REST API
                $.ajax({
                    type: "GET",
                    async: false,
                    context: this,
                    url: "/en-US/splunkd/__raw/servicesNS/nobody/leaflet_maps_app/server/info",
                    success: function(s) {                                        
                        var xml = $(s)
                        var that = this
                        $(xml).find('content').children().children().each(function(i, v) {
                            if(/name="version"/.test(v.outerHTML)) {
                                that.splunkVersion = parseFloat(v.textContent)
                                if(that.splunkVersion >= 7.0) {
                                    that.isSplunkSeven = true
                                }
                            } 
                        })
                    },
                    error: function(e) {
                        //console.info(e)
                    }
                })
            }

            if(this.splunkVersion >= 7.0) {
                this.isSplunkSeven = true
            }
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

            var length = $('link[rel="stylesheet"][href*="visualization.css"]')[0].sheet.cssRules[10].styleSheet.cssRules.length
            // delete styles from newest to oldest                                  
            for(i=length-1; i >= 0; i--) {
                $('link[rel="stylesheet"][href*="visualization.css"]')[0].sheet.cssRules[10].styleSheet.deleteRule(i)
            }

            // insert dark styles
            for(i=0; i < styles.length; i++) {
                $('link[rel="stylesheet"][href*="visualization.css"]')[0].sheet.cssRules[10].styleSheet.insertRule(styles[i], i)
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
                measureCompletedColor = this._propertyExists('measureCompletedColor', configChanges) ? this._getEscapedProperty('measureCompletedColor', configChanges):this._getEscapedProperty('measureCompletedColor', previousConfig)

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
                $("<style>")
                 .prop("type", "text/css")
                 .html(html)
                 .appendTo("head")
            }

            // Cluster Foreground Range 1
            if(this._propertyExists('rangeOneFgColor', configChanges)) {
                fgRgb = rangeOneFgColor
                fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)'

                html = '.marker-cluster-one div { background-color: ' + fgRgba + ';}'
                $("<style>")
                 .prop("type", "text/css")
                 .html(html)
                 .appendTo("head")
            }

            // Cluster Background Range 2
            if(this._propertyExists('rangeTwoBgColor', configChanges)) {
                bgRgb = rangeTwoBgColor
                bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', 0.6)'

                html = '.marker-cluster-two { background-color: ' + bgRgba + ';}'
                $("<style>")
                 .prop("type", "text/css")
                 .html(html)
                 .appendTo("head")
            }

            // Cluster Foreground Range 2
            if(this._propertyExists('rangeTwoFgColor', configChanges)) {
                fgRgb = rangeTwoFgColor
                fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)'

                html = '.marker-cluster-two div { background-color: ' + fgRgba + ';}'
                $("<style>")
                 .prop("type", "text/css")
                 .html(html)
                 .appendTo("head")
            }

            // Cluster Background Range 3
            if(this._propertyExists('rangeThreeBgColor', configChanges)) {
                bgRgb = rangeThreeBgColor
                bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', 0.6)'

                html = '.marker-cluster-three { background-color: ' + bgRgba + ';}'
                $("<style>")
                 .prop("type", "text/css")
                 .html(html)
                 .appendTo("head")
            }

            // Cluster Foreground Range 3
            if(this._propertyExists('rangeThreeFgColor', configChanges)) {
                fgRgb = rangeThreeFgColor
                fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)'

                html = '.marker-cluster-three div { background-color: ' + fgRgba + ';}'
                $("<style>")
                 .prop("type", "text/css")
                 .html(html)
                 .appendTo("head")
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
        },

        // Build object of key/value pairs for invalid fields
        // to be used as data for _drilldown action
        validateFields: function(obj) {
            var invalidFields = {}
            var validFields = ['latitude',
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
                               '_time']
            $.each(obj, function(key, value) {
                if($.inArray(key, validFields) === -1) {
                    invalidFields[key] = value
                }
            })

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

        _propertyExists: function(name, config) {
            return _.has(config, this.getPropertyNamespaceInfo().propertyNamespace + name)
        },

		// Custom drilldown behavior for markers
        _drilldown: function(drilldownFields, resource) {
            payload = {
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
				markerColor = "#" + hexRegex.exec(value)[1]
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
      
        // Create RGBA string and corresponding HTML to dynamically set marker CSS in HTML head
        createMarkerStyle: function(bgHex, fgHex, markerName) {
            var bgRgb = this.hexToRgb(bgHex)
            var fgRgb = this.hexToRgb(fgHex)
            var bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', 0.6)'
            var fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)'

            var html = '.marker-cluster-' + markerName + ' { background-color: ' + bgRgba + ';} .marker-cluster-' + markerName + ' div { background-color: ' + fgRgba + ';}'
            $("<style>")
                .prop("type", "text/css")
                .html(html)
                .appendTo("head")
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
                    pathFg.options.layerDescription = layerDescription
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

                const geoJSON = {
                    "type": "Feature",
                    "geometry": {
                      "type": "LineString",
                      "coordinates":_.pluck(p, 'latlng')
                    },
                    "properties": {
                        "title" : p[0]['id'],
                        "prefix": p[0]['prefix'],
                        "icon": p[0]['icon'],
                        "path_options" : { "color" : options.context.convertHex(p[0]['color']) },
                        "time": _.pluck(p, 'unixtime')
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
                    
                    var pl = L.polyline.antPath(_.pluck(p, 'coordinates'), antPathOptions).bindPopup(p[0]['description'])
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
                    var pl = L.polyline(_.pluck(p, 'coordinates'), pathOptions).bindPopup(p[0]['description'])
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
                styleColor = _.has(options.layerGroup, 'layerIconColor') ? options.layerGroup.layerIconColor:undefined
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
                // Circle Marker
                if(_.has(options.layerGroup.circle, "fillColor")) {
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
            this.map.on('dialog:closed', function(e) { 
                this.coordDialog.destroy()
            }, this)

            var coordinates = e.latlng.toString().match(/([-\d\.]+)/g)
            var centerCoordinates = this.map.getCenter().toString().match(/([-\d\.]+)/g)
            var curZoom = this.map.getZoom()
            
            var content = "Pointer Latitude: <input type=\"text\" name=\"pointer_lat\" value=\"" + coordinates[0] + "\">" +
                  "<br>Pointer Longitude: <input type=\"text\" name=\"pointer_long\" value=\"" + coordinates[1] + "\">" +
                  "<br>Zoom Level: <input type=\"text\" name=\"zoom_level\" value=\"" + curZoom + "\">" +
                  "<br></br>Copy and paste the following values into Format menu to change <b>Center Lat</b> and <b>Center Lon</b> (visualization API does not currently support programmatically setting format menu options):<br>" +
                  "<br>Center Latitude: <input type=\"text\" name=\"center_lat\" value=\"" + centerCoordinates[0] + "\">" +
                  "<br>Center Longitude: <input type=\"text\" name=\"center_lon\" value=\"" + centerCoordinates[1] + "\">"

            var coordDialog = this.coordDialog = L.control.dialog({size: [300,435], anchor: [100, 500]})
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
        fetchKmlAndMap: function(url, file, map, paneZIndex) {
            // Test if it's a kmz file
            if(/.*\.kmz/.test(file)) {
                JSZipUtils.getBinaryContent(url, function (e, d) {
                    var z = new JSZip()

                    z.loadAsync(d)
                    .then(function(zip) {
                        return zip.file(/.*\.kml/)[0].async("string")
                    })
                    .then(function (text) {
                        var kmlText = $.parseXML(text)
                        var geojson = toGeoJSON.kml(kmlText)

						L.geoJson(geojson.features, {
							style: function (feature) {
                                return {stroke: _.has(feature.properties, "stroke") ? feature.properties.stroke : '#FFFFFF',
                                        color: _.has(feature.properties, "fill") ? feature.properties.fill : _.has(feature.properties,"stroke") ? feature.properties.stroke : "#FFFFFF",
                                        opacity: _.has(feature.properties, "fill-opacity") ? feature.properties["fill-opacity"] : 0.5,
                                        weight: _.has(feature.properties, "stroke-width") ? feature.properties["stroke-width"] : 1 }
                             },
							onEachFeature: function (feature, layer) {
							 	// Create pane and set zIndex to render multiple KML files over each other based on
							 	// specified precedence in overlay menu 
                                map.createPane(feature.properties.name)
                                map.getPane(feature.properties.name).style.zIndex = paneZIndex
                                layer.options.pane = feature.properties.name
                                layer.defaultOptions.pane = feature.properties.name
                                layer.bindPopup(feature.properties.name)
                                layer.bindTooltip(feature.properties.name)
							}
						}).addTo(map)
                    })
                })
            // it's a kml file
            } else {
                $.ajax({url: url, dataType: 'xml', context: this}).done(function(kml) {
                    var geojson = toGeoJSON.kml(kml)
					L.geoJson(geojson.features, {
						style: function (feature) {
                            return {stroke: _.has(feature.properties, "stroke") ? feature.properties.stroke : '#FFFFFF',
                                    color: _.has(feature.properties, "fill") ? feature.properties.fill : _.has(feature.properties,"stroke") ? feature.properties.stroke : "#FFFFFF",
                                    opacity: _.has(feature.properties, "fill-opacity") ? feature.properties["fill-opacity"] : 0.5,
                                    weight: _.has(feature.properties, "stroke-width") ? feature.properties["stroke-width"] : 1 }
                         },
						 onEachFeature: function (feature, layer) {
							 // Create pane and set zIndex to render multiple KML files over each other based on
							 // specified precedence in overlay menu 
                             map.createPane(feature.properties.name)
                             map.getPane(feature.properties.name).style.zIndex = paneZIndex
                             layer.options.pane = feature.properties.name
                             layer.defaultOptions.pane = feature.properties.name
							 layer.bindPopup(feature.properties.name)
							 layer.bindTooltip(feature.properties.name)
						}
					}).addTo(map)
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

            var mcg = new L.MarkerClusterGroup({
                chunkedLoading: true,
                maxClusterRadius: maxClusterRadius,
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
           
            if(this.isArgTrue(disableClusteringAtZoom)) {
                mcg.options.disableClusteringAtZoom = disableClusteringAtZoomLevel
                mcg.options.spiderfyOnMaxZoom = false
            }

            return mcg
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
                marker.on(options.drilldownAction, this._drilldown.bind(this, drilldownFields))
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
                kmlOverlay  = this._getEscapedProperty('kmlOverlay', config),
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
                refreshInterval = parseInt(this._getEscapedProperty('refreshInterval', config)) * 1000,
                heatmapEnable = parseInt(this._getEscapedProperty('heatmapEnable', config)),
                heatmapOnly = parseInt(this._getEscapedProperty('heatmapOnly', config)),
                heatmapMinOpacity = parseFloat(this._getEscapedProperty('heatmapMinOpacity', config)),
                heatmapRadius = parseInt(this._getEscapedProperty('heatmapRadius', config)),
                heatmapBlur = parseInt(this._getEscapedProperty('heatmapBlur', config)),
                heatmapColorGradient = this._stringToJSON(this._getProperty('heatmapColorGradient', config)),
                showProgress = parseInt(this._getEscapedProperty('showProgress', config))

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

                // Dashboard refresh
                if(refreshInterval > 0) {
                    setTimeout(function() {
                        location.reload()
                    }, refreshInterval)
                }
            } 
            
            // Check for data and retrun if we don't have any
            if(!_.has(data, "results")) {
                return this
            }

            // get data
            var dataRows = data.results

            // check for data
            if (!dataRows || dataRows.length === 0 || dataRows[0].length === 0) {
                return this
            }

            // Make sure we're on Splunk 7.x+
            if(!this.isSplunkSeven) {
                // Render warning modal
                this.renderModal('splunk-version-warning',
                        "Unsupported Splunk Version",
                        "<div class=\"alert alert-warning\"><i class=\"icon-alert\"></i>Unsupported Splunk version detected - Maps+ for Splunk requires Splunk 7.x</div>",
                        'Close')

                // throw viz error
                throw new SplunkVisualizationBase.VisualizationError(
                    'Unsupported Splunk version detected - Maps+ for Splunk requires Splunk 7.x'
                )
            }

            // Validate we have at least latitude and longitude fields
            if(!("latitude" in dataRows[0]) || !("longitude" in dataRows[0])) {
                if( !("feature" in dataRows[0])){
                    throw new SplunkVisualizationBase.VisualizationError(
                        'Incorrect Fields Detected - latitude & longitude fields required'
                    )
                }
            }

            pathSplits = parseInt(this._getEscapedProperty('pathSplits', config)),
            renderer = this._getEscapedProperty('renderer', config),
            pathSplitInterval = parseInt(this._getEscapedProperty('pathSplitInterval', config))

            this.activeTile = (mapTileOverride) ? mapTileOverride:mapTile
            this.attribution = (mapAttributionOverride) ? mapAttributionOverride:this.ATTRIBUTIONS[mapTile]

            // Initialize the DOM
            if (!this.isInitializedDom) {
                // Set defaul icon image path
                L.Icon.Default.imagePath = location.origin + this.contribUri + '/images/'

                // Create layer filter object
                var layerFilter = this.layerFilter = {}

                // Create clusterGroups
                var clusterGroups = this.clusterGroups = {}

                // Setup cluster marker CSS
                this.createMarkerStyle(rangeOneBgColor, rangeOneFgColor, "one")
                this.createMarkerStyle(rangeTwoBgColor, rangeTwoFgColor, "two")
                this.createMarkerStyle(rangeThreeBgColor, rangeThreeFgColor, "three")

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

                // Create map 
                var map = this.map = new L.Map(this.el, this.mapOptions).setView([mapCenterLat, mapCenterLon], mapCenterZoom)

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
                            //console.error(err)
                            console.err("Failed to initialize Google Places search control")
                        })
                    }, this))
                }

                // Create Bing Map
                if(this.isArgTrue(bingMaps)) {
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
                    // Setup the tile layer with map tile, zoom and attribution
                    this.tileLayer = L.tileLayer(this.activeTile, {
                        attribution: this.attribution,
                        minZoom: minZoom,
                        maxZoom: maxZoom
                    })
                    // Add tile layer to map
                    this.map.addLayer(this.tileLayer)    
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

                    // var measureControl = new L.Control.Measure(measureOptions)
                    this.measureControl = new L.Control.Measure(measureOptions)
                    this.measureControl.addTo(this.map)

                    if(this.isDarkTheme) { this._darkModeUpdate() }                    
                }

                // Iterate through KML files and load overlays into layers on map 
                if(kmlOverlay) {
                    // Create array of kml/kmz files
                    var kmlFiles = kmlOverlay.split(/\s*,\s*/)
					// Pane zIndex used to facilitate layering of multiple KML/KMZ files
                    var paneZIndex = this.paneZIndex = 400

                    // Loop through each file and load it onto the map
                    _.each(kmlFiles.reverse(), function(file, i) {
                        var url = location.origin + this.contribUri + '/kml/' + file
                        this.fetchKmlAndMap(url, file, this.map, this.paneZIndex)
                        this.paneZIndex = this.paneZIndex - (i+1)
                    }, this)
                }
                
                //var pathLineLayer = this.pathLineLayer = L.layerGroup()
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

                // Load localization file and init locale
                var i18n = $.i18n()
                i18n.locale = i18nLanguage
                i18n.load(location.origin + this.contribUri + '/i18n/' + i18nLanguage + '.json', i18n.locale)
                
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

            // Map Scroll
            (this.isArgTrue(scrollWheelZoom)) ? this.map.scrollWheelZoom.enable() : this.map.scrollWheelZoom.disable()

            if(!this.isArgTrue(bingMaps)) {
                // Reset Tile If Changed
                if(this.tileLayer._url != this.activeTile) {
                    this.tileLayer.setUrl(this.activeTile)
                }
            }   

            // Reset tile zoom levels if changed
            if(!_.isNull(this.tileLayer)) {
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

           
			/********* BEGIN PROCESSING DATA **********/
 
            // Iterate through each row creating layer groups per icon type
            // and create markers appending to a markerList in each layerfilter object
            _.each(dataRows, function(userData, i) {
                // if (_.has(userData,"markerVisibility") && userData["markerVisibility"] != "marker") {
                //     if(!this.isArgTrue(userData["markerVisibility"])) {
                //         console.log("true -- good")
                //     } else {
                //         console.log("skipping")
                //         return
                //     }
                    
                //if (_.has(userData,"markerVisibility") && userData["markerVisibility"] != "marker") {
                //console.log(this.isArgTrue(userData["markerVisibility"]))
                //if (_.has(userData,"markerVisibility") && !this.isArgTrue(userData["markerVisibility"])) {
                    // Skip the marker to improve performance of rendering
                    
                // }

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
                    layerDescription  = _.has(userData, "layerDescription") ? userData["layerDescription"]:""
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
                var layerGroup = _.has(userData, "layerGroup") ? userData["layerGroup"]:icon
                var clusterGroup = _.has(userData, "clusterGroup") ? userData["clusterGroup"]:"default"

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
                if(markerType == "custom") {
                    var customIconShadow = _.has(userData, "customIconShadow") ? location.origin + this.contribUri + '/images/' + userData["customIconShadow"]:""
                    
                    var markerIcon = L.icon({
                        iconUrl: location.origin + this.contribUri + '/images/' + customIcon,
                        shadowUrl: customIconShadow,
                        iconSize: markerSize,
                        iconAnchor: markerAnchor,
                        shadowAnchor: shadowAnchor,
                        popupAnchor: popupAnchor
                    })
                }

                if (markerType == "svg") {
					// Update marker to shade of Awesome Marker blue
					if(markerColor == "blue") { markerColor = "#38AADD" }
                    markerColor = this.convertHex(markerColor)
                    layerIconColor = _.has(userData, "layerIconColor") ? userData["layerIconColor"]:markerColor
                    popupAnchor = _.has(userData, "popupAnchor") ? this.stringToPoint(userData["popupAnchor"]):[2,-50]

                    var markerIcon = L.VectorMarkers.icon({
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
                    var markerIcon = L.AwesomeMarkers.icon({
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

                if(markerType == "icon") {
                    popupAnchor = _.has(userData, "popupAnchor") ? this.stringToPoint(userData["popupAnchor"]):[0,-55]
                    className = "icon-only"
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

                if(!this.validMarkerTypes.includes(markerType)) {
                    // throw viz error
                    throw new SplunkVisualizationBase.VisualizationError(
                        'Invalid markerType ' + markerType + ' - valid types: custom, png, icon, svg, circle'
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
                                                        this)

                    this.clusterGroups[clusterGroup] = cg
                    cg.addTo(this.map)
                }

                // Create Clustered featuregroup subgroup layer
                if (_.isUndefined(this.layerFilter[layerGroup]) && this.isArgTrue(cluster)) {
                    this.layerFilter[layerGroup] = {'group' : L.featureGroup.subGroup(),
                                                    'iconStyle' : icon,
                                                    'layerExists' : false,
                                                    'clusterGroup': []
                                                    }
                // Create regular feature group
                } else if (_.isUndefined(this.layerFilter[layerGroup])) {
                    this.layerFilter[layerGroup] = {'group' : L.featureGroup(),
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
                                                                    'markerList': []})
                }

                if (!_.isUndefined(this.layerFilter[layerGroup])) {
                    this.layerFilter[layerGroup].layerDescription = layerDescription
                    this.layerFilter[layerGroup].layerIcon = layerIcon
                    this.layerFilter[layerGroup].layerIconPrefix = layerIconPrefix
                    this.layerFilter[layerGroup].layerIconColor = layerIconColor
                    this.layerFilter[layerGroup].layerIconSize = layerIconSize
                    this.layerFilter[layerGroup].layerVisibility = layerVisibility
                }

                if (_.has(userData, "markerVisibility")) {
                    if (userData["markerVisibility"] == "marker" || this.isArgTrue(userData["markerVisibility"])) {
                        this._addMarker(markerOptions)
                    }
                } else {
                    this._addMarker(markerOptions)
                }
            }, this)
            
            // Enable layer controls and toggle collapse 
            if (this.isArgTrue(layerControl)) {           
                this.control.options.collapsed = this.isArgTrue(layerControlCollapsed)
                this.control.addTo(this.map)                
                if(this.isDarkTheme) { this._darkModeUpdate() }
            } 

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
                        var colorIndex = 0
                            pathWeight = _.has(d, "pathWeight") ? d["pathWeight"]:5
                            pathOpacity = _.has(d, "pathOpacity") ? d["pathOpacity"]:0.5
						    dt = _.has(d, "_time") ? moment(d["_time"]):""
                            tooltip = _.has(d, "tooltip") ? d["tooltip"]:""
                            description = _.has(d, "description") ? d["description"]:""
                            antPath = _.has(d, "antPath") ? d["antPath"]:null
                            antPathDelay = _.has(d, "antPathDelay") ? d["antPathDelay"]:1000
                            antPathPulseColor = _.has(d, "antPathPulseColor") ? d["antPathPulseColor"]:"#FFFFFF"
                            antPathPaused = _.has(d, "antPathPaused") ? d["antPathPaused"]:false
                            antPathReverse = _.has(d, "antPathReverse") ? d["antPathReverse"]:false
                            antPathDashArray = _.has(d, "antPathDashArray") ? d["antPathDashArray"]:"10,20"
                            layerDescription = _.has(d, "layerDescription") ? d["layerDescription"]:"",
                            layerPriority = _.has(d, "layerPriority") ? d["layerPriority"]:undefined,
                            layerDescription = _.has(d, "layerDescription") ? d["layerDescription"]:"",
                            layerVisibility = _.has(d, "layerVisibility") ? d["layerVisibility"]:true,
                            pathLayer = _.has(d, "pathLayer") ? d["pathLayer"]:undefined,
                            playback = _.has(d, "playback") ? d["playback"]:showPlayback,
                            prefix = _.has(d, "prefix") ? d["prefix"]:"fa",
                            icon = _.has(d, "icon") ? d["icon"]:"play-circle"

                        if (pathIdentifier) {
                            var id = d[pathIdentifier]
                            var colorIndex = activePaths.indexOf(id)
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
            // if(this.isSplunkSeven) {
            this.offset += dataRows.length

            setTimeout(function(that) {
                that.updateDataParams({count: that.chunk, offset: that.offset})
            }, 100, this)

            return this
        }
    })
})
