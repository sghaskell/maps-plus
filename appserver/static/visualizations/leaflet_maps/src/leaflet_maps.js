define([
            'jquery',
            'underscore',
            'leaflet',
            'togeojson',
            'jszip',
            'jszip-utils',
            'api/SplunkVisualizationBase',
            'api/SplunkVisualizationUtils',
            'load-google-maps-api',
            'leaflet-bing-layer',
			'leaflet-contextmenu',
			'leaflet-dialog',
            'leaflet-google-places-autocomplete',
            '../contrib/leaflet.markercluster-src',
            '../contrib/leaflet.featuregroup.subgroup-src',
            '../contrib/leaflet-measure',
			'../contrib/leaflet.awesome-markers',
            '../contrib/leaflet-vector-markers'
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
            loadGoogleMapsAPI
        ) {


    return SplunkVisualizationBase.extend({
        maxResults: 0,
        tileLayer: null,
		mapOptions: {},
        contribUri: '/en-US/static/app/leaflet_maps_app/visualizations/leaflet_maps/contrib/',
        defaultConfig:  {
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.cluster': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.allPopups': 0,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.multiplePopups': 0,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.animate': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.singleMarkerMode': 0,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.maxClusterRadius': 80,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.maxSpiderfySize': 100,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.spiderfyDistanceMultiplier': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.mapTile': 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.mapTileOverride': "",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.mapAttributionOverride': "",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.layerControl' : 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.layerControlCollapsed': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.scrollWheelZoom': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.fullScreen': 0,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.drilldown': 0,
			'display.visualizations.custom.leaflet_maps_app.leaflet_maps.contextMenu': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.defaultHeight': 600,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.autoFitAndZoom': 1,
			'display.visualizations.custom.leaflet_maps_app.leaflet_maps.autoFitAndZoomDelay': 500,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.mapCenterZoom': 6,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.mapCenterLat': 39.50,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.mapCenterLon': -98.35,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.minZoom': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.maxZoom': 19,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.permanentTooltip': 0,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.stickyTooltip': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.googlePlacesSearch': 0,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.googlePlacesApiKey': "",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.googlePlacesZoomLevel': "12",
			'display.visualizations.custom.leaflet_maps_app.leaflet_maps.googlePlacesPosition': "topleft",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.kmlOverlay' : "",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.rangeOneBgColor': "#B5E28C",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.rangeOneFgColor': "#6ECC39",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.warningThreshold': 55,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.rangeTwoBgColor': "#F1D357",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.rangeTwoFgColor': "#F0C20C",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.criticalThreshold': 80,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.rangeThreeBgColor': "#FD9C73",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.rangeThreeFgColor': "#F18017",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measureTool': 1,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measureIconPosition': "topright",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measurePrimaryLengthUnit': "feet",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measureSecondaryLengthUnit': "miles",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measurePrimaryAreaUnit': "acres",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measureSecondaryAreaUnit': "sqmiles",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measureActiveColor': "#00ff00",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measureCompletedColor': "#0066ff",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.measureLocalization': "en",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.showPathLines': 0,
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.pathIdentifier': "",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.pathColorList': "#0003F0,#D43C29,darkgreen,0xe2d400,darkred,#23A378",
            'display.visualizations.custom.leaflet_maps_app.leaflet_maps.refreshInterval': 0
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
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.$el = $(this.el);
            this.isInitializedDom = false;
            this.splunkVersion = "unknown";
            this.isSplunkSeven = false;
            this.curPage = 0;
            this.allDataProcessed = false;

            // Detect version from REST API
            $.ajax({
                type: "GET",
                async: false,
                context: this,
                url: "/en-US/splunkd/__raw/servicesNS/nobody/leaflet_maps_app/server/info",
                success: function(s) {                                        
                    var xml = $(s);
                    var that = this;
                    $(xml).find('content').children().children().each(function(i, v) {
                        if(/name="version"/.test(v.outerHTML)) {
                            that.splunkVersion = parseFloat(v.textContent);
                            if(that.splunkVersion >= 7.0) {
                                that.isSplunkSeven = true;
                            }
                        } 
                    });
                },
                error: function(e) {
                    console.info(e);
                }
            });
        },
  
        // Search data params
        getInitialDataParams: function() {
            return ({
                outputMode: SplunkVisualizationBase.RAW_OUTPUT_MODE,
                count: this.maxResults
            });
        },

        // Build object of key/value pairs for invalid fields
        // to be used as data for _drilldown action
        validateFields: function(obj) {
            var invalidFields = {};
            var validFields = ['latitude',
							   'longitude',
                               'title',
                               'tooltip',
							   'description',
							   'icon',
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
							   'pathWeight',
							   'pathOpacity',
							   'layerGroup',
							   'pathColor'];
            $.each(obj, function(key, value) {
                if($.inArray(key, validFields) === -1) {
                    invalidFields[key] = value;
                }
            });

            return(invalidFields);
        },

        _getEscapedProperty: function(name, config) {
            var propertyValue = config[this.getPropertyNamespaceInfo().propertyNamespace + name];
            return SplunkVisualizationUtils.escapeHtml(propertyValue);
        },

        _getSafeUrlProperty: function(name, config) {
            var propertyValue = config[this.getPropertyNamespaceInfo().propertyNamespace + name];
            return SplunkVisualizationUtils.makeSafeUrl(propertyValue);

        },

		// Custom drilldown behavior for markers
        _drilldown: function(drilldownFields, resource) {
            payload = {
                action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                data: drilldownFields
            };

            this.drilldown(payload);
        },

		/* 
		/ Convert 0x|# prefixed hex values to # prefixed for consistency
		/ Splunk's eval tostring('hex') method returns 0x prefix
		*/
		convertHex: function(value) {
			// Pass markerColor prefixed with # regardless of given prefix ("#" or "0x")
			var hexRegex = /^(?:#|0x)([a-f\d]{6})$/i;
			if (hexRegex.test(value)) {
				markerColor = "#" + hexRegex.exec(value)[1];
				return(markerColor);
			} else {
				return(value);
			}
		},

        // Convert hex values to RGB for marker icon colors
        hexToRgb: function(hex) {
            var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        },

        // Convert string '1/0' or 'true/false' to boolean true/false
        isArgTrue: function(arg) {
            if(arg === 1 || arg === 'true') {
                return true;
            } else {
                return false;
            }
        },
      
        // Create RGBA string and corresponding HTML to dynamically set marker CSS in HTML head
        createMarkerStyle: function(bgHex, fgHex, markerName) {
            var bgRgb = this.hexToRgb(bgHex);
            var fgRgb = this.hexToRgb(fgHex);
            var bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', 0.6)';
            var fgRgba = 'rgba(' + fgRgb.r + ', ' + fgRgb.g + ', ' + fgRgb.b + ', 0.6)';

            var html = '.marker-cluster-' + markerName + ' { background-color: ' + bgRgba + ';} .marker-cluster-' + markerName + ' div { background-color: ' + fgRgba + ';}';
            $("<style>")
                .prop("type", "text/css")
                .html(html)
                .appendTo("head");
        },

        // Create a control icon and description in the layer control legend
        addLayerToControl: function(lg, control) {
            if(!lg.layerExists) {
                // update blue to awesome-marker blue color
                if(lg.icon.options.markerColor === "blue") {
                    var styleColor = "#38AADD";
                }
                else {
                    var styleColor = lg.icon.options.markerColor;
                }

                var iconHtml= "<i class=\"legend-toggle-icon " + lg.icon.options.prefix + " " + lg.icon.options.prefix + "-" + lg.icon.options.icon + "\" style=\"color: " + styleColor + "\"></i> " + lg.layerDescription;
                control.addOverlay(lg.group, iconHtml);
                lg.layerExists = true;
            }

        },

		// Show dialog box with pointer lat/lon and center lat/lon
		// coordinates. Allow user to copy and paste center coordinates into 
		// Center Lat and Center Lon format menu options.
        showCoordinates: function (e) {
            var coordinates = e.latlng.toString().match(/([-\d\.]+)/g);
            var centerCoordinates = this.map.getCenter().toString().match(/([-\d\.]+)/g);
            var content = "Pointer Latitude: <input type=\"text\" name=\"pointer_lat\" value=\"" + coordinates[0] + "\">" +
                  "<br>Pointer Longitude: <input type=\"text\" name=\"pointer_long\" value=\"" + coordinates[1] + "\">" +
                  "<br></br>Copy and paste the following values into Format menu to change <b>Center Lat</b> and <b>Center Lon</b> (visualization API does not currently support programmatically setting format menu options):<br>" +
                  "<br>Center Latitude: <input type=\"text\" name=\"center_lat\" value=\"" + centerCoordinates[0] + "\">" +
                  "<br>Center Longitude: <input type=\"text\" name=\"center_lon\" value=\"" + centerCoordinates[1] + "\">";
            var dialog = L.control.dialog({size: [300,375], anchor: [100, 500]})
              .setContent(content)
              .addTo(this.map);
        },

        centerMap: function (e) {
            this.map.panTo(e.latlng);
        },

        zoomIn: function (e) {
            this.map.zoomIn();
        },

        zoomOut: function (e) {
            this.map.zoomOut();
        },


        fitLayerBounds: function (e, that) {
            var tmpGroup = new L.featureGroup;

            try {
                _.each(e, function(lg, i) {
                    tmpGroup.addLayer(lg.group);
                }, this);
            } catch(err) {
                _.each(this.layerFilter, function(lg, i) {
                    tmpGroup.addLayer(lg.group);
                }, this);
            }

            try {
                that.map.fitBounds(tmpGroup.getBounds());
            } catch(err) {
                this.map.fitBounds(tmpGroup.getBounds());
            }
        },

        // Fetch KMZ or KML files and add to map
        fetchKmlAndMap: function(url, file, map) {
            // Test if it's a kmz file
            if(/.*\.kmz/.test(file)) {
                JSZipUtils.getBinaryContent(url, function (e, d) {
                    var z = new JSZip();

                    z.loadAsync(d)
                    .then(function(zip) {
                        return zip.file(/.*\.kml/)[0].async("string");
                    })
                    .then(function (text) {
                        var kmlText = $.parseXML(text);
                        var geojson = toGeoJSON.kml(kmlText);

						L.geoJson(geojson.features, {
							style: function (feature) {
								return { color: feature.properties.fill || '#FFFFFF',
										opacity: feature.properties["fill-opacity"] || 0.5,
										weight: feature.properties["stroke-width"]} || 1;
							},
							onEachFeature: function (feature, layer) {
								layer.bindPopup(feature.properties.name);
								layer.bindTooltip(feature.properties.name);
							}
						}).addTo(map);
                    });
                });
            // it's a kml file
            } else {
                $.ajax({url: url, dataType: 'xml', context: this}).done(function(kml) {
                    var geojson = toGeoJSON.kml(kml);

					L.geoJson(geojson.features, {
						style: function (feature) {
							return { color: feature.properties.fill || '#FFFFFF',
									opacity: feature.properties["fill-opacity"] || 0.5,
									weight: feature.properties["stroke-width"] || 1 };
						 },
						 onEachFeature: function (feature, layer) {
							 layer.bindPopup(feature.properties.name);
							 layer.bindTooltip(feature.properties.name);
						}
					}).addTo(map);
                });
            }
        },

        formatData: function(data) {
            if(data.results.length == 0 && data.fields.length >= 1){
                this.allDataProcessed = true;
                return this;
            } else if(data.results.length == 0)  {
                return this;
            }

            return data;
        },

        // Do the work of creating the viz
        updateView: function(data, config) {
            // viz gets passed empty config until you click the 'format' dropdown
            // intialize with defaults
			if(_.keys(config).length <= 1) {
                config = this.defaultConfig;
            }

            // Populate any missing config values with defaults
            _.defaults(config, this.defaultConfig)

            // get configs
            var cluster     = parseInt(this._getEscapedProperty('cluster', config)),
                allPopups   = parseInt(this._getEscapedProperty('allPopups', config)),
                multiplePopups = parseInt(this._getEscapedProperty('multiplePopups', config)),
                animate     = parseInt(this._getEscapedProperty('animate', config)),
                singleMarkerMode = parseInt(this._getEscapedProperty('singleMarkerMode', config)),
                maxClusterRadius = parseInt(this._getEscapedProperty('maxClusterRadius', config)),
                maxSpiderfySize = parseInt(this._getEscapedProperty('maxSpiderfySize', config)),
                spiderfyDistanceMultiplier = parseInt(this._getEscapedProperty('spiderfyDistanceMultiplier', config)),
                mapTile     = SplunkVisualizationUtils.makeSafeUrl(this._getEscapedProperty('mapTile', config)),
				mapTileOverride  = this._getSafeUrlProperty('mapTileOverride', config),
                mapAttributionOverride = this._getEscapedProperty('mapAttributionOverride', config),
                layerControl = parseInt(this._getEscapedProperty('layerControl', config)),
                layerControlCollapsed = parseInt(this._getEscapedProperty('layerControlCollapsed', config)),
                scrollWheelZoom = parseInt(this._getEscapedProperty('scrollWheelZoom', config)),
                fullScreen = parseInt(this._getEscapedProperty('fullScreen', config)),
                drilldown = parseInt(this._getEscapedProperty('drilldown', config)),
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
                googlePlacesApiKey = this._getEscapedProperty('googlePlacesApiKey', config),
                googlePlacesZoomLevel = parseInt(this._getEscapedProperty('googlePlacesZoomLevel', config)),
                googlePlacesPosition = this._getEscapedProperty('googlePlacesPosition', config),
                bingMaps = parseInt(this._getEscapedProperty('bingMaps', config)),
                bingMapsApiKey = this._getEscapedProperty('bingMapsApiKey', config),
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
                refreshInterval = parseInt(this._getEscapedProperty('refreshInterval', config)) * 1000;

            // Auto Fit & Zoom once we've processed all data
            if(this.allDataProcessed) {
                if(this.isArgTrue(autoFitAndZoom)) {
                    setTimeout(this.fitLayerBounds, autoFitAndZoomDelay, this.layerFilter, this);
                }

                // Dashboard refresh
                if(refreshInterval > 0) {
                    setTimeout(function() {
                        location.reload();
                    }, refreshInterval);
                }
            } 
            
            if (this.allDataProcessed && !this.isSplunkSeven) {
                // Remove marker cluster layers
                try {
                    this.markers.clearLayers();
                    //this.markers = null;
                } catch(e) {
                    console.error(e);
                }
                
                // Remove layer Filter layers
                _.each(this.layerFilter, function(lg, i) {
                    lg.group.removeLayer();
                }, this);
                this.layerFilter = {};

                // Remove path line layer
                try {
                    this.pathLineLayer.clearLayers();
                } catch(e) {
                    console.error(e);
                }
                this.curPage = 0;
                this.offset = 0;
                this.control._layers = [];
                this.allDataProcessed = false;
                this.updateDataParams({offset: 0, count: this.chunk});
                return this;
            }

            // Check for data and retrun if we don't have any
            if(!_.has(data, "results")) {
                return this;
            }

            // get data
            var dataRows = data.results;

            // check for data
            if (!dataRows || dataRows.length === 0 || dataRows[0].length === 0) {
                return this;
            }

            // Validate we have at least latitude and longitude fields
            if(!("latitude" in dataRows[0]) || !("longitude" in dataRows[0])) {
                 throw new SplunkVisualizationBase.VisualizationError(
                    'Incorrect Fields Detected - latitude & longitude fields required'
                );
            }

            this.activeTile = (mapTileOverride) ? mapTileOverride:mapTile;
            this.attribution = (mapAttributionOverride) ? mapAttributionOverride:this.ATTRIBUTIONS[mapTile];

            // Initialize the DOM
            if (!this.isInitializedDom) {
                // Set defaul icon image path
                L.Icon.Default.imagePath = location.origin + this.contribUri + 'images/';

                // Create layer filter object
                var layerFilter = this.layerFilter = {};

                // Setup cluster marker CSS
                this.createMarkerStyle(rangeOneBgColor, rangeOneFgColor, "one");
                this.createMarkerStyle(rangeTwoBgColor, rangeTwoFgColor, "two");
                this.createMarkerStyle(rangeThreeBgColor, rangeThreeFgColor, "three");

                // Configure context menu
                if(this.isArgTrue(contextMenu)) {
                    this.mapOptions =  {contextmenu: true,
                                       contextmenuWidth: 140,
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
                                       }]}
                }

                // Enable all or multiple popups
                if(this.isArgTrue(allPopups) || this.isArgTrue(multiplePopups)) {
                    L.Map = L.Map.extend({
                        openPopup: function (popup, latlng, options) {
                            if (!(popup instanceof L.Popup)) {
                                popup = new L.Popup(options).setContent(popup);
                            }

                            if (latlng) {
                                popup.setLatLng(latlng);
                            }

                            if (this.hasLayer(popup)) {
                                return this;
                            }

                            this._popup = popup;
                            return this.addLayer(popup);
                        }
                    });

                    // Disable close popup on click to allow multiple popups
                    this.mapOptions.closePopupOnClick = false;
                }


                // Create map 
                var map = this.map = new L.Map(this.el, this.mapOptions).setView([mapCenterLat, mapCenterLon], mapCenterZoom);

				// Load Google Places Search Control
                if(this.isArgTrue(googlePlacesSearch)) {
                    loadGoogleMapsAPI({key: googlePlacesApiKey,
                                      libraries: ['places']}).then(function(google) {
                        new L.Control.GPlaceAutocomplete({
                            position: googlePlacesPosition,
                            callback: function(l){
                                var latlng = L.latLng(l.geometry.location.lat(), l.geometry.location.lng());
                                map.flyTo(latlng, googlePlacesZoomLevel);
                            }
                        }).addTo(map);
                    }).catch(function(err) {
                        console.error(err);
                    }) 
                }

                // Create Bing Map
                if(this.isArgTrue(bingMaps)) {
                    var bingOptions = this.bingOptions = {"bingMapsKey": bingMapsApiKey,
                                                          "imagerySet": bingMapsTileLayer,
                                                          "culture": bingMapsLabelLanguage};
                    this.tileLayer = L.tileLayer.bing(this.bingOptions);
                } else {
                    // Setup the tile layer with map tile, zoom and attribution
                    this.tileLayer = L.tileLayer(this.activeTile, {
                        attribution: this.attribution,
                        minZoom: minZoom,
                        maxZoom: maxZoom
                    });    
                }

                // Add tile layer to map
                this.map.addLayer(this.tileLayer);

                this.markers = new L.MarkerClusterGroup({ 
                    chunkedLoading: true,
                    maxClusterRadius: maxClusterRadius,
                    removeOutsideVisibleBounds: true,
                    maxSpiderfySize: maxSpiderfySize,
                    spiderfyDistanceMultiplier: spiderfyDistanceMultiplier,
                    singleMarkerMode: (this.isArgTrue(singleMarkerMode)),
                    animate: (this.isArgTrue(animate)),
                    iconCreateFunction: function(cluster) {
                        var childCount = cluster.getChildCount();
                        var c = ' marker-cluster-';
                        if (childCount >= criticalThreshold) {
                            c += 'three';
                        } else if (childCount >= warningThreshold) {
                            c += 'two';
                        } else {
                            c += 'one';
                        }
                        return new L.DivIcon({ html: '<div><span><b>' + childCount + '</span></div></b>', className: 'marker-cluster' + c , iconSize: new L.Point(40, 40) });
                    }
                });

                this.control = L.control.layers(null, null, { collapsed: this.isArgTrue(layerControlCollapsed)});
                this.markers.addTo(this.map);
				
				// Get map size          
				var mapSize = this.mapSize = this.map.getSize();

                // Get parent element of div to resize 
                // Nesting of Div's is different, try 7.x first
                var parentEl = $(this.el).parent().parent().parent().parent().parent().closest("div").attr("data-cid");
                var parentView = $(this.el).parent().parent().parent().parent().parent().closest("div").attr("data-view");

                // Default to 6.x view
                if(parentView != 'views/shared/ReportVisualizer') {
                    var parentEl = $(this.el).parent().parent().closest("div").attr("data-cid");
                    var parentView = $(this.el).parent().parent().closest("div").attr("data-view");
                }
 
                // Map Full Screen Mode
                if (this.isArgTrue(fullScreen)) {
                    var vh = $(window).height() - 120;
                    $("div[data-cid=" + parentEl + "]").css("height", vh);

                    $(window).resize(function() {
                        var vh = $(window).height() - 120;
                        $("div[data-cid=" + parentEl + "]").css("height", vh);
                    });
                    this.map.invalidateSize();
                } else {
                    $("div[data-cid=" + parentEl + "]").css("height", defaultHeight);
                    this.map.invalidateSize();
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
                                           localization: measureLocalization};

                    var measureControl = new L.Control.Measure(measureOptions);
                    measureControl.addTo(this.map);
                }

                // Iterate through KML files and load overlays into layers on map 
                if(kmlOverlay) {
                    // Create array of kml/kmz files
                    var kmlFiles = kmlOverlay.split(/\s*,\s*/);

                    // Loop through each file and load it onto the map
                    _.each(kmlFiles, function(file, i) {
                        var url = location.origin + this.contribUri + 'kml/' + file;
                        this.fetchKmlAndMap(url, file, this.map);
                    }, this);
                }
                
                var pathLineLayer = this.pathLineLayer = L.layerGroup().addTo(this.map);
               
                // Init defaults
                if(this.isSplunkSeven) {
                    this.chunk = 50000;
                } else {
                    this.chunk = 10000;
                }
                this.offset = 0;
				this.isInitializedDom = true;         
                this.allDataProcessed = false;
            } 

            // Map Scroll
            (this.isArgTrue(scrollWheelZoom)) ? this.map.scrollWheelZoom.enable() : this.map.scrollWheelZoom.disable();

            if(!this.isArgTrue(bingMaps)) {
                // Reset Tile If Changed
                if(this.tileLayer._url != this.activeTile) {
                    this.tileLayer.setUrl(this.activeTile);
                }
            }   

            // Reset tile zoom levels if changed
            if (this.tileLayer.options.maxZoom != maxZoom) {
                this.tileLayer.options.maxZoom = maxZoom;
            }

            if (this.tileLayer.options.minZoom != minZoom) {
                this.tileLayer.options.minZoom = minZoom;
            }

            // Reset map zoom
            if (this.map.getZoom() != mapCenterZoom) {
                this.map.setZoom(mapCenterZoom);
            }
           
			/********* BEGIN PROCESSING DATA **********/
 
            // Iterate through each row creating layer groups per icon type
            // and create markers appending to a markerList in each layerfilter object

            // Init current position in dataRows
            var curPos = this.curPos = 0;

            _.each(dataRows, function(userData, i) {
                // Only return if we have > this.chunkSize and not on the first page of results
                // Part of pagination logic to determine when we've fetched all results.
                if(!this.isSplunkSeven) {
                    if(this.curPage >= 1 && this.curPos == 0) {
                        this.curPos += 1;
                        return;
                    }
                }

                // Set icon options
                var icon = _.has(userData, "icon") ? userData["icon"]:"circle";
				var layerGroup = _.has(userData, "layerGroup") ? userData["layerGroup"]:icon;

                // Create Clustered featuregroup subgroup layer
                if (_.isUndefined(this.layerFilter[layerGroup]) && this.isArgTrue(cluster)) {
                    this.layerFilter[layerGroup] = {'group' : L.featureGroup.subGroup(this.markers),
                                              'markerList' : [],
                                              'iconStyle' : icon,
                                              'layerExists' : false
                                             };
                // Create normal layergroup
                } else if (_.isUndefined(this.layerFilter[layerGroup])) {
                    this.layerFilter[layerGroup] = {'group' : L.featureGroup(),
                                              'markerList' : [],
                                              'iconStyle' : icon,
                                              'layerExists' : false
                                             };
                }

                var layerDescription  = _.has(userData, "layerDescription") ? userData["layerDescription"]:"";

                if (!_.isUndefined(this.layerFilter[layerGroup])) {
                    this.layerFilter[layerGroup].layerDescription = layerDescription;
                }
				
				var markerType = _.has(userData, "markerType") ? userData["markerType"]:"png";
                var markerColor = _.has(userData, "markerColor") ? userData["markerColor"]:"blue";
                var iconColor = _.has(userData, "iconColor") ? userData["iconColor"]:"white";
                var markerSize = _.has(userData, "markerSize") ? userData["markerSize"].split(/,/):[35,45];
                var markerAnchor = _.has(userData, "markerAnchor") ? userData["markerAnchor"].split(/,/):[15,50];
                var shadowSize = _.has(userData, "shadowSize") ? userData["shadowSize"].split(/,/):[30,46];
                var shadowAnchor = _.has(userData, "shadowAnchor") ? userData["shadowAnchor"].split(/,/):[30,30];
                var markerPriority = _.has(userData, "markerPriority") ? parseInt(userData["markerPriority"]):0;
                var title = _.has(userData, "title") ? userData["title"]:null;
                var tooltip = _.has(userData, "tooltip") ? userData["tooltip"]:null;
                var prefix = _.has(userData, "prefix") ? userData["prefix"]:"fa";
                var extraClasses = _.has(userData, "extraClasses") ? userData["extraClasses"]:"fa-lg";

                if(/^(fa-)?map-marker/.test(icon) || /^(fa-)?map-pin/.test(icon)) {
                    var className = "";
                    var popupAnchor = [-3, -35];
                } else {
                    var className = "awesome-marker";
                    var popupAnchor = [1, -35];
                }

                var description = _.has(userData, "description") ? userData["description"]:"";

				// SVG and PNG based markers both support hex iconColor do conversion outside
				iconColor = this.convertHex(iconColor);	

                if (markerType == "svg") {
					// Update marker to shade of Awesome Marker blue
					if(markerColor == "blue") { markerColor = "#38AADD"; }
					markerColor = this.convertHex(markerColor);

                    var markerIcon = L.VectorMarkers.icon({
                        icon: icon,
                        iconColor: iconColor,
                        markerColor: markerColor,
                        shadowSize: shadowSize,
                        shadowAnchor: shadowAnchor,
                        extraIconClasses: extraClasses,
                        prefix: prefix,
                        iconSize: markerSize,
						iconAnchor: markerAnchor,
                    });
                } else {
                    // Create markerIcon
                    var markerIcon = L.AwesomeMarkers.icon({
                        icon: icon,
                        markerColor: markerColor,
                        iconColor: iconColor,
                        prefix: prefix,
                        className: className,
                        extraClasses: extraClasses,
                        popupAnchor: popupAnchor,
                        description: description
                    });

                }

                /* Add the icon to layerFilter so we can access properties
				 * for overlay in addLayerToControl
				 */
                if (!_.isUndefined(this.layerFilter[layerGroup])) {
                    this.layerFilter[layerGroup].icon = markerIcon;
                }

                var marker = L.marker([userData['latitude'],
                                       userData['longitude']],
                                      {icon: markerIcon,
                                       layerDescription: layerDescription,
									   zIndexOffset: markerPriority});

                // Bind tooltip: default tooltip field, fallback to title field for backwards compatibility
                if(tooltip) {
                    marker.bindTooltip(tooltip, {permanent: permanentTooltip,
                                                 direction: 'auto',
                                                 sticky: stickyTooltip});
                } else if (title) {
                    marker.bindTooltip(title, {permanent: permanentTooltip,
                                               direction: 'auto',
                                               sticky: stickyTooltip});
                }

                if(this.isArgTrue(drilldown)) {
					var drilldownFields = this.validateFields(userData);
                    marker.on('dblclick', this._drilldown.bind(this, drilldownFields));
                }

                // Bind description popup if description exists
                if(userData["description"]) {
                    marker.bindPopup(userData['description']);
                }

                // Save each icon in the layer if markerVisibility is either set and == "marker" or unset
                // TODO: possibly place more of marker-related code from above inside if statement?
                if (userData["markerVisibility"]) {
                    if (userData["markerVisibility"] == "marker") {
                        this.layerFilter[layerGroup].markerList.push(marker);
                    }
                } else {
                    this.layerFilter[layerGroup].markerList.push(marker);
                }

                this.curPos += 1;
            }, this);            

            // Enable/disable layer controls and toggle collapse 
            if (this.isArgTrue(layerControl)) {           
                this.control.addTo(this.map);
                this.control.options.collapsed = this.isArgTrue(layerControlCollapsed);
            } else {
                this.control.remove();
            }

            // Clustered
            if (this.isArgTrue(cluster)) {           
                _.each(this.layerFilter, function(lg, i) { 
                    // Create temp clustered layergroup and add markerlist
                    this.tmpFG = L.featureGroup.subGroup(this.markers, lg.markerList);

                    // add temp layergroup to layer filter layergroup and add to map
                    lg.group.addLayer(this.tmpFG);
                    lg.group.addTo(this.map);

                    this.addLayerToControl(lg, this.control);

                }, this);
            // Single value
            } else {
                // Loop through layer filters
                _.each(this.layerFilter, function(lg, i) { 
                    lg.group.addTo(this.map);

                    // Loop through markers and add to map
                    _.each(lg.markerList, function(m, k) {
                        if(this.isArgTrue(allPopups)) {
                            m.addTo(lg.group).bindPopup(m.options.icon.options.description).openPopup();
                        } else {
                            m.addTo(lg.group);
                        }
                    }, this);

                    // Add layer controls
                    this.addLayerToControl(lg, this.control);
                }, this);

            }

			// Draw path lines
			if (this.isArgTrue(showPathLines)) {
				var activePaths = [];
				var colors = _.map(pathColorList.split(','), function(color) {
					return this.convertHex(color);
				}, this);

				var paths = _.map(dataRows, function (d) {
					var colorIndex = 0;
					var pathWeight = (_.has(d, "pathWeight")) ? d["pathWeight"]:5;
					var pathOpacity = (_.has(d, "pathOpacity")) ? d["pathOpacity"]:0.5;

					if (pathIdentifier) {
						var id = d[pathIdentifier];
						var colorIndex = activePaths.indexOf(id);
						if (colorIndex < 0) {
							colorIndex = activePaths.push(id) - 1;
						}
					}
				    var color = (_.has(d, "pathColor")) ? d["pathColor"] : colors[colorIndex % colors.length];
					return {
						'coordinates': L.latLng(d['latitude'], d['longitude']),
						'colorIndex': colorIndex,
						'pathWeight': pathWeight,
					    'pathOpacity': pathOpacity,
					    'color':color
					};
				});
				paths = _.groupBy(paths, function (d) {
					return d.colorIndex;
				});

				_.each(paths, function(path) {
					L.polyline(_.pluck(path, 'coordinates'), {color: this.convertHex(path[0]['color']),
															  weight: path[0]['pathWeight'],
															  opacity: path[0]['pathOpacity']}).addTo(this.pathLineLayer);
				}, this);
			}

 			/*
             * Fix for hidden divs using tokens in Splunk
             * https://github.com/Leaflet/Leaflet/issues/2738
             */
            if(this.mapSize.x == 0 && this.mapSize.y == 0) {
                var intervalId = this.intervalId = setInterval(function(that) {
                    curSize = that.curSize = that.map.getSize();
                    that.map.invalidateSize();
                    if(that.curSize.x > 0 && that.curSize.y > 0) {
                        clearInterval(that.intervalId);
                    }
                }, 500, this);
            }

            // Update offset and fetch next chunk of data
            if(this.isSplunkSeven) {
                this.offset += dataRows.length;
                this.updateDataParams({count: this.chunk, offset: this.offset});    
            } else {
                // It's Splunk 6.x
                if(dataRows.length == this.chunk) {
                    // This results in a dupe. The last element in the current result set
                    // and the first element in the next result set. This dupe is handled in the 
                    // loop processing the results.
                    this.offset += this.chunk-1;
                    this.curPage += 1;
                    this.updateDataParams({count: this.chunk, offset: this.offset});
                } else {
                    this.allDataProcessed = true;
                    if(this.isArgTrue(autoFitAndZoom)) {
                        setTimeout(this.fitLayerBounds, autoFitAndZoomDelay, this.layerFilter, this);
                    }
                }
            }

            return this;
        }
    });
});
