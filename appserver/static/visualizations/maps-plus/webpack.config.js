var webpack = require('webpack');
var path = require('path');
var UglifyJsPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
    entry: './src/maps-plus.js',
    
    target: 'web',
    
    resolve: {
        modules: [
            path.join(__dirname, 'src'),
            path.join(__dirname, 'contrib/js'),
            'node_modules'
        ],
        extensions: ['.js', '.json']
    },
    
    output: {
        filename: 'visualization.js',
        path: path.resolve(__dirname, '.'),
        libraryTarget: 'amd'
    },
    
    module: {
        rules: [
            // Babel transpiles ES6 to ES5 FIRST (before other loaders)
            {
                test: /\.js$/,
                exclude: /node_modules\/(?!(leaflet-ant-path|proj4leaflet|@geoman-io\/leaflet-geoman-free)\/).*/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['env', {
                                targets: {
                                    browsers: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions', 'last 2 Edge versions']
                                },
                                modules: false
                            }]
                        ]
                    }
                }
            },
            {
                test: /leaflet\.spin\.js$/,
                loader: 'imports-loader?L=leaflet'
            },
            {
                test: /HeatLayer\.js$/,
                use: [
                    'imports-loader?L=leaflet',
                    'imports-loader?simpleheat'
                ]
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
                use: [
                    'imports-loader?L=leaflet',
                    'transform-loader?brfs'
                ]
            },
            {
                test: /LeafletPlayback\.js$/,
                loader: 'imports-loader?$=jquery,jQuery=jquery'
            }
        ]
    },
    
    externals: [
        'api/SplunkVisualizationBase',
        'api/SplunkVisualizationUtils'
    ],
    
    plugins: [
        new UglifyJsPlugin({
            uglifyOptions: {
                ecma: 8,
                compress: {
                    warnings: false
                },
                mangle: true,
                output: {
                    comments: false
                }
            },
            sourceMap: false,
            parallel: true  // Faster builds
        })
    ], 

    devtool: false
};