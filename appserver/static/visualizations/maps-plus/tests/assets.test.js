var assets = require('../src/compat/assets')

describe('contribBase', function() {
    var tail = '/static/app/leaflet_maps_app/visualizations/maps-plus/contrib'
    test('en-US, no root', function() {
        expect(assets.contribBase({ $C: { LOCALE: 'en-US', MRSPARKLE_ROOT_PATH: '' } })).toBe('/en-US' + tail)
    })
    test('ja-JP with root_endpoint', function() {
        expect(assets.contribBase({ $C: { LOCALE: 'ja-JP', MRSPARKLE_ROOT_PATH: '/splunk' } })).toBe('/splunk/ja-JP' + tail)
    })
    test('trailing slash on root', function() {
        expect(assets.contribBase({ $C: { LOCALE: 'en-US', MRSPARKLE_ROOT_PATH: '/splunk/' } })).toBe('/splunk/en-US' + tail)
    })
    test('missing $C falls back to literal', function() {
        expect(assets.contribBase({})).toBe('/en-US' + tail)
        expect(assets.contribBase(undefined)).toBe('/en-US' + tail)
    })
    test('missing LOCALE defaults to en-US', function() {
        expect(assets.contribBase({ $C: {} })).toBe('/en-US' + tail)
    })
})

describe('assetUrl', function() {
    test('relative', function() {
        expect(assets.assetUrl('/b', 'images', 'x.png')).toBe('/b/images/x.png')
    })
    test('http(s) unchanged', function() {
        expect(assets.assetUrl('/b', 'images', 'http://h/x.png')).toBe('http://h/x.png')
        expect(assets.assetUrl('/b', 'images', 'https://h/x.png')).toBe('https://h/x.png')
    })
    test('root-relative unchanged', function() {
        expect(assets.assetUrl('/b', 'images', '/static/x.png')).toBe('/static/x.png')
    })
})
