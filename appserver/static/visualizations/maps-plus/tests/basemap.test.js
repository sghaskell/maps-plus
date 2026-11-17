const { explicitKeys, resolveBasemap, styleUrl, NS } = require('../src/compat/basemap')

function run(cfg, isDark) {
  const explicit = explicitKeys(cfg)
  const values = {}
  Object.keys(cfg).forEach(k => { values[k.slice(NS.length)] = cfg[k] })
  return resolveBasemap({ explicit, values, isDark: !!isDark })
}
const c = (o) => Object.keys(o).reduce((a, k) => { a[NS + k] = o[k]; return a }, {})

describe('resolveBasemap', () => {
  test('nothing explicit, light -> OpenFreeMap positron', () => {
    expect(run({}, false)).toEqual({ useOpenFreeMap: true, auto: true, stylePreset: 'positron' })
  })
  test('nothing explicit, dark -> OpenFreeMap dark', () => {
    expect(run({}, true)).toMatchObject({ useOpenFreeMap: true, stylePreset: 'dark' })
  })
  test('unrelated keys do not count; empty values do not count', () => {
    expect(run(c({ cluster: '1', mapTile: '', mapTileOverride: '', useOpenFreeMap: '' })).useOpenFreeMap).toBe(true)
  })
  test('explicit mapTile -> raster', () => {
    expect(run(c({ mapTile: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' }), true).useOpenFreeMap).toBe(false)
  })
  test('mapTileOverride -> raster', () => {
    expect(run(c({ mapTileOverride: 'https://x/{z}/{x}/{y}.png' })).useOpenFreeMap).toBe(false)
  })
  test('explicit useOpenFreeMap 0 honoured even with nothing else', () => {
    expect(run(c({ useOpenFreeMap: '0' }))).toMatchObject({ useOpenFreeMap: false, auto: false })
  })
  test('explicit useOpenFreeMap 1 honoured even with mapTile set', () => {
    expect(run(c({ useOpenFreeMap: '1', mapTile: 'x' }))).toMatchObject({ useOpenFreeMap: true, auto: false, stylePreset: 'liberty' })
  })
  test('bing on -> not OpenFreeMap; bing 0 -> OpenFreeMap', () => {
    expect(run(c({ bingMaps: '1' })).useOpenFreeMap).toBe(false)
    expect(run(c({ bingMaps: '0' })).useOpenFreeMap).toBe(true)
  })
  test('antarctic projection -> raster', () => {
    expect(run(c({ antarcticProj: 1 })).useOpenFreeMap).toBe(false)
  })
  test('explicit preset honoured in auto and explicit modes', () => {
    expect(run(c({ maplibreStylePreset: 'bright' }), true)).toMatchObject({ useOpenFreeMap: true, stylePreset: 'bright' })
    expect(run(c({ useOpenFreeMap: '1', maplibreStylePreset: 'fiord' })).stylePreset).toBe('fiord')
  })
  test('explicitKeys unions several configs', () => {
    expect(explicitKeys(c({ mapTile: 'a' }), c({ bingMaps: '1' }))).toEqual({ mapTile: true, bingMaps: true })
  })
})

describe('styleUrl', () => {
  test('preset and override', () => {
    expect(styleUrl('dark')).toBe('https://tiles.openfreemap.org/styles/dark')
    expect(styleUrl('dark', 'https://s/style.json')).toBe('https://s/style.json')
  })
})

describe('re-render with the same (mutated) config object', () => {
  const B = require('../src/compat/basemap')
  const NS = B.NS
  const defaults = { [NS + 'mapTile']: 'https://carto/light', [NS + 'useOpenFreeMap']: '0', [NS + 'showClickMarker']: 1 }

  test('injected defaults are not treated as explicit on the next render', () => {
    const cfg = { [NS + 'layerControl']: '1', [NS + 'cluster']: '0' }
    let injected = {}
    // render 1
    expect(B.explicitKeys(B.withoutInjected(cfg, injected)).mapTile).toBeUndefined()
    injected = Object.assign({}, injected, B.mergeDefaultsRecording(cfg, defaults))
    expect(cfg[NS + 'showClickMarker']).toBe(1)          // merged in place, as getCurrentConfig() readers expect
    // render 2: same object, now containing the injected defaults
    const explicit = B.explicitKeys(B.withoutInjected(cfg, injected))
    expect(explicit.mapTile).toBeUndefined()
    expect(explicit.useOpenFreeMap).toBeUndefined()
    expect(B.resolveBasemap({ explicit, values: {}, isDark: false }).useOpenFreeMap).toBe(true)
  })

  test('a user value that differs from the injected default counts as explicit', () => {
    const cfg = { [NS + 'layerControl']: '1', [NS + 'cluster']: '0' }
    const injected = B.mergeDefaultsRecording(cfg, defaults)
    cfg[NS + 'mapTile'] = 'https://osm/{z}/{x}/{y}.png'   // user picks a tile later
    expect(B.explicitKeys(B.withoutInjected(cfg, injected)).mapTile).toBe(true)
  })
})
