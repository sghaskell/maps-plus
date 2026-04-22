# Maps+ for Splunk — Release Notes v4.6.3

## Bug Fixes

**Fixed: Per-row marker colors ignored when using layer groups**

When markers were assigned to a layer group via the `layerGroup` field, all markers in that group rendered with the color of the first row — ignoring per-row `markerColor`, `iconColor`, and `icon` values set on subsequent rows. This affected `png`, `svg`, `icon`, and `custom` marker types.

The root cause was an icon caching optimization (introduced in v4.1.1) that stored the first-built marker icon for each layer group and reused it for every subsequent row. That cache has been removed entirely. Each row now builds a fresh icon, so per-row marker styling works correctly regardless of whether `layerGroup` is set.

## Upgrade Notes

- Drop-in upgrade — no dashboard changes, no SPL field changes, no formatter option changes.
- If you are upgrading from v4.5.x, see the [v4.6.0 release notes](release-notes-4.6.0.md) for the full feature changelog.
