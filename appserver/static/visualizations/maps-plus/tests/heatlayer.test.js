/** @jest-environment jsdom */
// MP-03: Leaflet.heat layer must not crash when it is off the map (layerVisibility=false)
// and points are added or redrawn.

global.L = require('leaflet');
window.L = global.L;
global.simpleheat = require('simpleheat');
window.simpleheat = global.simpleheat;

// jsdom has no canvas implementation. simpleheat calls many 2D context methods, so every
// unknown method is a no-op; the pixel-data methods return correctly sized buffers.
const ctxStub = new Proxy({}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (prop === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    if (prop === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => undefined;
  },
  set(target, prop, value) { target[prop] = value; return true; }
});
HTMLCanvasElement.prototype.getContext = function () { return ctxStub; };

require('../contrib/js/HeatLayer');

function makeMap(width, height) {
  const div = document.createElement('div');
  div.style.width = width + 'px';
  div.style.height = height + 'px';
  document.body.appendChild(div);
  const map = L.map(div, { zoomAnimation: false });
  map.setView([0, 0], 1);
  return { map, div };
}

describe('L.HeatLayer when off the map (MP-03)', () => {
  test('addLatLng on a layer that is off the map does not throw and stores the point', () => {
    const { map, div } = makeMap(400, 300);
    const layer = L.heatLayer([], { map: map });
    map.addLayer(layer);
    map.removeLayer(layer); // Leaflet sets layer._map to null here
    expect(layer._map).toBeNull();
    expect(() => layer.addLatLng(L.latLng(1, 2))).not.toThrow();
    expect(layer.getLatLng().length).toBe(1);
    map.remove();
    div.remove();
  });

  test('redraw on an unattached layer returns the layer and does not throw', () => {
    const { map, div } = makeMap(400, 300);
    const layer = L.heatLayer([L.latLng(1, 2)], { map: map });
    map.addLayer(layer);
    map.removeLayer(layer);
    let result;
    expect(() => { result = layer.redraw(); }).not.toThrow();
    expect(result).toBe(layer);
    map.remove();
    div.remove();
  });

  test('a pending frame is cancelled when the layer is removed from the map', () => {
    const { map, div } = makeMap(400, 300);
    const layer = L.heatLayer([], { map: map });
    map.addLayer(layer);
    layer.addLatLng(L.latLng(1, 2)); // schedules a frame
    expect(layer._frame).not.toBeNull();
    map.removeLayer(layer);
    expect(layer._frame).toBeNull();
    map.remove();
    div.remove();
  });

  test('addLatLng after the layer was added to a zero-size map and removed does not throw', () => {
    const { map, div } = makeMap(0, 0);
    const layer = L.heatLayer([], { map: map });
    map.addLayer(layer);
    map.removeLayer(layer);
    expect(() => layer.addLatLng(L.latLng(1, 2))).not.toThrow();
    expect(() => layer._redraw()).not.toThrow();
    expect(layer.getLatLng().length).toBe(1);
    map.remove();
    div.remove();
  });
});
