/*
 * Pure logic for the Maps+ Setup page (no DOM, no Splunk SDK), so it can be
 * unit-tested with plain Node:  node --test test/setup/*.test.js
 *
 * UMD: works as an AMD module under Splunk's RequireJS, as CommonJS under
 * Node, and as a browser global (window.MapsPlusSetupLogic) as a last resort.
 */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.MapsPlusSetupLogic = factory();
    }
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    var APP = "leaflet_maps_app";
    var MAPS_PLUS = "display.visualizations.custom.leaflet_maps_app.maps-plus.";
    var STREET_VIEW = "display.visualizations.custom.leaflet_maps_app.google-street-view.";

    // Non-secret settings (the CARTO keyed tile URL) are mirrored into this
    // custom conf so Dashboard Studio dashboards can read it with `| rest`.
    // Search macro that adds the saved tile URL to results as a mapTileOverride column.
    // This is how Dashboard Studio panels (which cannot read saved settings) get it:
    // add | `mapsplus_basemap` to the panel's search. Shipped in default/macros.conf.
    var MACRO_NAME = "mapsplus_basemap";

    var SETTINGS_CONF_FILE = "maps_plus_settings";
    var SETTINGS_STANZA = "basemap";

    // Secrets live in storage/passwords under one realm; the name identifies
    // the service. getStoredApiKey() in maps-plus.js reads "<realm>:<name>:".
    var PASSWORD_REALM = APP;
    var SECRETS = {
        bing: { name: "bing_maps_api_key", label: "Bing Maps" },
        google: { name: "google_maps_api_key", label: "Google" }
    };

    // ---- validation ----------------------------------------------------

    // A usable Leaflet tile URL: https (or http), a host with a dot, and all
    // of {z} {x} {y}. {s} and {r} are optional. No whitespace, quotes, angle
    // brackets or "$" (Splunk would treat $...$ as a token).
    function validateTileUrl(url) {
        var errors = [];
        url = (url || "").trim();
        if (!url) {
            errors.push("Tile URL is required.");
            return errors;
        }
        // {s} (subdomain) is allowed in the host; strip it before checking for a real host.
        if (!/^https?:\/\/[^\s\/{}]+\.[^\s\/{}]+/i.test(url.replace(/\{s\}/g, "a"))) {
            errors.push("Tile URL must start with https:// followed by a host name, e.g. https://basemaps.cartocdn.com/...");
        }
        if (/[\s"'`<>$\\]/.test(url)) {
            errors.push("Tile URL must not contain spaces, quotes, backticks, angle brackets, backslashes or \"$\".");
        }
        ["{z}", "{x}", "{y}"].forEach(function (p) {
            if (url.indexOf(p) === -1) {
                errors.push("Tile URL must contain " + p + " exactly as written; Maps+ fills it in.");
            }
        });
        return errors;
    }

    // Advisory only (does not block saving): a CARTO URL without a key shows
    // the "API KEY REQUIRED" watermark.
    function tileUrlWarnings(url) {
        var warnings = [];
        url = (url || "").trim();
        if (/cartocdn\.com/i.test(url) && !/[?&](key|api_key)=[^&\s]+/i.test(url)) {
            warnings.push("This is a CARTO URL with no ?key=... parameter. CARTO tiles show an \"API KEY REQUIRED\" watermark without a key.");
        }
        if (/^http:\/\//i.test(url)) {
            warnings.push("This URL uses http://. Browsers block http:// tiles on https:// Splunk pages (mixed content).");
        }
        return warnings;
    }

    function validateApiKey(kind, key) {
        var errors = [];
        key = (key || "").trim();
        if (!key) {
            errors.push(SECRETS[kind].label + " API key is required.");
            return errors;
        }
        if (kind === "google") {
            if (!/^AIza[0-9A-Za-z_\-]{35}$/.test(key)) {
                errors.push("Google API keys start with \"AIza\" and are 39 characters long. Check that you copied the whole key.");
            }
        } else if (kind === "bing") {
            if (!/^[0-9A-Za-z_\-]{20,128}$/.test(key)) {
                errors.push("Bing Maps keys are 20 to 128 letters, digits, \"-\" or \"_\", with no spaces. Check that you copied the whole key.");
            }
        }
        return errors;
    }

    // ---- what gets written where ------------------------------------------

    // properties/savedsearches/default keys for each section. Writing these to
    // the app's local/savedsearches.conf [default] is what makes *classic*
    // Maps+ panels pick the values up as display-option defaults.
    function defaultStanzaForTile(url) {
        var o = {};
        o[MAPS_PLUS + "mapTileOverride"] = url;
        return o;
    }

    // Macro definition for the Studio route. An empty URL gives an empty column, which
    // Maps+ ignores. The URL is validated first (no quotes, backticks, "$" or spaces), so
    // it is safe inside an eval string literal.
    function macroDefinition(url) {
        return 'eval mapTileOverride="' + (url || "") + '"';
    }

    function defaultStanzaForSecret(kind, enabled) {
        var user = enabled ? SECRETS[kind].name : "";
        var realm = enabled ? PASSWORD_REALM : "";
        var o = {};
        if (kind === "bing") {
            o[MAPS_PLUS + "bingMapsApiKeyUser"] = user;
            o[MAPS_PLUS + "bingMapsApiKeyRealm"] = realm;
        } else {
            // One Google key serves Places search and Street View.
            o[MAPS_PLUS + "googlePlacesApiKeyUser"] = user;
            o[MAPS_PLUS + "googlePlacesApiKeyRealm"] = realm;
            o[STREET_VIEW + "googleMapsApiKeyUser"] = user;
            o[STREET_VIEW + "googleMapsApiKeyRealm"] = realm;
        }
        return o;
    }

    // storage/passwords key format: "<realm>:<name>:" (trailing colon).
    function passwordKey(kind) {
        return PASSWORD_REALM + ":" + SECRETS[kind].name + ":";
    }

    return {
        APP: APP,
        MAPS_PLUS: MAPS_PLUS,
        STREET_VIEW: STREET_VIEW,
        MACRO_NAME: MACRO_NAME,
        macroDefinition: macroDefinition,
        SETTINGS_CONF_FILE: SETTINGS_CONF_FILE,
        SETTINGS_STANZA: SETTINGS_STANZA,
        PASSWORD_REALM: PASSWORD_REALM,
        SECRETS: SECRETS,
        validateTileUrl: validateTileUrl,
        tileUrlWarnings: tileUrlWarnings,
        validateApiKey: validateApiKey,
        defaultStanzaForTile: defaultStanzaForTile,
        defaultStanzaForSecret: defaultStanzaForSecret,
        passwordKey: passwordKey
    };
});
