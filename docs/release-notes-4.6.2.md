# Maps+ for Splunk — Release Notes v4.6.2

## Bug Fixes

**Fixed: Markers not refreshing on auto-refresh panels**

In Simple XML dashboards using a `<refresh>` interval, maps would appear to update but markers, tooltips, and popup values would stay frozen at the values from the initial page load. After multiple refresh cycles, duplicate markers could also appear on the map.

This release fixes the issue completely. Markers and tooltips now update correctly on every refresh cycle, and the marker count stays consistent with the underlying search results.

The fix also resolves a related JavaScript crash that would occur on the first auto-refresh when clustering was enabled, leaving the panel blank after the initial render.
