L.Control.Legend = L.Control.extend({
    options: {
        position: 'topleft',
        collapsed: true,
        controlButton: {
            title: "Legend"
        }
    },

    onRemove: function(map) {
    this._container = null;
    },
    
    onAdd: function (map) {
        
        this._map = map;
        var container = this._container = L.DomUtil.create('div', 'legend-container');
        
        this._initToggle();
        
        return container;
    },
    
    _initToggle: function() {

        var container = this._container;

        //Makes this work on IE10 Touch devices by stopping it from firing a mouseout event when the touch is released
        container.setAttribute('aria-haspopup', true);

        if (!L.Browser.touch) {
            L.DomEvent
                .disableClickPropagation(container);
            //.disableScrollPropagation(container);
        } else {
            L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation);
        }

        if (this.options.collapsed) {
            this._collapse();

            if (!L.Browser.android) {
                L.DomEvent
                    .on(container, 'mouseover', this._expand, this)
                    .on(container, 'mouseout', this._collapse, this);
            }
            var link = this._button = L.DomUtil.create('a', " legend-toggle", container);
            link.href = '#';
            link.title = this.options.controlButton.title;

            if (L.Browser.touch) {
                L.DomEvent
                    .on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', this._expand, this);
            } else {
                L.DomEvent.on(link, 'focus', this._expand, this);
            }

            this._map.on('click', this._collapse, this);
        }
    },
    
    _expand: function() {
        this._container.className = this._container.className.replace('legend-collapsed', '');
        $(".legend-toggle-icon").hide();
    },

    _collapse: function() {
        L.DomUtil.addClass(this._container, 'legend-collapsed');
        $(".legend-toggle-icon").show();
    },
});

