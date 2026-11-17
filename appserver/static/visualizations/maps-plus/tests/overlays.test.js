/** @jest-environment jsdom */
// MP-04 / MP-14: overlays are registered once in the layer control; layerVisibility applies once.
const L = require('leaflet')
const { addOverlayOnce, applyInitialVisibility, readdOverlay } = require('../src/compat/overlays')

function fakeControl() {
  const c = {
    _layers: [],
    addOverlay(layer, name) { c._layers.push({ layer, name }) }, // no dedupe, like Leaflet
    removeLayer(layer) { c._layers = c._layers.filter(e => e.layer !== layer) }
  }
  return c
}

describe('addOverlayOnce (fake control)', () => {
  test('three calls leave one entry', () => {
    const c = fakeControl(), layer = {}
    addOverlayOnce(c, layer, 'a'); addOverlayOnce(c, layer, 'a'); addOverlayOnce(c, layer, 'a')
    expect(c._layers).toHaveLength(1)
  })
  test('distinct layers each keep one entry', () => {
    const c = fakeControl(), a = {}, b = {}
    addOverlayOnce(c, a, 'a'); addOverlayOnce(c, b, 'b'); addOverlayOnce(c, a, 'a')
    expect(c._layers.map(e => e.name).sort()).toEqual(['a', 'b'])
  })
})

describe('applyInitialVisibility', () => {
  function fakeFg(opts) {
    const fg = { options: opts, onMap: true, removes: 0, remove() { fg.onMap = false; fg.removes++ } }
    return fg
  }
  test('removes once, never after a user re-add', () => {
    const fg = fakeFg({ layerVisibility: false })
    expect(applyInitialVisibility(fg)).toBe(true)
    fg.onMap = true // user ticks the layer
    expect(applyInitialVisibility(fg)).toBe(false)
    expect(fg.onMap).toBe(true)
    expect(fg.removes).toBe(1)
  })
  test('visible layers are left alone', () => {
    const fg = fakeFg({ layerVisibility: true })
    expect(applyInitialVisibility(fg)).toBe(false)
    expect(fg.removes).toBe(0)
  })
  test('missing option is treated as visible', () => {
    const fg = fakeFg({})
    applyInitialVisibility(fg)
    expect(fg.removes).toBe(0)
  })
})

describe('real Leaflet Control.Layers (same sequence as _renderLayersToMap + addLayerToControl)', () => {
  let el, map, control
  beforeEach(() => {
    el = document.createElement('div')
    document.body.appendChild(el)
    map = L.map(el).setView([0, 0], 2)
    control = L.control.layers(null, null).addTo(map)
  })
  afterEach(() => { map.remove(); el.remove() })

  // One completed data cycle for one overlay group, as production code does it.
  function renderCycle(fg, name) {
    readdOverlay(map, fg, true)
    addOverlayOnce(control, fg, name)
    applyInitialVisibility(fg)
  }
  const checked = () => Array.from(el.querySelectorAll('.leaflet-control-layers-overlays input')).map(b => b.checked)

  test('one entry each after repeated cycles; hidden group stays unticked', () => {
    const shown = L.featureGroup(), hidden = L.featureGroup()
    hidden.options.layerVisibility = false
    for (let i = 0; i < 3; i++) { renderCycle(shown, 'shown'); renderCycle(hidden, 'hidden') }
    expect(control._layers).toHaveLength(2)
    expect(map.hasLayer(shown)).toBe(true)
    expect(map.hasLayer(hidden)).toBe(false)
    expect(checked()).toEqual([true, false])
  })

  test('user ticks a hidden group: it stays on across refreshes', () => {
    const hidden = L.featureGroup()
    hidden.options.layerVisibility = false
    renderCycle(hidden, 'hidden')
    hidden.addTo(map) // user ticks it
    renderCycle(hidden, 'hidden'); renderCycle(hidden, 'hidden')
    expect(map.hasLayer(hidden)).toBe(true)
  })

  test('user unticks a visible group: it stays off across refreshes', () => {
    const shown = L.featureGroup()
    renderCycle(shown, 'shown')
    map.removeLayer(shown) // user unticks it
    renderCycle(shown, 'shown'); renderCycle(shown, 'shown')
    expect(map.hasLayer(shown)).toBe(false)
    expect(checked()).toEqual([false])
  })

  test('without a layer control the group is always (re)added', () => {
    const fg = L.featureGroup()
    fg.options.layerVisibility = false
    expect(readdOverlay(map, fg, false)).toBe(true)
    expect(readdOverlay(map, fg, false)).toBe(true)
    expect(map.hasLayer(fg)).toBe(true)
  })
})
