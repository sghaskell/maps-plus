var webpack = require('webpack');
var path = require('path');

module.exports = {
    entry: ['google_street_view'],
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
                test: /Modal\.js$/,
                loader: 'imports-loader?_=underscore'
            }
        ]
    },
    externals: [
        'api/SplunkVisualizationBase',
        'api/SplunkVisualizationUtils'
    ]
};
