"use strict";
// Static consistency checks between the setup page, app.conf, nav, metadata and
// the option names Maps+ actually reads. No Splunk needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../../appserver/static/javascript/maps_plus_setup_logic.js");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const view = read("default/data/ui/views/maps_plus_setup.xml");
const js = read("appserver/static/javascript/maps_plus_setup.js");
const app = read("default/app.conf");
const meta = read("metadata/default.meta");
const nav = read("default/data/ui/nav/default.xml");
const mapsPlus = read("appserver/static/visualizations/maps-plus/src/maps-plus.js");
const streetView = read("appserver/static/visualizations/google-street-view/src/google_street_view.js");

test("view is well-formed enough: balanced tags and no named HTML entities", () => {
    assert.ok(!/&(?!amp;|lt;|gt;|apos;|quot;|#)\w+;/.test(view), "named entity other than the five XML ones");
    const open = (view.match(/<div\b/g) || []).length, close = (view.match(/<\/div>/g) || []).length;
    assert.equal(open, close);
});

test("view references script/stylesheet files that exist", () => {
    for (const attr of ["script", "stylesheet"]) {
        const m = view.match(new RegExp(attr + '="([^"]+)"'));
        assert.ok(m, attr);
        assert.ok(fs.existsSync(path.join(root, "appserver/static", m[1])), m[1]);
    }
});

test("every id the JS binds exists in the view", () => {
    const ids = new Set([...js.matchAll(/"#([a-z_]+)"/g)].map((m) => m[1]));
    ["tile", "bing", "google"].forEach((k) => ids.add(k + "_msg"));
    for (const id of ids) {
        if (id.startsWith("tile_url") || /^(tile|bing|google)_/.test(id)) {
            assert.ok(view.includes('id="' + id + '"'), "missing #" + id);
        }
    }
});

test("app.conf points setup_view at the shipped view and does not force first-run redirect", () => {
    assert.match(app, /^setup_view = maps_plus_setup$/m);
    assert.ok(fs.existsSync(path.join(root, "default/data/ui/views/maps_plus_setup.xml")));
    assert.match(app, /^is_configured = 1$/m);
    assert.match(app, /^reload\.maps_plus_settings = simple$/m);
});

test("setup view is in the nav and restricted to admins", () => {
    assert.match(nav, /<view name="maps_plus_setup"\s*\/>/);
    assert.match(meta, /\[views\/maps_plus_setup\]\s*\naccess = read : \[ admin, sc_admin \], write : \[ admin, sc_admin \]/);
    assert.match(meta, /\[maps_plus_settings\]/);
});

test("the options we write are options the visualizations really read", () => {
    const all = Object.assign({},
        L.defaultStanzaForTile("x"),
        L.defaultStanzaForSecret("bing", true),
        L.defaultStanzaForSecret("google", true));
    for (const key of Object.keys(all)) {
        const short = key.split(".").pop();
        const src = key.includes("google-street-view") ? streetView : mapsPlus;
        assert.ok(src.includes("'" + short + "'") || src.includes('"' + short + '"'), short + " not read by its visualization");
    }
});

test("password realm/name match the URL getStoredApiKey builds (realm:user:)", () => {
    assert.ok(/storage\/passwords\/" \+ options\.realm \+ ":" \+ options\.user \+":"/.test(mapsPlus));
});

test("JS has no early exit on is_configured, never touches setup.xml, and never logs secrets", () => {
    assert.ok(!/is_configured|isConfigured|alreadyConfigured/.test(js));
    assert.ok(!fs.existsSync(path.join(root, "default/setup.xml")));
    assert.ok(!/console\.(log|info|debug|warn|error)/.test(js));
});

test("secrets are not written to any conf the page creates", () => {
    // The custom-conf write only ever receives { mapTileOverride }.
    const calls = [...js.matchAll(/await writeSettingsConf\(([^)]*)\)/g)].map((m) => m[1].trim());
    assert.equal(calls.length, 2); // save + clear
    for (const c of calls) assert.ok(c === "s" || /^\{ mapTileOverride: ("")? ?\}$/.test(c) || /mapTileOverride/.test(c), c);
    assert.ok(!/password/i.test(js.slice(js.indexOf("async function writeSettingsConf"), js.indexOf("async function saveSecret"))));
});

test("viz fallback: runs only when the panel made no basemap choice and never inside the Studio sandbox", () => {
    assert.match(mapsPlus, /if\(!mapTileOverride && !_dataTile && mapTile === _defaultTile && !this\.isArgTrue\(antarcticProj\)\) \{\s*this\._applySavedBasemap\(\)/);
    assert.match(mapsPlus, /_applySavedBasemap: function\(\) \{\s*if\(this\._savedBasemapRequested \|\| this\._isSandboxedFrame\(\)\)/);
    assert.match(mapsPlus, /conf-maps_plus_settings\/basemap/);
    assert.match(mapsPlus, /_isSandboxedFrame: function\(\) \{[^}]*origin === 'null'/);
});

test("viz fallback: Bing/Google use the Setup page credential names only when the panel names none", () => {
    const L2 = L.SECRETS;
    assert.ok(mapsPlus.includes("bingMapsApiKeyUser = '" + L2.bing.name + "'"));
    assert.ok(mapsPlus.includes("googlePlacesApiKeyUser = '" + L2.google.name + "'"));
    assert.ok(mapsPlus.includes("= '" + L.PASSWORD_REALM + "'"));
});

test("Studio parity: viz reads a mapTileOverride result column; the option still wins; not for Antarctic", () => {
    assert.match(mapsPlus, /_getDataTileOverride: function\(rows\)/);
    assert.match(mapsPlus, /rows\[i\]\.mapTileOverride/);
    assert.match(mapsPlus, /var _colTile = \(!mapTileOverride && !this\.isArgTrue\(antarcticProj\)\) \? this\._getDataTileOverride\(dataRows\) : ""/);
    // With the keyless OpenFreeMap default (MP-08), the column counts as an explicit raster choice.
    assert.match(mapsPlus, /_basemapExplicit = _dataTile \? _\.extend\(\{\}, explicitBasemapKeys, \{mapTileOverride: true\}\)/);
    assert.match(mapsPlus, /this\.activeTile = \(mapTileOverride\) \? mapTileOverride : \(_dataTile \? _dataTile : _effectiveTile\)/);
    // value goes through makeSafeUrl and must be http(s)
    assert.match(mapsPlus, /_getDataTileOverride[\s\S]*makeSafeUrl\(v\.trim\(\)\)[\s\S]*\^https\?/);
});

test("macro: shipped default is an empty column, readable everywhere, writable by admins only", () => {
    const macros = read("default/macros.conf");
    assert.match(macros, /^\[mapsplus_basemap\]$/m);
    assert.match(macros, /^definition = eval mapTileOverride=""$/m);
    assert.match(meta, /\[macros\]\s*\naccess = read : \[ \* \], write : \[ admin, sc_admin \]\s*\nexport = system/);
    assert.equal(L.MACRO_NAME, "mapsplus_basemap");
    assert.ok(js.includes("data/macros/"));
});

test("Studio parity: _getDataTileOverride behaviour (extracted from maps-plus.js)", () => {
    const start = mapsPlus.indexOf("_getDataTileOverride: function(rows) {");
    const end = mapsPlus.indexOf("\n},", start) + 3;
    const fn = new Function("SplunkVisualizationUtils", "return {" + mapsPlus.slice(start, end).replace(/,\s*$/, "") + "}");
    // stand-in for Splunk's sanitizer: only http(s) survives, anything else becomes about:blank
    const utils = { makeSafeUrl: (u) => (/^https?:\/\//i.test(u) ? u : "about:blank") };
    const get = fn(utils)._getDataTileOverride;
    const T = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=k";
    assert.equal(get([{ mapTileOverride: T }]), T);
    assert.equal(get([{ a: 1 }, { mapTileOverride: null }, { mapTileOverride: "  " }, { mapTileOverride: T }]), T, "first non-empty row wins; nulls and blanks skipped");
    assert.equal(get([{ mapTileOverride: "javascript:alert(1)" }]), "", "non-http(s) rejected");
    assert.equal(get([]), "");
    assert.equal(get(null), "");
    assert.equal(get([{ latitude: 1, longitude: 2 }]), "");
});
