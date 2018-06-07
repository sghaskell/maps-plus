var webpack = require('webpack');
var path = require('path');

module.exports = {
    entry: ['maps-plus'],
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
                test: /leaflet\.spin\.js$/,
                loader: 'imports-loader?L=leaflet'
            },
            {
                test: /HeatLayer\.js$/,
                loaders: ['imports-loader?L=leaflet', 'imports-loader?simpleheat']
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
