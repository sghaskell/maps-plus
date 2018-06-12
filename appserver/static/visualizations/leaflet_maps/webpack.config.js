var webpack = require('webpack');
var path = require('path');

module.exports = {
    entry: ['leaflet_maps'],
    resolve: {
        root: [
            path.join(__dirname, 'src'),
        ]
    },
    output: {
        filename: 'visualization.js',
        libraryTarget: 'amd'
    },
    module: {
        loaders: [
            {
                test: /leaflet\.markercluster-src\.js$/,
                loader: 'imports-loader?L=leaflet'
            },
            {
                test: /leaflet\.awesome-markers\.js$/,
                loader: 'imports-loader?L=leaflet'
            },
            {
                test: /leaflet-vector-markers\.js$/,
                loader: 'imports-loader?L=leaflet'
            },
            {
                test: /leaflet\.featuregroup\.subgroup-src\.js$/,
                loader: 'imports-loader?define=>false'
            },
            {
                test: /leaflet-measure\.js$/,
                loaders: ['imports-loader?L=leaflet', 'transform/cacheable?brfs']
            }
        ]
    },
    externals: [
        'api/SplunkVisualizationBase',
        'api/SplunkVisualizationUtils'
    ]
};
