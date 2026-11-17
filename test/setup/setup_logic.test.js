"use strict";
// Run: node --test test/setup/*.test.js      (Node 18+, no dependencies)
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../appserver/static/javascript/maps_plus_setup_logic.js");

const GOOD_TILE = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=abc123";

test("tile URL: accepts a keyed CARTO URL", () => {
    assert.deepEqual(L.validateTileUrl(GOOD_TILE), []);
});

test("tile URL: accepts {s} and {r} subdomain/retina forms", () => {
    assert.deepEqual(L.validateTileUrl("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?api_key=k"), []);
});

test("tile URL: rejects empty, scheme-only and host-less values (prefix-only checks pass these)", () => {
    for (const bad of ["", "   ", "https://", "http://", "https:///{z}/{x}/{y}", "ftp://a.b/{z}/{x}/{y}", "basemaps.cartocdn.com/{z}/{x}/{y}.png"]) {
        assert.notDeepEqual(L.validateTileUrl(bad), [], JSON.stringify(bad));
    }
});

test("tile URL: each of {z} {x} {y} is required", () => {
    for (const p of ["{z}", "{x}", "{y}"]) {
        const u = GOOD_TILE.replace(p, "0");
        const errs = L.validateTileUrl(u);
        assert.ok(errs.some((e) => e.includes(p)), p);
    }
});

test("tile URL: rejects whitespace, quotes, angle brackets and $ (Splunk token syntax)", () => {
    for (const c of [" ", '"', "'", "<", ">", "$", "\\"]) {
        assert.notDeepEqual(L.validateTileUrl(GOOD_TILE + c + "x"), [], JSON.stringify(c));
    }
});

test("tile URL: warns on CARTO without a key and on http, but still validates", () => {
    const nokey = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
    assert.deepEqual(L.validateTileUrl(nokey), []);
    assert.equal(L.tileUrlWarnings(nokey).length, 1);
    assert.deepEqual(L.tileUrlWarnings(GOOD_TILE), []);
    assert.equal(L.tileUrlWarnings("http://tiles.example.com/{z}/{x}/{y}.png").length, 1);
});

test("google key: needs the AIza + 35 char shape", () => {
    const ok = "AIza" + "a".repeat(35);
    assert.deepEqual(L.validateApiKey("google", ok), []);
    for (const bad of ["", "AIza", "AIza" + "a".repeat(34), "AIza" + "a".repeat(36), "BIza" + "a".repeat(35), ok + " ", "AIza" + "a".repeat(34) + "!"]) {
        if (bad === ok + " ") continue; // surrounding whitespace is trimmed, not an error
        assert.notDeepEqual(L.validateApiKey("google", bad), [], JSON.stringify(bad));
    }
    assert.deepEqual(L.validateApiKey("google", ok + " "), []);
});

test("bing key: 20-128 url-safe chars", () => {
    assert.deepEqual(L.validateApiKey("bing", "A".repeat(64)), []);
    for (const bad of ["", "short", "A".repeat(19), "A".repeat(129), "has space in the middle of it......"]) {
        assert.notDeepEqual(L.validateApiKey("bing", bad), [], JSON.stringify(bad));
    }
});

test("validation messages never echo the key value", () => {
    const secret = "AIza-NOT-A-REAL-KEY-but-secret-looking";
    const msgs = L.validateApiKey("google", secret).concat(L.validateApiKey("bing", "bad key!"));
    for (const m of msgs) assert.ok(!m.includes(secret) && !m.includes("bad key"));
});

test("defaults written for the tile URL target the maps-plus mapTileOverride option", () => {
    assert.deepEqual(L.defaultStanzaForTile(GOOD_TILE), {
        "display.visualizations.custom.leaflet_maps_app.maps-plus.mapTileOverride": GOOD_TILE
    });
});

test("defaults for Bing point the User/Realm options at the saved password", () => {
    assert.deepEqual(L.defaultStanzaForSecret("bing", true), {
        "display.visualizations.custom.leaflet_maps_app.maps-plus.bingMapsApiKeyUser": "bing_maps_api_key",
        "display.visualizations.custom.leaflet_maps_app.maps-plus.bingMapsApiKeyRealm": "leaflet_maps_app"
    });
    const cleared = L.defaultStanzaForSecret("bing", false);
    assert.deepEqual(Object.values(cleared), ["", ""]);
});

test("one Google key feeds Places search and Street View", () => {
    const d = L.defaultStanzaForSecret("google", true);
    assert.equal(d["display.visualizations.custom.leaflet_maps_app.maps-plus.googlePlacesApiKeyUser"], "google_maps_api_key");
    assert.equal(d["display.visualizations.custom.leaflet_maps_app.google-street-view.googleMapsApiKeyUser"], "google_maps_api_key");
    assert.equal(Object.keys(d).length, 4);
});

test("password key uses realm:name: with the trailing colon, matching getStoredApiKey's URL", () => {
    assert.equal(L.passwordKey("bing"), "leaflet_maps_app:bing_maps_api_key:");
    assert.equal(L.passwordKey("google"), "leaflet_maps_app:google_maps_api_key:");
});

test("tile URL: a host that is only a placeholder is still rejected", () => {
    assert.notDeepEqual(L.validateTileUrl("https://{s}/{z}/{x}/{y}.png"), []);
    assert.notDeepEqual(L.validateTileUrl("https://{s}.{z}/{x}/{y}.png"), []);
});

test("macro definition: eval of the URL as a string literal; empty gives an empty column", () => {
    assert.equal(L.macroDefinition(GOOD_TILE), 'eval mapTileOverride="' + GOOD_TILE + '"');
    assert.equal(L.macroDefinition(""), 'eval mapTileOverride=""');
    assert.equal(L.macroDefinition(), 'eval mapTileOverride=""');
});

test("anything that could break out of the macro's eval string is rejected by validation", () => {
    for (const evil of ['"; | delete', "`other_macro`", "$x$", "\\", "'"]) {
        assert.notDeepEqual(L.validateTileUrl(GOOD_TILE + evil), [], evil);
    }
    // every URL that validates yields a definition with exactly two quotes and no backtick or $
    for (const ok of [GOOD_TILE, "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?api_key=k&x=1|2"]) {
        assert.deepEqual(L.validateTileUrl(ok), []);
        const d = L.macroDefinition(ok);
        assert.equal((d.match(/"/g) || []).length, 2);
        assert.ok(!/[`$]/.test(d));
    }
});
