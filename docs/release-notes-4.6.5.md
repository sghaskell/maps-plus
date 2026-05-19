# Maps+ for Splunk — Release Notes v4.6.5

## Bug Fixes

**Fixed: Duplicate markers appearing intermittently after a time-range change**

On a fast time-range change (or any user action that interrupts an in-flight search before it finishes), Maps+ could leave markers from the previous render on the map and draw the new search's markers on top, producing duplicates — for example 10 pins instead of 5. The bug was intermittent and depended on whether the previous search completed cleanly before the next one started.

The fix ensures the map clears stale markers on every new search, regardless of whether the previous search was interrupted. Multi-chunk searches (over 50,000 rows) are unaffected — markers from earlier chunks continue to accumulate as expected during a single render.

## Upgrade Notes

- Drop-in upgrade — no dashboard changes, no SPL field changes, no formatter option changes.
- Affects v4.6.2 and later (the marker-clear flag introduced in v4.6.2 had a missing reset path that this release adds).
- Diagnosed by Ben Liew with a proposed patch direction (GitHub issue #59).
