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
            'moment',
            'spin.js',
            'leaflet-bing-layer',
			'leaflet-contextmenu',
			'leaflet-dialog',
            'leaflet-google-places-autocomplete',
            'leaflet.markercluster',
            'leaflet.heat',
            '../contrib/leaflet.spin',
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
            loadGoogleMapsAPI,
            moment
        ) {


    return SplunkVisualizationBase.extend({
        maxResults: 0,
        tileLayer: null,
        mapOptions: {},
        heatMarkers: 0,
        markerCount: 0,
        contribUri: '/en-US/static/app/maps-plus/visualizations/maps-plus/contrib/',
        defaultConfig:  {
            'display.visualizations.custom.maps-plus.maps-plus.cluster': 1,
            'display.visualizations.custom.maps-plus.maps-plus.allPopups': 0,
            'display.visualizations.custom.maps-plus.maps-plus.multiplePopups': 0,
            'display.visualizations.custom.maps-plus.maps-plus.animate': 1,
            'display.visualizations.custom.maps-plus.maps-plus.singleMarkerMode': 0,
            'display.visualizations.custom.maps-plus.maps-plus.disableClusteringAtZoom': 0,
            'display.visualizations.custom.maps-plus.maps-plus.disableClusteringAtZoomLevel': "",
            'display.visualizations.custom.maps-plus.maps-plus.maxClusterRadius': 80,
            'display.visualizations.custom.maps-plus.maps-plus.maxSpiderfySize': 100,
            'display.visualizations.custom.maps-plus.maps-plus.spiderfyDistanceMultiplier': 1,
            'display.visualizations.custom.maps-plus.maps-plus.mapTile': 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'display.visualizations.custom.maps-plus.maps-plus.mapTileOverride': "",
            'display.visualizations.custom.maps-plus.maps-plus.mapAttributionOverride': "",
            'display.visualizations.custom.maps-plus.maps-plus.layerControl' : 1,
            'display.visualizations.custom.maps-plus.maps-plus.layerControlCollapsed': 1,
            'display.visualizations.custom.maps-plus.maps-plus.scrollWheelZoom': 1,
            'display.visualizations.custom.maps-plus.maps-plus.fullScreen': 0,
            'display.visualizations.custom.maps-plus.maps-plus.drilldown': 0,
			'display.visualizations.custom.maps-plus.maps-plus.contextMenu': 1,
            'display.visualizations.custom.maps-plus.maps-plus.defaultHeight': 600,
            'display.visualizations.custom.maps-plus.maps-plus.autoFitAndZoom': 1,
			'display.visualizations.custom.maps-plus.maps-plus.autoFitAndZoomDelay': 500,
            'display.visualizations.custom.maps-plus.maps-plus.mapCenterZoom': 6,
            'display.visualizations.custom.maps-plus.maps-plus.mapCenterLat': 39.50,
            'display.visualizations.custom.maps-plus.maps-plus.mapCenterLon': -98.35,
            'display.visualizations.custom.maps-plus.maps-plus.minZoom': 1,
            'display.visualizations.custom.maps-plus.maps-plus.maxZoom': 19,
            'display.visualizations.custom.maps-plus.maps-plus.permanentTooltip': 0,
            'display.visualizations.custom.maps-plus.maps-plus.stickyTooltip': 1,
            'display.visualizations.custom.maps-plus.maps-plus.googlePlacesSearch': 0,
            'display.visualizations.custom.maps-plus.maps-plus.googlePlacesApiKey': "",
            'display.visualizations.custom.maps-plus.maps-plus.googlePlacesZoomLevel': "12",
			'display.visualizations.custom.maps-plus.maps-plus.googlePlacesPosition': "topleft",
            'display.visualizations.custom.maps-plus.maps-plus.kmlOverlay' : "",
            'display.visualizations.custom.maps-plus.maps-plus.rangeOneBgColor': "#B5E28C",
            'display.visualizations.custom.maps-plus.maps-plus.rangeOneFgColor': "#6ECC39",
            'display.visualizations.custom.maps-plus.maps-plus.warningThreshold': 55,
            'display.visualizations.custom.maps-plus.maps-plus.rangeTwoBgColor': "#F1D357",
            'display.visualizations.custom.maps-plus.maps-plus.rangeTwoFgColor': "#F0C20C",
            'display.visualizations.custom.maps-plus.maps-plus.criticalThreshold': 80,
            'display.visualizations.custom.maps-plus.maps-plus.rangeThreeBgColor': "#FD9C73",
            'display.visualizations.custom.maps-plus.maps-plus.rangeThreeFgColor': "#F18017",
            'display.visualizations.custom.maps-plus.maps-plus.measureTool': 1,
            'display.visualizations.custom.maps-plus.maps-plus.measureIconPosition': "topright",
            'display.visualizations.custom.maps-plus.maps-plus.measurePrimaryLengthUnit': "feet",
            'display.visualizations.custom.maps-plus.maps-plus.measureSecondaryLengthUnit': "miles",
            'display.visualizations.custom.maps-plus.maps-plus.measurePrimaryAreaUnit': "acres",
            'display.visualizations.custom.maps-plus.maps-plus.measureSecondaryAreaUnit': "sqmiles",
            'display.visualizations.custom.maps-plus.maps-plus.measureActiveColor': "#00ff00",
            'display.visualizations.custom.maps-plus.maps-plus.measureCompletedColor': "#0066ff",
            'display.visualizations.custom.maps-plus.maps-plus.measureLocalization': "en",
            'display.visualizations.custom.maps-plus.maps-plus.showPathLines': 0,
            'display.visualizations.custom.maps-plus.maps-plus.pathIdentifier': "",
            'display.visualizations.custom.maps-plus.maps-plus.pathColorList': "#0003F0,#D43C29,darkgreen,0xe2d400,darkred,#23A378",
            'display.visualizations.custom.maps-plus.maps-plus.refreshInterval': 0,
            'display.visualizations.custom.maps-plus.maps-plus.pathSplits': 0,
			'display.visualizations.custom.maps-plus.maps-plus.pathRenderer': "svg",
            'display.visualizations.custom.maps-plus.maps-plus.pathSplitInterval': 60,
            'display.visualizations.custom.maps-plus.maps-plus.heatmapEnable': 0,
            'display.visualizations.custom.maps-plus.maps-plus.heatmapOnly': 0,
            'display.visualizations.custom.maps-plus.maps-plus.heatmapMinOpacity': 1.0,
            'display.visualizations.custom.maps-plus.maps-plus.heatmapMaxZoom': null, 
            'display.visualizations.custom.maps-plus.maps-plus.heatmapMaxPointIntensity': 1.0,
            'display.visualizations.custom.maps-plus.maps-plus.heatmapRadius': 25,
            'display.visualizations.custom.maps-plus.maps-plus.heatmapBlur': 15,
            'display.visualizations.custom.maps-plus.maps-plus.showProgress': 1
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
                url: "/en-US/splunkd/__raw/servicesNS/nobody/maps-plus/server/info",
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
                    //console.info(e);
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
                               'clusterGroup',
                               'pathColor',
                               'popupAnchor',
                               '_time'];
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

        stringToPoint: function(stringPoint) {
            var point = _.map(stringPoint.split(','), function(val) {
                return parseInt(val);
            })
            return point;
        },

        // Draw path line
        drawPath: function(data, context) {
            _.each(data, function(p) {
                // create polyline and bind popup
                var pl = L.polyline(_.pluck(p, 'coordinates'), {color: this.convertHex(p[0]['color']),
                                                       weight: p[0]['pathWeight'],
                                                       opacity: p[0]['pathOpacity']}).bindPopup(p[0]['id']).addTo(context.pathLineLayer);
                // Apply tooltip to polyline
                if(p[0]['tooltip'] != "") {
                    pl.bindTooltip(p[0]['tooltip'], {permanent: p[0]['permanentTooltip'],
                                                     direction: 'auto',
                                                     sticky: p[0]['stickyTooltip']});
                }

            }, context);
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

        fitPathLayerBounds: function (e, that) {
            var map = _.isUndefined(that) ? this.map:that.map;
            var tmpGroup = new L.featureGroup;

            if(!_.isUndefined(e)) {
                _.each(e._layers, function(l, i) {
                    tmpGroup.addLayer(l);
                }, this);    
            }

            map.fitBounds(tmpGroup.getBounds());            
        },

        fitLayerBounds: function (e, that) {
            var map = _.isUndefined(that) ? this.map:that.map;
            var layerGroup = _.isUndefined(that) ? this.layerFilter:e;
            var tmpGroup = new L.featureGroup;

            _.each(layerGroup, function(lg, i) {
                tmpGroup.addLayer(lg.group);
            }, this);

            if(!_.isEmpty(layerGroup)) {
                map.fitBounds(tmpGroup.getBounds());
            }
            
        },

        // Fetch KMZ or KML files and add to map
        fetchKmlAndMap: function(url, file, map, paneZIndex) {
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
                                return {stroke: _.has(feature.properties, "stroke") ? feature.properties.stroke : '#FFFFFF',
                                        color: _.has(feature.properties, "fill") ? feature.properties.fill : _.has(feature.properties,"stroke") ? feature.properties.stroke : "#FFFFFF",
                                        opacity: _.has(feature.properties, "fill-opacity") ? feature.properties["fill-opacity"] : 0.5,
                                        weight: _.has(feature.properties, "stroke-width") ? feature.properties["stroke-width"] : 1 };
                             },
							onEachFeature: function (feature, layer) {
							 	// Create pane and set zIndex to render multiple KML files over each other based on
							 	// specified precedence in overlay menu 
                                map.createPane(feature.properties.name);
                                map.getPane(feature.properties.name).style.zIndex = paneZIndex;
                                layer.options.pane = feature.properties.name;
                                layer.defaultOptions.pane = feature.properties.name;
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
                            return {stroke: _.has(feature.properties, "stroke") ? feature.properties.stroke : '#FFFFFF',
                                    color: _.has(feature.properties, "fill") ? feature.properties.fill : _.has(feature.properties,"stroke") ? feature.properties.stroke : "#FFFFFF",
                                    opacity: _.has(feature.properties, "fill-opacity") ? feature.properties["fill-opacity"] : 0.5,
                                    weight: _.has(feature.properties, "stroke-width") ? feature.properties["stroke-width"] : 1 };
                         },
						 onEachFeature: function (feature, layer) {
							 // Create pane and set zIndex to render multiple KML files over each other based on
							 // specified precedence in overlay menu 
                             map.createPane(feature.properties.name);
                             map.getPane(feature.properties.name).style.zIndex = paneZIndex;
                             layer.options.pane = feature.properties.name;
                             layer.defaultOptions.pane = feature.properties.name;
							 layer.bindPopup(feature.properties.name);
							 layer.bindTooltip(feature.properties.name);
						}
					}).addTo(map);
                });
            }
        },

        _createClusterGroup: function(disableClusteringAtZoom,
                                      disableClusteringAtZoomLevel,
                                      maxClusterRadius,
                                      maxSpiderfySize,
                                      spiderfyDistanceMultiplier,
                                      singleMarkerMode,
                                      animate,
                                      criticalThreshold,
                                      warningThreshold) {

            // Redefine spiderfy and extend it
            L.MarkerCluster.include({
                spiderfy: function () {
                    if (this._group._spiderfied === this || this._group._inZoomAnimation) {
                        return;
                    }
        
                    var childMarkers = this.getAllChildMarkers(),
                        group = this._group,
                        map = group._map,
                        center = map.latLngToLayerPoint(this._latlng),
                        positions;
        
                    // Don't spiderfy cluster groups that exeed warning size
                    if (childMarkers.length > this._group.options.maxSpiderfySize) {
                        alert("Cluster has " + childMarkers.length + " points which exceeds cluster warning size of " + this._group.options.maxSpiderfySize + ". Cluster will not be expanded.");
                        return;
                    }
                    
                    this._group._unspiderfy();
                    this._group._spiderfied = this;
        
                    //TODO Maybe: childMarkers order by distance to center
        
                    if (childMarkers.length >= this._circleSpiralSwitchover) {
                        positions = this._generatePointsSpiral(childMarkers.length, center);
                    } else {
                        center.y += 10; // Otherwise circles look wrong => hack for standard blue icon, renders differently for other icons.
                        positions = this._generatePointsCircle(childMarkers.length, center);
                    }
        
                    this._animationSpiderfy(childMarkers, positions);
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
           
            if(this.isArgTrue(disableClusteringAtZoom)) {
                mcg.options.disableClusteringAtZoom = disableClusteringAtZoomLevel;
                mcg.options.spiderfyOnMaxZoom = false;
            }

            return mcg;
        },
        
        _addMarker: function(userData,
                             markerIcon,
                             layerDescription,
                             markerPriority,
                             permanentTooltip,
                             stickyTooltip,
                             cluster,
                             layerFilter,
                             layerGroup,
                             clusterGroup,
                             tooltip,
							 title,
                             drilldown) {
            if (typeof this.layerFilter[layerGroup] !== 'undefined') {
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
            if(_.has(userData, "description") && userData["description"] != "") {
                marker.bindPopup(userData['description']);
            }

            if (this.isArgTrue(cluster)) {           
                _.findWhere(this.layerFilter[layerGroup].clusterGroup, {groupName: clusterGroup}).markerList.push(marker)
            } else {
                this.layerFilter[layerGroup].markerList.push(marker);
            }
        },

        _addClustered: function(layerFilter,
                               that) {

            //console.log("Adding clustered");
            //console.log("Layer Filter");
            //console.log(layerFilter);
            // Process layers
            _.each(layerFilter, function(lg, i) {
                //console.log("Layer Group");
                //console.log(lg);
                // Process cluster groups
                _.each(lg.clusterGroup, function(cg, i) {
                    this.tmpFG = L.featureGroup.subGroup(cg.cg, cg.markerList);
                    //console.log(this.tmpFG);
                    lg.group.addLayer(this.tmpFG);
                }, that);

                //console.log("Adding layergorup to map");
                lg.group.addTo(that.map);
                that.addLayerToControl(lg, that.control);
            }, that);
        },

        _addUnclustered: function(layerFilter,
                                  allPopups,
                                  that) {
            // Loop through layer filters
            _.each(layerFilter, function(lg, i) { 
                // Loop through markers and add to map
                _.each(lg.markerList, function(m, k) {
                    if(that.isArgTrue(allPopups)) {
                        m.addTo(lg.group).bindPopup(m.options.icon.options.description).openPopup();
                    } else {
                        m.addTo(lg.group);
                    }
                }, that);
                // Add layergroup to map
                lg.group.addTo(that.map);

                // Add layer controls
                that.addLayerToControl(lg, that.control);
            }, that);
        },

        formatData: function(data) {
            //console.log("In format:");
            //console.log(data);

            if(data.results.length == 0 && data.fields.length >= 1 && data.meta.done){
            //if(data.results.length == 0 && data.fields.length >= 1){    
                //console.log("Done: " + data.meta.done);
                //console.log("Markers processed: " + this.markerCount);
                this.allDataProcessed = true;
                return this;
            }
            
            if(data.results.length == 0)  {
                //console.log("returning this");
                return this;
            }

            //console.log("returning data");
            this.allDataProcessed = false;
            return data;
        },

        // Do the work of creating the viz
        updateView: function(data, config) {
            // viz gets passed empty config until you click the 'format' dropdown
            // intialize with defaults
			if(_.keys(config).length <= 1) {
                config = this.defaultConfig;
            }

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
                refreshInterval = parseInt(this._getEscapedProperty('refreshInterval', config)) * 1000,
                heatmapEnable = parseInt(this._getEscapedProperty('heatmapEnable', config)),
                heatmapOnly = parseInt(this._getEscapedProperty('heatmapOnly', config)),
                heatmapMinOpacity = parseFloat(this._getEscapedProperty('heatmapMinOpacity', config)),
                heatmapMaxZoom = parseInt(this._getEscapedProperty('heatmapMaxZoom', config)),
                heatmapMaxPointIntensity = parseFloat(this._getEscapedProperty('heatmapMaxPointIntensity', config)),
                heatmapRadius = parseInt(this._getEscapedProperty('heatmapRadius', config)),
                heatmapBlur = parseInt(this._getEscapedProperty('heatmapBlur', config)),
                showProgress = parseInt(this._getEscapedProperty('showProgress', config));

            // Auto Fit & Zoom once we've processed all data
            if(this.allDataProcessed) {
                //console.log("is splunk 7");
                //console.log(this.layerFilter);

                if(this.isArgTrue(showProgress)) {
                    //console.log("Stopping spinner");
                    if(!_.isUndefined(this.map)) {
                        this.map.spin(false);
                    }
                }
                

                if (this.isArgTrue(heatmapEnable) && !_.isUndefined(this.heat)) {
                    this.heat.addTo(this.map);
                }

                if (this.isArgTrue(showPathLines)) {
                    setTimeout(this.fitPathLayerBounds, autoFitAndZoomDelay, this.pathLineLayer, this);
                } else {
                    setTimeout(this.fitLayerBounds, autoFitAndZoomDelay, this.layerFilter, this);
                }

                //console.log(this.heatMarkers);
                // Dashboard refresh
                if(refreshInterval > 0) {
                    setTimeout(function() {
                        location.reload();
                    }, refreshInterval);
                }
            } 
            
            if (this.allDataProcessed && !this.isSplunkSeven) {
                //console.log("is not splunk 7");
                // Remove marker cluster layers
                try {
                    this.markers.clearLayers();
                    //this.markers = null;
                } catch(e) {
                    //console.error(e);
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
                    //console.error(e);
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
                //console.log("No results detected - returning");
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

            pathSplits = parseInt(this._getEscapedProperty('pathSplits', config)),
            pathRenderer = this._getEscapedProperty('pathRenderer', config),
            pathSplitInterval = parseInt(this._getEscapedProperty('pathSplitInterval', config));

            this.activeTile = (mapTileOverride) ? mapTileOverride:mapTile;
            this.attribution = (mapAttributionOverride) ? mapAttributionOverride:this.ATTRIBUTIONS[mapTile];

            // Initialize the DOM
            if (!this.isInitializedDom) {
                //console.log("initializing DOM");
                // Set defaul icon image path
                L.Icon.Default.imagePath = location.origin + this.contribUri + 'images/';

                // Create layer filter object
                var layerFilter = this.layerFilter = {};

                // Create clusterGroups
                var clusterGroups = this.clusterGroups = {};

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

                // Create canvas render and prever canvas for paths
                if(pathRenderer == "canvas") {
                    this.mapOptions.renderer = L.canvas();
                    this.mapOptions.preferCanvas = true;
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
                        //console.error(err);
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

                // Create layer control
                this.control = L.control.layers(null, null, { collapsed: this.isArgTrue(layerControlCollapsed)});
				
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
					// Pane zIndex used to facilitate layering of multiple KML/KMZ files
                    var paneZIndex = this.paneZIndex = 400;

                    // Loop through each file and load it onto the map
                    _.each(kmlFiles.reverse(), function(file, i) {
                        var url = location.origin + this.contribUri + 'kml/' + file;
                        this.fetchKmlAndMap(url, file, this.map, this.paneZIndex);
                        this.paneZIndex = this.paneZIndex - (i+1);
                    }, this);
                }
                
                var pathLineLayer = this.pathLineLayer = L.layerGroup();
                
                // Heatmap
                if (this.isArgTrue(heatmapEnable)) {
                    var heat = this.heat = L.heatLayer([], {minOpacity: heatmapMinOpacity,
                                                            maxZoom: heatmapMaxZoom,
                                                            max: heatmapMaxPointIntensity,
                                                            radius: heatmapRadius,
                                                            blur: heatmapBlur});
                                                            //blur: heatmapBlur}).addTo(this.map);
                }
               
                // Init defaults
                if(this.isSplunkSeven) {
                    this.chunk = 50000;
                } else {
                    this.chunk = 10000;
                }
                this.offset = 0;
				this.isInitializedDom = true;         
                this.allDataProcessed = false;

                
                if(this.isArgTrue(showProgress)) {
                    this.map.spin(true);
                    //console.log("Spinning!!");
                }
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
            //console.log(dataRows);

            _.each(dataRows, function(userData, i) {
                // Only return if we have > this.chunkSize and not on the first page of results
                // Part of pagination logic to determine when we've fetched all results.
                if(!this.isSplunkSeven) {
                    if(this.curPage >= 1 && this.curPos == 0) {
                        this.curPos += 1;
                        return;
                    }
                }

                if (_.has(userData,"markerVisibility") && userData["markerVisibility"] != "marker") {
                    // Skip the marker to improve performance of rendering
                    return;
                }

                // Add heatmap layer
                if (this.isArgTrue(heatmapEnable)) {
                    var heatLatLng = this.heatLatLng = L.latLng(parseFloat(userData['latitude']), parseFloat(userData['longitude']));
                    this.heat.addLatLng(this.heatLatLng);
                    this.heatMarkers += 1;
                    
                    if(this.isArgTrue(heatmapOnly)) {
                        return;
                    }
                }

                // Set icon options
                var icon = _.has(userData, "icon") ? userData["icon"]:"circle";
				var layerGroup = _.has(userData, "layerGroup") ? userData["layerGroup"]:icon;
				var clusterGroup = _.has(userData, "clusterGroup") ? userData["clusterGroup"]:icon;

                // Create Cluster Group
                if(_.isUndefined(this.clusterGroups[clusterGroup])) {
                    //console.log("Creating cluster group");
                    var cg = this._createClusterGroup(disableClusteringAtZoom,
                                                      disableClusteringAtZoomLevel,
                                                      maxClusterRadius,
                                                      maxSpiderfySize,
                                                      spiderfyDistanceMultiplier,
                                                      singleMarkerMode,
                                                      animate,
                                                      criticalThreshold,
                                                      warningThreshold);

                    this.clusterGroups[clusterGroup] = cg;
                    cg.addTo(this.map);
                }

                // Create Clustered featuregroup subgroup layer
                if (_.isUndefined(this.layerFilter[layerGroup]) && this.isArgTrue(cluster)) {
                    //console.log("Creating Layer Filter")
                    this.layerFilter[layerGroup] = {'group' : L.featureGroup.subGroup(),
                                                    'iconStyle' : icon,
                                                    'layerExists' : false,
                                                    'clusterGroup': []
                                                    };
                // Create normal layergroup
                } else if (_.isUndefined(this.layerFilter[layerGroup])) {
                    this.layerFilter[layerGroup] = {'group' : L.featureGroup(),
                                                    'markerList' : [],
                                                    'iconStyle' : icon,
                                                    'layerExists' : false
                                                    };
                }

                // Add clusterGroup to layerGroup
                if(this.isArgTrue(cluster)
                   && clusterGroup != ""
                   && typeof _.findWhere(this.layerFilter[layerGroup].clusterGroup, {groupName: clusterGroup}) == 'undefined') {
                    this.layerFilter[layerGroup].clusterGroup.push({'groupName': clusterGroup,
                                                                    'cg': this.clusterGroups[clusterGroup],
                                                                    'markerList': []});
                }

                // Get layer description and set
                var layerDescription  = _.has(userData, "layerDescription") ? userData["layerDescription"]:"";
                
                if (!_.isUndefined(this.layerFilter[layerGroup])) {
                    this.layerFilter[layerGroup].layerDescription = layerDescription;
                }
			
                // Get marker and icon properties	
				var markerType = _.has(userData, "markerType") ? userData["markerType"]:"png";
                var markerColor = _.has(userData, "markerColor") ? userData["markerColor"]:"blue";
                var iconColor = _.has(userData, "iconColor") ? userData["iconColor"]:"white";
                var markerSize = _.has(userData, "markerSize") ? this.stringToPoint(userData["markerSize"]):[35,45];
                var markerAnchor = _.has(userData, "markerAnchor") ? this.stringToPoint(userData["markerAnchor"]):[15,50];
                var shadowSize = _.has(userData, "shadowSize") ? this.stringToPoint(userData["shadowSize"]):[30,46];
                var shadowAnchor = _.has(userData, "shadowAnchor") ? this.stringToPoint(userData["shadowAnchor"]):[30,30];
                var markerPriority = _.has(userData, "markerPriority") ? parseInt(userData["markerPriority"]):0;
                var title = _.has(userData, "title") ? userData["title"]:null;
                var tooltip = _.has(userData, "tooltip") ? userData["tooltip"]:null;
                var prefix = _.has(userData, "prefix") ? userData["prefix"]:"fa";
                var extraClasses = _.has(userData, "extraClasses") ? userData["extraClasses"]:"fa-lg";

                // Set icon class
                if(/^(fa-)?map-marker/.test(icon) || /^(fa-)?map-pin/.test(icon)) {
                    var className = "";
                    var popupAnchor = [-3, -35];
                } else {
                    var className = "awesome-marker";
                    var popupAnchor = _.has(userData, "popupAnchor") ? this.stringToPoint(userData["popupAnchor"]):[1,-35];
                }

                // Get description
                var description = _.has(userData, "description") ? userData["description"]:"";

				// SVG and PNG based markers both support hex iconColor do conversion outside
				iconColor = this.convertHex(iconColor);	

                // Create marker
                if (markerType == "svg") {
					// Update marker to shade of Awesome Marker blue
					if(markerColor == "blue") { markerColor = "#38AADD"; }
                    markerColor = this.convertHex(markerColor);
                    popupAnchor = _.has(userData, "popupAnchor") ? this.stringToPoint(userData["popupAnchor"]):[2,-50];

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

                if (userData["markerVisibility"]) {
                    if (userData["markerVisibility"] == "marker") {
                        this._addMarker(userData,
                                        markerIcon,
                                        layerDescription,
                                        markerPriority,
                                        permanentTooltip,
                                        stickyTooltip,
                                        cluster,
                                        this.layerFilter,
                                        layerGroup,
                                        clusterGroup,
                                        tooltip,
										title,
                                        drilldown);
                        this.markerCount += 1;
                    }
                } else {
                    this._addMarker(userData,
                                    markerIcon,
                                    layerDescription,
                                    markerPriority,
                                    permanentTooltip,
                                    stickyTooltip,
                                    cluster,
                                    this.layerFilter,
                                    layerGroup,
                                    clusterGroup,
                                    tooltip,
									title,
                                    drilldown);
                    this.markerCount += 1;
                }
            }, this);
            
            // if (this.isArgTrue(heatmapEnable)) {
            //     this.heat.addTo(this.map);
            // }

            // Enable/disable layer controls and toggle collapse 
            if (this.isArgTrue(layerControl)) {           
                this.control.addTo(this.map);
                this.control.options.collapsed = this.isArgTrue(layerControlCollapsed);
            } else {
                this.control.remove();
            }

            // Clustered
            if (this.isArgTrue(cluster)) {           
                this._addClustered(this.layerFilter,
                                  this);
            // Single value
            } else {
                this._addUnclustered(this.layerFilter,
                                     allPopups,
                                     this);
            }

            // Draw path lines
            if (this.isArgTrue(showPathLines)) {
                var activePaths = [];
                var colors = _.map(pathColorList.split(','), function(color) {
                    return this.convertHex(color);
                }, this);

                var pathData = this.pathData = [];
                var interval = pathSplitInterval * 1000;
                var intervalCounter = 0;
                var previousTime = new Date();

                var paths = _.chain(dataRows)
                    .map(function (d) {            
                        var colorIndex = 0;
                        var pathWeight = _.has(d, "pathWeight") ? d["pathWeight"]:5;
                        var pathOpacity = _.has(d, "pathOpacity") ? d["pathOpacity"]:0.5;
						var dt = _.has(d, "_time") ? moment(d["_time"]):"";
                        var tooltip = _.has(d, "tooltip") ? d["tooltip"]:"";

                        if (pathIdentifier) {
                            var id = d[pathIdentifier];
                            var colorIndex = activePaths.indexOf(id);
                            if (colorIndex < 0) {
                                colorIndex = activePaths.push(id) - 1;
                            }
                        }
                        var color = (_.has(d, "pathColor")) ? d["pathColor"] : colors[colorIndex % colors.length];
                        return {
                            'time': dt,
                            'id': id,
                            'coordinates': L.latLng(d['latitude'], d['longitude']),
                            'colorIndex': colorIndex,
                            'pathWeight': pathWeight,
                            'pathOpacity': pathOpacity,
                            'tooltip': tooltip,
                            'permanentTooltip': permanentTooltip,
                            'stickyTooltip': stickyTooltip,
                            'color': color
                        }
                    })
                    .sortBy(function(d) {
                        return -d.time;
                    })
                    .each(function(d) {
                        var dt = d.time;
                        if (interval && previousTime - dt > interval) {
                            intervalCounter++;
                        }
                        d.interval = 'interval' + intervalCounter;

                        previousTime = dt;
                    })
                    .groupBy(function(d) {
                        return d.id;
                    })
                    .values()
                    .value();

                if(this.isArgTrue(pathSplits)) {
                    _.each(paths, function(path, i) {
                        this.pathData = _.chain(path)
                            .groupBy(function(d) {
                                return d.interval;
                        })
                        .values()
                        .value();

                        this.drawPath(this.pathData, this);
                    }, this);
                } else {
                    this.pathData = paths;
                    this.drawPath(this.pathData, this);
                }

				// Add pathlines to map
				this.pathLineLayer.addTo(this.map);
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
                // //console.log("offset: " + this.offset);
                // //console.log("Processed?: " + this.allDataProcessed);
                setTimeout(function(that) {
                    that.updateDataParams({count: that.chunk, offset: that.offset});
                }, 100, this);
            } else {
                // It's Splunk 6.x
                if(dataRows.length == this.chunk) {
                    // This results in a dupe. The last element in the current result set
                    // and the first element in the next result set. This dupe is handled in the 
                    // loop processing the results.
                    this.offset += this.chunk-1;
                    this.curPage += 1;
                    setTimeout(function(that) {
                        that.updateDataParams({count: that.chunk, offset: that.offset});
                    }, 100, this);
                    //this.updateDataParams({count: this.chunk, offset: this.offset});
                } else {
                    this.allDataProcessed = true;

                    if(this.isArgTrue(autoFitAndZoom)) {
                        if (this.isArgTrue(showPathLines)) {
                            setTimeout(this.fitPathLayerBounds, autoFitAndZoomDelay, this.pathLineLayer, this);
                        } else {
                            setTimeout(this.fitLayerBounds, autoFitAndZoomDelay, this.layerFilter, this);
                        }
                    }
                }
            }

            return this;
        }
    });
});
