const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: './src/maps-plus.js',

    mode: 'production',

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
        library: { type: 'amd' }
    },

    module: {
        rules: [
            // Babel transpiles ES6+ to ES5 FIRST (before other loaders)
            {
                test: /\.js$/,
                exclude: /node_modules\/(?!(leaflet-ant-path|proj4leaflet|@geoman-io\/leaflet-geoman-free)\/).*/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: {
                                    browsers: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions', 'last 2 Edge versions']
                                },
                                modules: false
                            }]
                        ]
                    }
                }
            },
            // Pattern A: aliased default imports (var L = require('leaflet'))
            {
                test: /leaflet\.spin\.js$/,
                loader: 'imports-loader',
                options: { imports: 'default leaflet L' }
            },
            {
                test: /HeatLayer\.js$/,
                use: [
                    {
                        loader: 'imports-loader',
                        options: { imports: 'default leaflet L' }
                    },
                    {
                        loader: 'imports-loader',
                        options: { imports: 'default simpleheat simpleheat' }
                    }
                ]
            },
            {
                test: /leaflet\.awesome-markers\.js$/,
                loader: 'imports-loader',
                options: { imports: 'default leaflet L' }
            },
            {
                test: /leaflet-vector-markers\.js$/,
                loader: 'imports-loader',
                options: { imports: 'default leaflet L' }
            },
            // Pattern B: disable AMD define
            {
                test: /leaflet\.featuregroup\.subgroup-src\.js$/,
                loader: 'imports-loader',
                options: { additionalCode: 'var define = false;' }
            },
            // Pattern A continued
            {
                test: /Modal\.js$/,
                loader: 'imports-loader',
                options: { imports: 'default underscore _' }
            },
            // Pattern C: multiple jQuery aliases
            {
                test: /CLDRPluralRuleParser\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.emitter\.bidi\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.emitter\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.fallbacks\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.language\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.messagestore\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            {
                test: /jquery\.i18n\.parser\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            },
            // leaflet-measure: imports-loader + brfs transform (see Task 4 if this fails)
            {
                test: /leaflet-measure\.js$/,
                use: [
                    {
                        loader: 'imports-loader',
                        options: { imports: 'default leaflet L' }
                    },
                    'transform-loader?brfs'
                ]
            },
            {
                test: /LeafletPlayback\.js$/,
                loader: 'imports-loader',
                options: {
                    imports: [
                        { syntax: 'default', moduleName: 'jquery', name: '$' },
                        { syntax: 'default', moduleName: 'jquery', name: 'jQuery' }
                    ]
                }
            }
        ]
    },

    externals: [
        'api/SplunkVisualizationBase',
        'api/SplunkVisualizationUtils'
    ],

    plugins: [
        new CopyPlugin({
            patterns: [{
                from: 'node_modules/@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css',
                to: 'contrib/css/leaflet-geoman.css'
            }]
        })
    ],

    optimization: {
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    ecma: 2017,
                    compress: { warnings: false },
                    mangle: true,
                    format: { comments: false }
                },
                parallel: true
            })
        ]
    },

    performance: {
        hints: false  // bundle size warnings are not actionable for a Splunk AMD visualization
    },

    devtool: false
};
