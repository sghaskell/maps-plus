# Maps+ v4.5.1 — Splunkbase Release Notes

## What's New

### Cluster Colors by clusterGroup

Clusters can now be colored per `clusterGroup` value. Configure colors in **Format → Cluster Colors → Cluster Group Colors** using a comma-separated mapping:

```
servers:#E74C3C, routers:#3498DB, default:#95A5A6
```

The reserved key `default` acts as a catch-all for any `clusterGroup` value not explicitly listed.

All CSS color formats are accepted: hex (`#E74C3C`), `rgba()`, and named colors (`steelblue`, `crimson`). Hex and named colors automatically derive a subtle two-tone ring effect (0.6 opacity outer / 0.8 opacity inner). `rgba()` values use your alpha as-is.

Count labels on dark-colored clusters automatically switch to white for legibility.

For data-driven colors, add `clusterBgColor` and/or `clusterFgColor` columns to your search results — these override the formatter setting for that group at query time:

```spl
| eval clusterGroup="prod", clusterBgColor="#9B59B6", clusterFgColor="#6C3483"
```

**Color resolution order:** SPL fields → named formatter entry → `default` formatter key → existing threshold colors (unchanged).

Each `clusterGroup` now appears as its own named entry in the layer control, with a colored dot when a color is configured.

Dashboards without `clusterGroupColors` and without `clusterBgColor`/`clusterFgColor` fields are completely unaffected — existing threshold color behavior is preserved in full.

## Upgrade Notes

- No SPL field changes required for existing dashboards.
- The new **Cluster Group Colors** input appears in **Format → Cluster Colors**. It is empty by default.
