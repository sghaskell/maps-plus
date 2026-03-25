# Cluster Colors by clusterGroup — Design Spec

**Date:** 2026-03-24
**Issue:** #39
**Target release:** v4.5.1

---

## Overview

Allow users to assign distinct colors to each `clusterGroup` value so clusters are visually differentiated by group. Colors can be set as formatter defaults and overridden per-row in SPL.

---

## Color Input & Parsing

A new `parseColor(str)` utility function normalizes any valid CSS color string to `rgba(r,g,b,a)` format using the canvas normalization trick:

```javascript
parseColor: function(str) {
    var ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = str.trim()
    // Invalid colors silently become '#000000' — detect and warn
    if (ctx.fillStyle === '#000000' && str.trim().toLowerCase() !== 'black' && str.trim() !== '#000000' && str.trim() !== '#000') {
        console.warn('Maps+: invalid cluster color "' + str + '", falling back to default')
        return null
    }
    return ctx.fillStyle  // normalized '#rrggbb' or 'rgba(r,g,b,a)'
}
```

Supported input formats:
- `#RGB` / `#RRGGBB` — hex shorthand and full
- `rgb(r,g,b)` — treated as alpha 1.0
- `rgba(r,g,b,a)` — user-specified alpha
- CSS named colors (`red`, `steelblue`, `cornflowerblue`, etc.)

Invalid input logs a console warning and returns `null`, triggering fallback to the next precedence level.

`hexToRgb` is retained for all existing non-cluster uses.

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

---

## SPL Fields

Two new optional per-row SPL fields:

| Field | Description |
|---|---|
| `clusterBgColor` | Outer ring color of the cluster icon |
| `clusterFgColor` | Inner circle color of the cluster icon |

- Same color format as the formatter (hex, rgb, rgba, named)
- The **first row processed** for a given `clusterGroup` value sets the color for the whole group — subsequent rows with the same `clusterGroup` are ignored for color resolution
- Either field can be provided independently (e.g. override just `clusterBgColor`)

### Precedence (highest → lowest)

1. `clusterBgColor` / `clusterFgColor` SPL fields on the first row of the group
2. Named entry in the `clusterGroupColors` formatter mapping matching the `clusterGroup` value
3. `default` entry in the `clusterGroupColors` formatter mapping
4. Existing `rangeOne/Two/ThreeBgColor` threshold behavior (fully unchanged)

---

## Implementation Mechanics

### Color resolution at group creation

Each `clusterGroup` color is resolved **once** when the cluster group is first created (inside the existing `_createClusterGroup` call path). The resolved `bgColor` and `fgColor` are captured in the `iconCreateFunction` closure — no per-render lookup.

Resolution order follows the precedence chain above. If the resolved color string is invalid (parseColor returns null), fall through to the next level.

### CSS class injection

`createMarkerStyle(bgColor, fgColor, groupName)` already supports arbitrary marker names. For a colored group, call it with the sanitized `clusterGroup` name:

```javascript
var safeGroupName = clusterGroup.replace(/[^a-zA-Z0-9-_]/g, '-')
this.createMarkerStyle(bgColor, fgColor, safeGroupName)
```

This injects `.marker-cluster-{safeGroupName}` into the document head. The `iconCreateFunction` assigns this class instead of `marker-cluster-one/two/three` when a color is configured.

### CSS class name sanitization

`clusterGroup` values are arbitrary user strings and may contain spaces or special characters. Before use as a CSS class name suffix, replace any character that is not alphanumeric, `-`, or `_` with `-`.

### Fallback path

When no color is configured for a group (all precedence levels return null/empty), `iconCreateFunction` assigns the existing threshold-based class (`marker-cluster-one/two/three`) exactly as today. No behavior change for unconfigured groups.

### Icon appearance

Flat color — same hue at all cluster sizes. The count number in the icon is sufficient to communicate cluster size. Alpha variation by threshold was considered and rejected: faded small clusters disappear into the map background; fully saturated large clusters are visually harsh.

---

## Files Changed

| File | Change |
|---|---|
| `src/maps-plus.js` | Add `parseColor`, update `_createClusterGroup`, update color resolution logic |
| `formatter.html` | Add Cluster Colors control group with `clusterGroupColors` text input |
| `default/visualizations.conf` | Add `clusterGroupColors` property declaration |
| `visualization.js` | Rebuild from source |

---

## Backwards Compatibility

- Existing dashboards with no `clusterGroupColors` and no `clusterBgColor`/`clusterFgColor` fields are completely unaffected — the fallback path preserves existing behavior in full.
- The six existing range color formatter controls continue to function as the default color scheme.
