# Maps+ for Splunk — Release Notes v4.6.6

## Bug Fixes

### Fixed: Duplicate or stale markers after transforming searches finish

Maps+ could show duplicate pins, or keep a small number of stale pins, on dashboards whose SPL uses transforming commands such as `stats`. The completed Splunk search results were correct, but the map could continue showing markers created from an earlier preview result set while the search was still running.

This release updates Maps+ to redraw from Splunk's completed result set when the search finishes. Preview results can still appear while a search is running, but the final map state now matches the final SPL output.

## Upgrade Notes

- Drop-in upgrade — no dashboard changes, SPL field changes, or formatter option changes are required.
- Recommended for dashboards that use transforming searches and display clustered markers.
