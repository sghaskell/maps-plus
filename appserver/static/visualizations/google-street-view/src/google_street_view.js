define([
            'jquery',
            'underscore',
            'api/SplunkVisualizationBase',
            'api/SplunkVisualizationUtils',
            'load-google-maps-api-2'
        ],
        function(
            $,
            _,
            SplunkVisualizationBase,
            SplunkVisualizationUtils,
            loadGoogleMapsAPI
        ) {


    return SplunkVisualizationBase.extend({
        maxResults: 0,
        tileLayer: null,
		mapOptions: {},
        contribUri: '/en-US/static/app/leaflet_maps_app/visualizations/google-street-view/contrib/',
        defaultConfig:  {
            'display.visualizations.custom.leaflet_maps_app.google-street-view.googleMapsApiKey': ""
        },

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.$el = $(this.el);
            this.isInitializedDom = false;
        },
  
        // Search data params
        getInitialDataParams: function() {
            return ({
                outputMode: SplunkVisualizationBase.RAW_OUTPUT_MODE,
                count: this.maxResults
            });
        },

        setupView: function() {
            this.clearMap = false;
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

        formatData: function(data) {
            if(data.results.length < 1) {
                    return false;
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

            // get data
            var dataRows = data.results;

            // check for data
            if (!dataRows || dataRows.length === 0 || dataRows[0].length === 0) {
                return this;
            }

            // Validate we have at least latitude and longitude fields
            if(!("coordinates" in dataRows[0])) {
                 throw new SplunkVisualizationBase.VisualizationError(
                    'Incorrect Fields Detected - coordinates field required'
                );
            }

            // get configs
            var googleMapsApiKey = this._getEscapedProperty('googleMapsApiKey', config);

            // Initialize the DOM
            //if (!this.isInitializedDom) {
			    // Load Google Maps
            loadGoogleMapsAPI({key: googleMapsApiKey}).then(function(googleMaps) {
                    //_.each(dataRows, function(userData, i) {
                    console.log(dataRows);
                    var coordinates = dataRows[0]["coordinates"].split(/,/);
                    console.log(coordinates);
                    var latlng = {lat: parseFloat(coordinates[0]), lng: parseFloat(coordinates[1])};
                    var map = new googleMaps.Map(this.el);
                    var panorama = new googleMaps.StreetViewPanorama(this.el, {position: latlng,
                                                                                pov: {
                                                                                    heading: 34,
                                                                                    pitch: 5 
                                                                                }
                    });

                    map.setStreetView(panorama);
           }.bind(this)).catch(function(err) {
               console.error(err);
           }); 
            //} 

            //console.log(this.map);
			/********* BEGIN PROCESSING DATA **********/
 
            // Iterate through each row creating layer groups per icon type
            // and create markers appending to a markerList in each layerfilter object
            
			// 1.5.6.1 - Reverting to old code due to reports of inconsistent 
			// behavior featching results.
            // Chunk through data 50k results at a time
            /*
            if(dataRows.length === this.chunk) {
                this.offset += this.chunk;
                this.updateDataParams({count: this.chunk, offset: this.offset});
            } else {
                this.clearMap = true;
            }
            */

            return this;
        }
    });
});
