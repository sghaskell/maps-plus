'use strict';

// Debug overlay for diagnosing Maps+ inside Dashboard Studio.
//
// Studio runs custom visualizations in a sandboxed, opaque-origin iframe whose console is
// hard to reach from automation. This overlay draws errors, warnings and a small amount of
// state straight onto the panel so it can be read from a screenshot.
//
// Only included in debug builds: `npm run build:debug` (webpack --env debug). In a normal
// build `__MP_DEBUG__` is false, the require() in maps-plus.js is dead code and webpack
// leaves this module out of the bundle entirely.

var MAX_ENTRIES = 40;
var COLORS = { error: '#ff8a80', throw: '#ff8a80', rejection: '#ff8a80', warn: '#ffe082', info: '#b3e5fc', state: '#c5e1a5', trace: '#bdbdbd' };

var box = null;
var list = null;
var seen = {};          // message text -> { el, count }
var lastState = {};     // per-viz-instance key -> last state string
var fullLog = [];       // every entry, uncapped (bounded below), for the postMessage dump
var MAX_LOG = 2000;

function ensureBox() {
  if (box || typeof document === 'undefined' || !document.body) { return box; }
  box = document.createElement('div');
  var s = box.style;
  s.position = 'fixed'; s.left = '4px'; s.bottom = '4px'; s.zIndex = '2147483647';
  s.maxWidth = '70%'; s.maxHeight = '45%'; s.overflow = 'auto';
  s.background = 'rgba(20,20,20,0.88)'; s.color = '#fff';
  s.font = '11px/1.35 Consolas, Menlo, monospace'; s.padding = '4px 6px'; s.borderRadius = '4px';
  s.whiteSpace = 'pre-wrap'; s.wordBreak = 'break-word'; s.pointerEvents = 'auto';

  var title = document.createElement('div');
  title.textContent = 'Maps+ debug (click to collapse)';
  title.style.fontWeight = 'bold'; title.style.cursor = 'pointer';
  title.addEventListener('click', function () {
    list.style.display = list.style.display === 'none' ? '' : 'none';
  });
  list = document.createElement('div');
  box.appendChild(title);
  box.appendChild(list);
  document.body.appendChild(box);
  return box;
}

function show(kind, message, detail) {
  try {
    var text = '[' + kind + '] ' + String(message) + (detail ? '\n  ' + String(detail).split('\n').slice(0, 6).join('\n  ') : '');
    fullLog.push(new Date().toISOString().slice(11, 23) + ' ' + text);
    if (fullLog.length > MAX_LOG) { fullLog.splice(0, fullLog.length - MAX_LOG); }
    if (!ensureBox()) { return; }
    if (seen[text]) {                       // collapse repeats (e.g. per-row warnings)
      seen[text].count += 1;
      seen[text].el.firstChild.textContent = '×' + seen[text].count + ' ';
      return;
    }
    var el = document.createElement('div');
    el.style.color = COLORS[kind] || '#fff';
    el.style.borderTop = '1px solid rgba(255,255,255,0.15)';
    var counter = document.createElement('span');
    counter.textContent = '';
    el.appendChild(counter);
    el.appendChild(document.createTextNode(new Date().toISOString().slice(11, 23) + ' ' + text));
    list.appendChild(el);
    seen[text] = { el: el, count: 1 };
    while (list.childNodes.length > MAX_ENTRIES) {
      var first = list.firstChild;
      _forget(first);
      list.removeChild(first);
    }
    box.scrollTop = box.scrollHeight;
  } catch (e) { /* never let the overlay break the viz */ }
}

function _forget(el) {
  for (var k in seen) { if (seen[k].el === el) { delete seen[k]; } }
}

function argsToString(args) {
  return Array.prototype.map.call(args, function (a) {
    if (a instanceof Error) { return a.message; }
    if (typeof a === 'object') { try { return JSON.stringify(a).slice(0, 300); } catch (e) { return String(a); } }
    return String(a);
  }).join(' ');
}

// Summarise the layer control so MP-04 / MP-14 can be diagnosed:
// entry count, names, Leaflet stamp ids (same object or not) and whether each is on the map.
function controlState(viz) {
  var L = (typeof window !== 'undefined') ? window.L : undefined;
  var c = viz && viz.control;
  if (!c || !c._layers) { return null; }
  return 'control entries=' + c._layers.length + ' ' + c._layers.map(function (e) {
    var id = (e.layer && e.layer._leaflet_id) || (L && L.stamp ? L.stamp(e.layer) : '?');
    var on = viz.map && viz.map.hasLayer ? (viz.map.hasLayer(e.layer) ? 'on' : 'off') : '?';
    var name = String(e.name || '').replace(/<[^>]*>/g, '').trim().slice(0, 40);
    return '{' + name + ' #' + id + ' ' + on + '}';
  }).join(' ');
}

function cycleState(viz) {
  return 'cycle offset=' + viz.offset + ' cycleComplete=' + viz._cycleComplete +
    ' markersCleared=' + viz._markersCleared + ' expectReset=' + viz._expectingOffsetResetReplacement +
    ' allDone=' + viz.allDataProcessed + ' skipFetch=' + viz._skipNextDataFetch;
}

function reportState(viz, where) {
  var key = (viz && viz.cid) || 'viz';
  var parts = [cycleState(viz), controlState(viz)].filter(Boolean).join('\n  ');
  if (lastState[key] === parts) { return; }
  lastState[key] = parts;
  show('state', where, parts);
}

function reportEnvironment() {
  var splunkjsType = (typeof splunkjs === 'undefined') ? 'undefined' : typeof splunkjs; // eslint-disable-line no-undef
  show('info', 'debug overlay active', 'origin=' + location.origin + ' href=' + location.href.slice(0, 60) +
    ' splunkjs=' + splunkjsType + ' sandboxed=' + (location.origin === 'null'));
  // Font checks (MP-01). document.fonts.check() is false for any font not yet used, so
  // force a load of each probe and then report every FontFace's status
  // ("loaded" = usable, "error" = fetch blocked/failed, "unloaded" = never requested).
  setTimeout(function () {
    if (!document.fonts || !document.fonts.load) { return; }
    var probes = ['900 16px "Font Awesome 7 Free"', '400 16px "Font Awesome 7 Free"',
                  '400 16px "Font Awesome 7 Brands"', '16px "Ionicons"', '16px "Glyphicons Halflings"'];
    Promise.all(probes.map(function (p) {
      return document.fonts.load(p).then(function (faces) { return p + ' -> loaded ' + faces.length; },
                                         function (e) { return p + ' -> ' + (e && e.name || 'error'); });
    })).then(function (lines) {
      var statuses = [];
      document.fonts.forEach(function (f) {
        if (/awesome|ionicons|glyphicons/i.test(f.family)) {
          statuses.push(f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status);
        }
      });
      show('info', 'fonts', lines.concat(statuses).join('\n'));
    });
  }, 3000);
}

// Let the parent page read the full log: the sandboxed frame can't be inspected directly.
// Parent: iframe.contentWindow.postMessage({mapsPlusDebugDump: true}, '*') and listen for
// a reply {mapsPlusDebugLog: '...'}.
function listenForDump() {
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.mapsPlusDebugDump !== true || !e.source) { return; }
    try {
      e.source.postMessage({ mapsPlusDebugLog: fullLog.join('\n'), href: String(location.href).slice(0, 80) }, '*');
    } catch (err) { /* ignore */ }
  });
}

// MP-08 diagnosis: what config does the host pass, before Maps+ merges defaults into it?
var BASEMAP_KEYS = ['mapTile', 'mapTileOverride', 'useOpenFreeMap', 'maplibreStylePreset', 'maplibreStyleOverride', 'bingMaps', 'antarcticProj'];
function reportConfig(viz, where, args) {
  try {
    var cfgs = where === 'updateView' ? [['config', args[1]]] : [['changes', args[0]], ['previous', args[1]]];
    var key = (viz && viz.cid) || 'viz';
    var parts = cfgs.map(function (pair) {
      var cfg = pair[1] || {};
      var keys = Object.keys(cfg);
      var bm = BASEMAP_KEYS.map(function (k) {
        var full = keys.filter(function (x) { return x.slice(-k.length - 1) === '.' + k; })[0];
        return full ? k + '=' + JSON.stringify(String(cfg[full])).slice(0, 60) : null;
      }).filter(Boolean).join(' ');
      return pair[0] + ': ' + keys.length + ' keys; ' + (bm || 'no basemap keys');
    }).join(' | ');
    if (lastState[key + where] === parts) { return; }
    lastState[key + where] = parts;
    show('state', where + ' input', parts);
  } catch (e) { /* ignore */ }
}
function reportBasemap(viz) {
  try {
    var t = viz.tileLayer;
    var kind = !t ? 'none' : (t.setUrl ? 'raster ' + String(t._url || '').slice(0, 60) : 'maplibre');
    var s = 'basemapIsOfm=' + viz._basemapIsOfm + ' layer=' + kind;
    var key = ((viz && viz.cid) || 'viz') + 'bm';
    if (lastState[key] === s) { return; }
    lastState[key] = s;
    show('state', 'basemap', s);
  } catch (e) { /* ignore */ }
}

function wrapMethods(Viz) {
  ['formatData', 'updateView', 'setupView', 'onConfigChange', 'reflow', 'drilldown'].forEach(function (name) {
    var fn = Viz.prototype[name];
    if (typeof fn !== 'function') { return; }
    Viz.prototype[name] = function () {
      if (name === 'updateView' || name === 'onConfigChange') { reportConfig(this, name, arguments); }
      try {
        var out = fn.apply(this, arguments);
        if (name === 'updateView') { reportBasemap(this); }
        if (name === 'formatData' || name === 'updateView') { reportState(this, 'after ' + name); }
        if (name === 'drilldown') { show('trace', 'drilldown', argsToString([arguments[0]])); }
        return out;
      } catch (err) {
        show('throw', 'in ' + name + ': ' + (err && err.message), err && err.stack);
        throw err;
      }
    };
  });
}

function install(Viz) {
  if (typeof window === 'undefined') { return Viz; }
  window.addEventListener('error', function (e) {
    show('error', e.message, (e.error && e.error.stack) || (e.filename + ':' + e.lineno));
  });
  window.addEventListener('unhandledrejection', function (e) {
    show('rejection', e.reason && e.reason.message ? e.reason.message : String(e.reason), e.reason && e.reason.stack);
  });
  ['error', 'warn'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      show(level, argsToString(arguments));
      return orig && orig.apply(console, arguments);
    };
  });
  // Ad-hoc tracing hook for investigations: window.__mpTrace('msg')
  window.__mpTrace = function () { show('trace', argsToString(arguments)); };
  listenForDump();
  wrapMethods(Viz);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportEnvironment);
  } else {
    reportEnvironment();
  }
  return Viz;
}

module.exports = { install: install, _show: show, _controlState: controlState };
