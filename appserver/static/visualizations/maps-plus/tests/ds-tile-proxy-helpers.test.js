'use strict';

const h = require('../src/ds-tile-proxy-helpers');

describe('isDashboardStudio', () => {
  test('returns true when __SPLUNK_DASHBOARD_STUDIO__ is boolean true', () => {
    expect(h.isDashboardStudio({ __SPLUNK_DASHBOARD_STUDIO__: true })).toBe(true);
  });

  test('returns true when flag is any truthy object', () => {
    expect(h.isDashboardStudio({ __SPLUNK_DASHBOARD_STUDIO__: { version: '1' } })).toBe(true);
    expect(h.isDashboardStudio({ __SPLUNK_DASHBOARD_STUDIO__: 'yes' })).toBe(true);
    expect(h.isDashboardStudio({ __SPLUNK_DASHBOARD_STUDIO__: 1 })).toBe(true);
  });

  test('returns false when flag is absent, null, false, undefined, or 0', () => {
    expect(h.isDashboardStudio({})).toBe(false);
    expect(h.isDashboardStudio({ __SPLUNK_DASHBOARD_STUDIO__: null })).toBe(false);
    expect(h.isDashboardStudio({ __SPLUNK_DASHBOARD_STUDIO__: false })).toBe(false);
    expect(h.isDashboardStudio({ __SPLUNK_DASHBOARD_STUDIO__: undefined })).toBe(false);
    expect(h.isDashboardStudio({ __SPLUNK_DASHBOARD_STUDIO__: 0 })).toBe(false);
  });

  test('returns false for undefined/null window (SSR / stubs)', () => {
    expect(h.isDashboardStudio(undefined)).toBe(false);
    expect(h.isDashboardStudio(null)).toBe(false);
  });

  test('fails closed when property access throws', () => {
    const trap = {};
    Object.defineProperty(trap, '__SPLUNK_DASHBOARD_STUDIO__', {
      get() { throw new Error('access denied'); }
    });
    expect(h.isDashboardStudio(trap)).toBe(false);
  });

  test('detects DS via about:srcdoc location.href (legacy iframe adapter)', () => {
    const win = { location: { href: 'about:srcdoc' } };
    expect(h.isDashboardStudio(win)).toBe(true);
  });

  test('detects DS via about:srcdoc document.URL', () => {
    const win = { location: { href: 'http://other' }, document: { URL: 'about:srcdoc' } };
    expect(h.isDashboardStudio(win)).toBe(true);
  });

  test('detects DS via null origin in iframe', () => {
    const parent = {};
    const win = { parent: parent, location: { href: 'http://x', origin: 'null' } };
    expect(h.isDashboardStudio(win)).toBe(true);
  });

  test('does not flag normal Splunk Classic same-window contexts', () => {
    const win = {
      location: { href: 'http://localhost:8000/en-US/app/search/dash', origin: 'http://localhost:8000' }
    };
    win.parent = win;
    expect(h.isDashboardStudio(win)).toBe(false);
  });
});

describe('SERVER_RESOLVED_TOKENS', () => {
  test('contains exactly z, x, y, s, r in that order (contract with bin/tile_proxy.py)', () => {
    expect(h.SERVER_RESOLVED_TOKENS).toEqual(['z', 'x', 'y', 's', 'r']);
  });
});

describe('normalizeTileTemplate', () => {
  test('preserves all server-resolved tokens intact (D-07/D-09 contract)', () => {
    const tpl = 'https://{s}.tile.org/{z}/{x}/{y}@{r}x.png';
    expect(h.normalizeTileTemplate(tpl, {})).toBe(tpl);
  });

  test('substitutes GIBS layer options (D-09 errata)', () => {
    const tpl = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{gibsLayerId}/default/{gibsTime}/{gibsTileMatrixSet}/{z}/{y}/{x}.{gibsFormat}';
    const out = h.normalizeTileTemplate(tpl, {
      gibsLayerId: 'BlueMarble_NextGeneration',
      gibsTime: '2024-01-01',
      gibsTileMatrixSet: 'GoogleMapsCompatible_Level8',
      gibsFormat: 'jpg'
    });
    expect(out).toContain('BlueMarble_NextGeneration');
    expect(out).toContain('2024-01-01');
    expect(out).toContain('GoogleMapsCompatible_Level8');
    expect(out).toMatch(/\.jpg$/);
    // But z/y/x still pending server resolution:
    expect(out).toContain('/{z}/');
    expect(out).toContain('/{y}/');
    expect(out).toContain('/{x}.');
  });

  test('leaves unknown tokens in place (server will 4xx — surfaces the bug)', () => {
    const tpl = 'https://x/{missingKey}/{z}/{x}/{y}.png';
    expect(h.normalizeTileTemplate(tpl, {})).toBe(tpl);
  });

  test('ignores prototype-pollution keys __proto__, constructor, prototype (T2-04)', () => {
    const tpl = 'https://x/{__proto__}/{constructor}/{prototype}/{z}/{x}/{y}.png';
    // Attacker-controlled opts cannot reach these branches.
    const poisoned = {};
    poisoned.__proto__ = { __proto__: 'PWN', constructor: 'PWN', prototype: 'PWN' };
    const out = h.normalizeTileTemplate(tpl, poisoned);
    expect(out).not.toContain('PWN');
    expect(out).toContain('{__proto__}');
    expect(out).toContain('{constructor}');
    expect(out).toContain('{prototype}');
  });

  test('returns rawTemplate unchanged if not a string (defensive)', () => {
    expect(h.normalizeTileTemplate(null, {})).toBe(null);
    expect(h.normalizeTileTemplate(undefined, {})).toBe(undefined);
    expect(h.normalizeTileTemplate(42, {})).toBe(42);
  });

  test('tolerates null/missing options (defaults to empty)', () => {
    const tpl = 'https://x/{foo}/{z}/{x}/{y}.png';
    expect(h.normalizeTileTemplate(tpl, null)).toBe(tpl);
    expect(h.normalizeTileTemplate(tpl, undefined)).toBe(tpl);
  });

  test('does not traverse to inherited (non-own) properties', () => {
    const parent = { gibsLayerId: 'inherited' };
    const child = Object.create(parent);
    const tpl = 'https://x/{gibsLayerId}/{z}/{x}/{y}.png';
    // With hasOwnProperty guard: inherited value ignored, token kept as-is.
    expect(h.normalizeTileTemplate(tpl, child)).toContain('{gibsLayerId}');
  });
});

describe('buildTileProxyUrl', () => {
  test('emits the canonical route shape per D-07 errata', () => {
    const url = h.buildTileProxyUrl('/services', 'https://tile.osm.org/{z}/{x}/{y}.png',
      { z: 5, x: 10, y: 20 });
    expect(url).toMatch(/^\/services\/maps_plus\/tile\/proxy\?/);
    expect(url).toContain('url=');
    expect(url).toContain('&z=5&x=10&y=20');
  });

  test('encodes the template as a single percent-encoded value (T2-06 no double-encode)', () => {
    const url = h.buildTileProxyUrl('/services',
      'https://tile.osm.org/{z}/{x}/{y}.png', { z: 1, x: 2, y: 3 });
    // Exactly one encodeURIComponent pass:
    //   '{' -> '%7B', ':' -> '%3A', '/' -> '%2F'
    // If double-encoded we would see '%257B' instead.
    expect(url).toContain('%7B');
    expect(url).not.toContain('%257B');
    // Round-trip: decode once should reproduce the exact upstream template.
    const m = url.match(/[?&]url=([^&]+)/);
    expect(decodeURIComponent(m[1])).toBe('https://tile.osm.org/{z}/{x}/{y}.png');
  });

  test('appends s= and r= only when provided and non-empty', () => {
    const withExtras = h.buildTileProxyUrl('/services', 'x', { z: 1, x: 1, y: 1 },
      { s: 'a', r: '2' });
    expect(withExtras).toContain('&s=a');
    expect(withExtras).toContain('&r=2');

    const withoutExtras = h.buildTileProxyUrl('/services', 'x', { z: 1, x: 1, y: 1 });
    expect(withoutExtras).not.toContain('&s=');
    expect(withoutExtras).not.toContain('&r=');

    const emptyExtras = h.buildTileProxyUrl('/services', 'x', { z: 1, x: 1, y: 1 },
      { s: '', r: null });
    expect(emptyExtras).not.toContain('&s=');
    expect(emptyExtras).not.toContain('&r=');
  });

  test('trims trailing slashes from restRoot', () => {
    const a = h.buildTileProxyUrl('/services/', 'x', { z: 0, x: 0, y: 0 });
    const b = h.buildTileProxyUrl('/services///', 'x', { z: 0, x: 0, y: 0 });
    expect(a).toBe('/services/maps_plus/tile/proxy?url=x&z=0&x=0&y=0');
    expect(b).toBe('/services/maps_plus/tile/proxy?url=x&z=0&x=0&y=0');
  });

  test('tolerates empty/missing restRoot (falls back to no prefix)', () => {
    const url = h.buildTileProxyUrl('', 'x', { z: 0, x: 0, y: 0 });
    expect(url).toBe('/maps_plus/tile/proxy?url=x&z=0&x=0&y=0');
  });

  test('encodes template containing user-influenced characters safely (T2-01)', () => {
    // Scenario: custom tile URL override containing query string & fragment.
    const evil = 'https://evil.test/tile/{z}/{x}/{y}.png?a=b&c=d#frag';
    const url = h.buildTileProxyUrl('/services', evil, { z: 1, x: 1, y: 1 });
    const m = url.match(/[?&]url=([^&]+)/);
    expect(decodeURIComponent(m[1])).toBe(evil);
    // Inner &, ?, and # must be percent-encoded so they cannot split the proxy query.
    expect(url).toContain('%26'); // &
    expect(url).toContain('%3F'); // ?
    expect(url).toContain('%23'); // #
  });

  test('coord values are stringified and encoded (accepts numeric or string)', () => {
    const url = h.buildTileProxyUrl('/services', 'x', { z: '5', x: 10, y: 0 });
    expect(url).toContain('&z=5&x=10&y=0');
  });
});
