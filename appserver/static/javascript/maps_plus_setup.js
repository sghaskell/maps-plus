"use strict";

/*
 * Maps+ Setup page: save basemap / API keys once for the whole app.
 *
 *   CARTO keyed tile URL (not a secret)
 *       -> local/savedsearches.conf [default] ...maps-plus.mapTileOverride
 *          (classic panels inherit it)
 *       -> local/maps_plus_settings.conf [basemap] mapTileOverride
 *          (so a Dashboard Studio dashboard can read it with | rest)
 *   Bing / Google keys (secrets)
 *       -> storage/passwords  realm=leaflet_maps_app  name=<service>_api_key
 *       -> [default] ...ApiKeyUser / ...ApiKeyRealm point at that entry
 *
 * Follows the splunk-setup-page-builder pattern: no setup.xml, secrets only in
 * storage/passwords, and every Save always writes (no "already configured"
 * early exit). Secret values are never logged or shown back.
 *
 * [default] in savedsearches.conf is NOT addressable through
 * configs/conf-savedsearches (404 / 409 on the "default" stanza), so it is
 * written through the properties endpoint instead.
 */

require([
    "jquery",
    "splunkjs/splunk",
    "../app/leaflet_maps_app/javascript/maps_plus_setup_logic"
], function ($, splunkjs, L) {
    var NS = { owner: "nobody", app: L.APP, sharing: "app" };
    var service = new splunkjs.Service(new splunkjs.SplunkWebHttp(), NS);

    var TILE_KEY = L.MAPS_PLUS + "mapTileOverride";

    // ---- SDK helpers (promise wrappers) ------------------------------------

    function sdkPost(path, params) {
        return new Promise(function (resolve, reject) {
            service.post(path, params, function (err, res) {
                if (err) reject(err); else resolve(res);
            });
        });
    }

    // params is a plain name (conf file / stanza) or a params object (passwords).
    function sdkCreate(collection, params) {
        return new Promise(function (resolve, reject) {
            collection.create(params, function (err, created) {
                if (err) reject(err); else resolve(created);
            });
        });
    }

    function sdkUpdate(entity, props) {
        return new Promise(function (resolve, reject) {
            entity.update(props, function (err, updated) {
                if (err) reject(err); else resolve(updated);
            });
        });
    }

    function sdkRemove(entity) {
        return new Promise(function (resolve, reject) {
            entity.remove(function (err) {
                if (err) reject(err); else resolve();
            });
        });
    }

    function fetchEntity(entity) {
        return new Promise(function (resolve, reject) {
            entity.fetch(function (err) {
                if (err) reject(err); else resolve(entity);
            });
        });
    }

    function splunkdBase() {
        var c = window.$C || {};
        return (c.MRSPARKLE_ROOT_PATH || "") + "/" + (c.LOCALE || "en-US") + "/splunkd/__raw";
    }

    // ---- writes ---------------------------------------------------------------

    // Write keys into the app's local savedsearches.conf [default] stanza.
    async function writeDefaultStanza(props) {
        var path = "properties/savedsearches/default";
        try {
            await sdkPost(path, props);
        } catch (e) {
            if (e && e.status === 404) {
                // Stanza not present yet in this app: create it, then retry.
                try { await sdkPost("properties/savedsearches", { __stanza: "default" }); }
                catch (e2) { if (!e2 || e2.status !== 409) throw e2; }
                await sdkPost(path, props);
            } else {
                throw e;
            }
        }
    }

    // Mirror the tile URL into maps_plus_settings.conf [basemap] (custom conf,
    // created on first save by the configurations endpoint).
    async function writeSettingsConf(props) {
        var configs = service.configurations(NS);
        await fetchEntity(configs);
        if (!configs.list().some(function (f) { return f.name === L.SETTINGS_CONF_FILE; })) {
            await sdkCreate(configs, L.SETTINGS_CONF_FILE);
            await fetchEntity(configs);
        }
        var file = configs.item(L.SETTINGS_CONF_FILE);
        await fetchEntity(file);
        if (!file.list().some(function (s) { return s.name === L.SETTINGS_STANZA; })) {
            await sdkCreate(file, L.SETTINGS_STANZA);
            await fetchEntity(file);
        }
        var stanza = file.item(L.SETTINGS_STANZA);
        await fetchEntity(stanza);
        await sdkUpdate(stanza, props);
    }

    // Update the mapsplus_basemap search macro (shipped in default/macros.conf, so it
    // normally exists; create it if an admin deleted it).
    async function writeMacro(url) {
        var def = { definition: L.macroDefinition(url) };
        try {
            await sdkPost("data/macros/" + L.MACRO_NAME, def);
        } catch (e) {
            if (e && e.status === 404) {
                await sdkPost("data/macros", { name: L.MACRO_NAME, definition: def.definition });
            } else {
                throw e;
            }
        }
    }

    async function saveSecret(kind, value) {
        var pw = service.storagePasswords(NS);
        await fetchEntity(pw);
        var existing = pw.item(L.passwordKey(kind));
        if (!existing) {
            await sdkCreate(pw, {
                name: L.SECRETS[kind].name,
                realm: L.PASSWORD_REALM,
                password: value
            });
        } else {
            await sdkUpdate(existing, { password: value });
        }
    }

    async function removeSecret(kind) {
        var pw = service.storagePasswords(NS);
        await fetchEntity(pw);
        var existing = pw.item(L.passwordKey(kind));
        if (existing) await sdkRemove(existing);
    }

    // Ask splunkd to re-read the app's conf files. Best effort: saved values are
    // already on disk, and a failed reload must not hide a successful save.
    async function reloadApp() {
        try { await sdkPost("apps/local/" + L.APP + "/_reload", {}); } catch (e) { /* ignore */ }
    }

    // ---- reads (current state shown on load) -------------------------------

    function readDefaultKey(key) {
        return $.ajax({
            url: splunkdBase() + "/servicesNS/nobody/" + L.APP + "/properties/savedsearches/default/" + encodeURIComponent(key),
            dataType: "text"
        }).then(function (t) { return (t || "").trim(); }, function () { return ""; });
    }

    async function secretIsSet(kind) {
        try {
            var pw = service.storagePasswords(NS);
            await fetchEntity(pw);
            return !!pw.item(L.passwordKey(kind));
        } catch (e) {
            return null; // cannot tell (no list_storage_passwords capability)
        }
    }

    async function refreshStatus() {
        var tile = await readDefaultKey(TILE_KEY);
        $("#tile_url_input").val(tile);
        $("#tile_status").text(tile ? "Saved." : "Not set.");
        var kinds = ["bing", "google"];
        for (var i = 0; i < kinds.length; i++) {
            var set = await secretIsSet(kinds[i]);
            var txt = set === null ? "Cannot check (needs the list_storage_passwords capability)."
                : set ? "A key is saved. It is never shown again; paste a new one to replace it." : "Not set.";
            $("#" + kinds[i] + "_status").text(txt);
        }
    }

    // ---- UI ---------------------------------------------------------------------

    function show(section, kind, messages) {
        var box = $("#" + section + "_msg").empty().removeClass("mp-ok mp-err mp-warn");
        if (!messages.length) { box.hide(); return; }
        box.addClass(kind).show();
        messages.forEach(function (m) { box.append($("<div>").text(m)); });
    }

    function describeError(stage, e) {
        // Never include request bodies (they may contain a key). Only the
        // server's own message text.
        var text = "Failed while: " + stage;
        try {
            var body = e && (e.data || (e.responseText && JSON.parse(e.responseText)));
            var msgs = body && body.messages ? body.messages.map(function (m) { return m.text; }).join("; ") : "";
            if (msgs) text += " (" + msgs + ")";
            else if (e && e.status) text += " (HTTP " + e.status + ")";
        } catch (_) { /* ignore */ }
        if (e && e.status === 403) text += " You need admin rights (edit_storage_passwords / app write access).";
        return text;
    }

    async function run(section, stage, fn) {
        show(section, "mp-ok", []);
        var current = stage;
        try {
            await fn(function (s) { current = s; });
            await reloadApp();
            return true;
        } catch (e) {
            show(section, "mp-err", [describeError(current, e)]);
            return false;
        }
    }

    $("#tile_save").on("click", async function () {
        var url = $("#tile_url_input").val().trim();
        var errs = L.validateTileUrl(url);
        if (errs.length) { show("tile", "mp-err", errs); return; }
        var ok = await run("tile", "writing savedsearches.conf [default]", async function (stage) {
            await writeDefaultStanza(L.defaultStanzaForTile(url));
            stage("writing " + L.SETTINGS_CONF_FILE + ".conf");
            var s = {}; s.mapTileOverride = url;
            await writeSettingsConf(s);
            stage("updating the " + L.MACRO_NAME + " search macro");
            await writeMacro(url);
        });
        if (ok) { show("tile", "mp-ok", ["Saved. Classic Maps+ panels that do not choose their own basemap use this tile URL when they load. For Dashboard Studio, add | `" + L.MACRO_NAME + "` to the map's search (see the note below)."].concat(L.tileUrlWarnings(url))); refreshStatus(); }
    });

    $("#tile_clear").on("click", async function () {
        var ok = await run("tile", "clearing the tile URL", async function (stage) {
            await writeDefaultStanza(L.defaultStanzaForTile(""));
            stage("clearing " + L.SETTINGS_CONF_FILE + ".conf");
            await writeSettingsConf({ mapTileOverride: "" });
            stage("clearing the " + L.MACRO_NAME + " search macro");
            await writeMacro("");
        });
        if (ok) { show("tile", "mp-ok", ["Cleared. Maps+ uses its normal default basemap again."]); refreshStatus(); }
    });

    ["bing", "google"].forEach(function (kind) {
        $("#" + kind + "_save").on("click", async function () {
            var val = $("#" + kind + "_key_input").val().trim();
            var errs = L.validateApiKey(kind, val);
            if (errs.length) { show(kind, "mp-err", errs); return; }
            var ok = await run(kind, "saving the key to storage/passwords", async function (stage) {
                await saveSecret(kind, val);
                stage("pointing the Maps+ defaults at the saved key");
                await writeDefaultStanza(L.defaultStanzaForSecret(kind, true));
            });
            $("#" + kind + "_key_input").val("");
            if (ok) { show(kind, "mp-ok", ["Saved. Panels that turn this service on now find the key without any per-panel setting."]); refreshStatus(); }
        });
        $("#" + kind + "_clear").on("click", async function () {
            var ok = await run(kind, "removing the saved key", async function (stage) {
                stage("clearing the Maps+ defaults");
                await writeDefaultStanza(L.defaultStanzaForSecret(kind, false));
                stage("removing the key from storage/passwords");
                await removeSecret(kind);
            });
            if (ok) { show(kind, "mp-ok", ["Removed."]); refreshStatus(); }
        });
    });

    refreshStatus();
});
