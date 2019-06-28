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
                test: /Modal\.js$/,
                loader: 'imports-loader?_=underscore'
            },
            {
                test: /CLDRPluralRuleParser\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            },
            {
                test: /jquery\.i18n\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            },
            {
                test: /jquery\.i18n\.emitter\.bidi\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            },
            {
                test: /jquery\.i18n\.emitter\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            },
            {
                test: /jquery\.i18n\.fallbacks\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            },
           {
                test: /jquery\.i18n\.language\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            },
            {
                test: /jquery\.i18n\.messagestore\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            },
            {
                test: /jquery\.i18n\.parser\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            },
            {
                test: /leaflet-measure\.js$/,
                loaders: ['imports-loader?L=leaflet', 'transform/cacheable?brfs']
            },
            {
                test: /LeafletPlayback\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            }
        ]
    },
    externals: [
        'api/SplunkVisualizationBase',
        'api/SplunkVisualizationUtils',
        'splunkjs/mvc'
    ]
};
