# Cluster Colors by clusterGroup — Design Spec

**Date:** 2026-03-24
**Issue:** #39
**Target release:** v4.5.1

---

## Overview

Allow users to assign distinct colors to each `clusterGroup` value so clusters are visually differentiated by group. Colors can be set as formatter defaults and overridden per-row in SPL.

---

## Color Input & Parsing

A new `parseColor(str)` utility function normalizes any valid CSS color string to a CSS color string as returned by the browser's canvas engine (`#rrggbb` or `rgba(r,g,b,a)`). Invalid input is detected via a **sentinel approach** — robust against all valid representations of black:

```javascript
parseColor: function(str) {
    var ctx = document.createElement('canvas').getContext('2d')
    // Set a known sentinel first; invalid assignments leave fillStyle unchanged
    ctx.fillStyle = 'rgb(1,2,3)'
    var sentinel = ctx.fillStyle  // normalized sentinel
    ctx.fillStyle = str.trim()
    if (ctx.fillStyle === sentinel && str.trim() !== 'rgb(1,2,3)') {
        console.warn('Maps+: invalid cluster color "' + str + '", falling back to default')
        return null
    }
    return ctx.fillStyle  // normalized '#rrggbb' or 'rgba(r,g,b,a)'
}
```

Supported input formats:
- `#RGB` / `#RRGGBB` — hex shorthand and full
- `rgb(r,g,b)` — treated as alpha 1.0
- `rgba(r,g,b,a)` — user-specified alpha honored (see CSS injection below)
- CSS named colors (`red`, `steelblue`, `cornflowerblue`, `black`, etc.)

Invalid input logs a console warning and returns `null`, triggering fallback to the next precedence level.

`hexToRgb` is retained unchanged for all existing non-cluster uses.

---

## Formatter Config

A new **Cluster Colors** control group is added to `formatter.html` with a single text input bound to the property `clusterGroupColors`.

**Default value:** `""` (empty — no per-group colors, existing behavior unchanged)

**Format:** comma-separated `groupName:color` pairs:

```
servers:#E74C3C, routers:rgba(52,152,219,0.8), critical:red
```

- Whitespace around `,` and `:` is trimmed
- `default` is a reserved key — matches any `clusterGroup` not found in the map
- Parsed at render time into a lookup object: `{ servers: 'rgba(...)', routers: 'rgba(...)', default: 'rgba(...)' }`
- The existing six `rangeOne/Two/ThreeBgColor` / `rangeThreeBgColor` formatter controls are unchanged

### `visualizations.conf` entry

```ini
[maps-plus]
clusterGroupColors =
```

(Empty string default — no per-group colors applied unless configured.)

---

## SPL Fields

Two new optional per-row SPL fields:

| Field | Description |
|---|---|
| `clusterBgColor` | Outer ring color of the cluster icon |
| `clusterFgColor` | Inner circle color of the cluster icon |

- Same color format as the formatter (hex, rgb, rgba, named)
- Either field can be provided independently (e.g. override just `clusterBgColor`)

### Row ordering note

The color is resolved from the **first row encountered** for a given `clusterGroup` value during `updateView` processing. Splunk does not guarantee result row order. Users should ensure `clusterBgColor` and `clusterFgColor` are consistent across all rows sharing the same `clusterGroup` — inconsistent values will produce non-deterministic color assignment. This is consistent with how other per-row fields (e.g. `markerColor`) behave in Maps+.

### Precedence (highest → lowest)

1. `clusterBgColor` / `clusterFgColor` SPL fields on the first row of the group
2. Named entry in the `clusterGroupColors` formatter mapping matching the `clusterGroup` value
3. `default` entry in the `clusterGroupColors` formatter mapping
4. Existing `rangeOne/Two/ThreeBgColor` threshold behavior (fully unchanged)

---

## Implementation Mechanics

### Color resolution at group creation

Each `clusterGroup` color is resolved **once** when the cluster group is first created (inside the existing `_createClusterGroup` call path). The resolved `bgColor` and `fgColor` strings (already normalized by `parseColor`) are captured in the `iconCreateFunction` closure — no per-render lookup.

Resolution order follows the precedence chain above. If `parseColor` returns `null` at a given level, fall through to the next.

### CSS injection — new `createMarkerStyleFromColor`

The existing `createMarkerStyle(bgHex, fgHex, markerName)` calls `hexToRgb` internally and hardcodes `0.6` alpha. It is **not** used for per-group cluster colors — that would silently discard user-supplied alpha and fail on non-hex input.

Instead, a new function `createMarkerStyleFromColor(bgColor, fgColor, markerName)` is added:

```javascript
createMarkerStyleFromColor: function(bgColor, fgColor, markerName) {
    var html = '.marker-cluster-' + markerName + ' { background-color: ' + bgColor + ';} ' +
               '.marker-cluster-' + markerName + ' div { background-color: ' + fgColor + ';}'
    var cacheKey = '_markerStyle_' + markerName
    if (this[cacheKey]) {
        this[cacheKey].html(html)
    } else {
        this[cacheKey] = $('<style>').prop('type', 'text/css').html(html).appendTo('head')
    }
}
```

- Accepts pre-normalized color strings from `parseColor` (hex or rgba) and injects them verbatim into CSS
- User-supplied alpha is honored — no `0.6` override
- Uses the same idempotent update-or-create pattern as `createMarkerStyle`
- `createMarkerStyle` is unchanged and continues to be used for the existing threshold color system

### CSS class name sanitization

`clusterGroup` values are arbitrary user strings. Before use as a CSS class name suffix, replace any character that is not alphanumeric, `-`, or `_` with `-`:

```javascript
var safeGroupName = clusterGroup.replace(/[^a-zA-Z0-9-_]/g, '-')
```

**Reserved name collision:** If `safeGroupName` resolves to `one`, `two`, or `three` after sanitization, log a console warning — these names are used by the threshold color system and the injected style will conflict. The behavior is documented: the per-group color wins (since `createMarkerStyleFromColor` is called after the threshold styles are set up), but users should avoid these group names.

### `iconCreateFunction` behavior

When a color is configured for a group, `iconCreateFunction` assigns the group-specific class:

```javascript
return new L.DivIcon({
    html: '<div><span><b>' + childCount + '</span></div></b>',
    className: 'marker-cluster marker-cluster-' + safeGroupName,
    iconSize: new L.Point(40, 40)
})
```

When no color is configured (all precedence levels return null/empty), the existing threshold logic runs unchanged (`marker-cluster-one/two/three`).

### Fallback path

When no color is configured for a group (all precedence levels return null/empty), `iconCreateFunction` assigns the existing threshold-based class (`marker-cluster-one/two/three`) exactly as today. No behavior change for unconfigured groups.

### Icon appearance

Flat color — same hue at all cluster sizes. The count number in the icon is sufficient to communicate cluster size. Alpha variation by threshold was considered and rejected: faded small clusters disappear into the map background; fully saturated large clusters are visually harsh.

---

## Files Changed

| File | Change |
|---|---|
| `src/maps-plus.js` | Add `parseColor`, add `createMarkerStyleFromColor`, update `_createClusterGroup`, update color resolution logic |
| `formatter.html` | Add Cluster Colors control group with `clusterGroupColors` text input |
| `default/visualizations.conf` | Add `clusterGroupColors =` property declaration |
| `visualization.js` | Rebuild from source |

---

## Backwards Compatibility

- Existing dashboards with no `clusterGroupColors` and no `clusterBgColor`/`clusterFgColor` fields are completely unaffected — the fallback path preserves existing threshold behavior in full.
- The six existing range color formatter controls continue to function as the default color scheme.
- `createMarkerStyle` and `hexToRgb` are unchanged.
