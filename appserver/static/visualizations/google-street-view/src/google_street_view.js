define([
            'jquery',
            'underscore',
            'api/SplunkVisualizationBase',
            'api/SplunkVisualizationUtils',
            'load-google-maps-api-2',
            '../../maps-plus/contrib/js/Modal',
        ],
        function(
            $,
            _,
            SplunkVisualizationBase,
            SplunkVisualizationUtils,
            loadGoogleMapsAPI,
            Modal
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

        _getEscapedProperty: function(name, config) {
            var propertyValue = config[this.getPropertyNamespaceInfo().propertyNamespace + name];
            return SplunkVisualizationUtils.escapeHtml(propertyValue);
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

        renderModal: function(id, title, body, buttonText, callback=function(){}, callbackArgs=null) {
            function anonCallback(callback=function(){}, callbackArgs=null) {
                if(callbackArgs) {
                    callback.apply(this, callbackArgs);
                } else {
                    callback();
                }
            }

            // Create the modal
            var myModal = new Modal(id, {
                        title: title,
                        backdrop: 'static',
                        keyboard: false,
                        destroyOnHide: true,
                        type: 'wide'
            });

            // Add content
            myModal.body.append($(body));

            // Add cancel button for update/delete action
            if(id == "user-delete-confirm" || id == "update-user-form") {
                myModal.footer.append($('<cancel>').attr({
                    type: 'button',
                    'data-dismiss': 'modal'
                })
                .addClass('btn btn-secondary').text("Cancel")).on('click', function(){});
            }

            // Add footer
            myModal.footer.append($('<button>').attr({
                type: 'button',
                'data-dismiss': 'modal'
            })
            .addClass('btn btn-primary').text(buttonText).on('click', function () {
                    anonCallback(callback, callbackArgs);
            }))

            // Launch it!  
            myModal.show();
        },

        getStoredApiKey: function(options) {
            var deferred = $.Deferred();

            // Detect version from REST API
            $.ajax({
                type: "GET",
                async: true,
                context: this,
                url: "/en-US/splunkd/__raw/servicesNS/-/-/storage/passwords/" + options.realm + ":" + options.user +":",
                success: function(s) {                                        
                    var xml = $(s);
                    var that = this;
                    $(xml).find('content').children().children().each(function(i, v) {
                        if(/name="clear_password"/.test(v.outerHTML)) {
                            deferred.resolve(v.textContent)
                        } 
                    });
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
                    console.error("Failed to get API key for user: " + options.user + ", realm: " + options.realm);
                }
            });

            return deferred.promise();
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

            // get data
            var dataRows = data.results;

            // check for data
            if (!dataRows || dataRows.length === 0 || dataRows[0].length === 0) {
                return this;
            }

            // Validate we have at least latitude and longitude fields
            if(!_.has(dataRows[0], "coordinates")) {
                 throw new SplunkVisualizationBase.VisualizationError(
                    'Incorrect Fields Detected - coordinates field required'
                );
            }

            // get configs
            var googleMapsApiKeyUser = this._getEscapedProperty('googleMapsApiKeyUser', config),
                googleMapsApiKeyRealm = this._getEscapedProperty('googleMapsApiKeyRealm', config),
                defaultHeight = parseInt(this._getEscapedProperty('defaultHeight', config)),
                fullScreen = parseInt(this._getEscapedProperty('fullScreen', config));

            // Get parent element of div to resize 
            // Nesting of Div's is different, try 7.x first
            var parentEl = $(this.el).parent().parent().parent().parent().parent().closest("div").attr("data-cid");
            var parentView = $(this.el).parent().parent().parent().parent().parent().closest("div").attr("data-view");

            // Default to 6.x view
            if(parentView != 'views/shared/ReportVisualizer') {
                var parentEl = $(this.el).parent().parent().closest("div").attr("data-cid");
                var parentView = $(this.el).parent().parent().closest("div").attr("data-view");
            }

            this.getStoredApiKey({user: googleMapsApiKeyUser,
                                  realm: googleMapsApiKeyRealm,
                                  context: this})
            .then($.proxy(function(googleMapsApiKey) {
                // Load Google Maps
                loadGoogleMapsAPI({key: googleMapsApiKey}).then(function(googleMaps) {                    
                    var coordinates = dataRows[0]["coordinates"].split(/,/);
                    var latlng = {lat: parseFloat(coordinates[0]), lng: parseFloat(coordinates[1])};
                    var map = this.map = new googleMaps.Map(this.el);
                    var panorama = this.panorama = new googleMaps.StreetViewPanorama(this.el, {position: latlng,
                                                                                                    pov: {
                                                                                                    heading: 34,
                                                                                                    pitch: 5 
                                                                                                    }
                                                                                            });
    
                    this.map.setStreetView(this.panorama);
    
                    // Map Full Screen Mode
                    if (this.isArgTrue(fullScreen)) {
                        var vh = $(window).height() - 120;
                        $("div[data-cid=" + parentEl + "]").css("height", vh);
    
                        $(window).resize(function() {
                            var vh = $(window).height() - 120;
                            $("div[data-cid=" + parentEl + "]").css("height", vh);
                        });
                        googleMaps.event.trigger(this.map, 'resize');
                        //this.map.invalidateSize();
                    } else {
                        $("div[data-cid=" + parentEl + "]").css("height", defaultHeight);
                        //this.map.invalidateSize();
                        googleMaps.event.trigger(this.map, 'resize');
                    }     
                }.bind(this)).catch(function(err) {
                    console.error(err);
                });
            }, this)) 

            return this;
        }
    });
});
