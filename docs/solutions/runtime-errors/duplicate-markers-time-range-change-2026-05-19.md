---
title: Duplicate markers after time-range change in Maps+
date: 2026-05-19
category: runtime-errors
module: maps-plus
problem_type: runtime_error
component: frontend_stimulus
symptoms:
  - "Pin count on the map exceeds the current search's row count (e.g. 10 pins for a 5-row result)"
  - Duplicates appear right after a fast time-range change, panel refresh, or other action that interrupts the prior search
  - Behavior is intermittent — depends on whether the cancelled search delivered its trailing zero-results "done" packet
  - Both layer groups and cluster groups can show stacked markers from two render cycles
  - Tooltips or drilldown context may refer to stale rows when duplicates are present
root_cause: async_timing
resolution_type: code_fix
severity: medium
related_components:
  - leaflet
  - splunk-custom-visualization-api
tags:
  - maps-plus
  - splunk-visualization
  - duplicate-markers
  - marker-cleanup
  - async-timing
  - time-range-change
  - leaflet
  - issue-59
---

# Duplicate markers after time-range change in Maps+

## Problem

When the dashboard time range changes quickly (or Splunk otherwise cancels an in-flight search), Maps+ can leave markers from the previous search on the map and draw the new search's markers on top, so pin counts look doubled — for example, 10 markers when the new result set only has 5 rows.

## What Didn't Work

- **Relying on the v4.6.2 `_cycleComplete` reset path alone.** That path only runs when `formatData` receives a zero-results packet with `data.meta.done === true` (lines 2114–2126), which sets `_cycleComplete` and clears layer groups in the `_cycleComplete` branch (lines 2149–2163). It treats end-of-cycle as a reliable signal. On cancellation Splunk often never delivers that packet, so `_cycleComplete` never fires, `_markersCleared` stays `true` from the prior cycle, and `updateView`'s clear-in-place block (lines 3026–3038) is skipped — which is the race that produces duplicates.

- **bliew-splunk's proposed patch** (reset `_markersCleared = false` at the end of every `updateView`). Correct direction for small single-chunk searches, but resets the flag **after every chunk**. For multi-chunk searches over 50,000 rows (chunk size = 50,000), chunk 2 would re-enter `updateView` with `_markersCleared === false`, run `clearLayers()` on all groups, and wipe chunk 1's markers before chunk 2's rows are drawn — reintroducing the stale-marker regression fixed for issue #10.

- **Resetting `_markersCleared` on every `formatData` call (un-gated).** Same regression as resetting at the end of every `updateView` — chunk N+1 would trigger another full clear and destroy chunk N's markers. Multi-chunk safety requires the reset to fire only at cycle boundaries, not within a cycle.

- **Headless reproduction of the original bug.** A Playwright script that drove Splunk Web through 30+ time-range changes (at both default and 800 ms settle windows) consistently rendered the correct 5 pins on both the unpatched and patched bundles. The race window is too narrow for controlled headless timing to hit reliably. Note that `removeOutsideVisibleBounds` (v4.5.0) makes `.leaflet-marker-pane > *` count visible markers only; use deterministic in-viewport coordinates, not random lat/lng, for any DOM-based assertion.

## Solution

Shipped in v4.6.5 (commit `fa2c7dd`). The fix adds a cycle-start fallback in `formatData` that resets `_markersCleared` when chunk 1 of a new cycle arrives (`this.offset === 0`) but the flag is still `true` because the prior cycle never completed cleanly:

```javascript
// Cycle-start fallback (issue #59): if this is chunk 1 of a new cycle
// (offset == 0) and _markersCleared is still true from the prior cycle,
// the previous cycle never emitted its zero-results "done" packet — this
// happens when Splunk cancels an in-flight search on a fast time-range
// change or panel refresh. Reset the flag so updateView's clear-in-place
// block runs exactly once for this cycle. Multi-chunk safety: chunk 2+
// enters formatData with offset > 0, so this no-ops mid-cycle and chunk
// N's markers are preserved when chunk N+1 arrives (issue #10 intact).
if (this.offset === 0 && this._markersCleared) {
    this._markersCleared = false
}
```

`updateView` (lines 3026–3038) still clears stale markers once per cycle when `isInitializedDom && layerFilter && !_markersCleared`, then sets `_markersCleared = true` after clearing.

## Why This Works (and where it doesn't)

Maps+ maintains a two-flag state machine across Splunk's chunked viz pipeline:

| Flag | Meaning |
|------|---------|
| `_markersCleared` | Layer groups were emptied for the current render cycle; gates the `updateView` clear-in-place block |
| `_cycleComplete` | Prior cycle's zero-results "done" packet arrived; triggers eager clear in `formatData` |

`this.offset` is Maps+'s internal pagination cursor: set to `0` only in (a) the init block at line 2816 (first `updateView` per page load) and (b) the `_cycleComplete` done-packet branch at line 2123. It is incremented at line 3593 (`this.offset += dataRows.length`) at the end of every `updateView` that processes rows.

**Where the fix works:**

- **Path A — clean cycle completion, then cancellation.** Prior cycle delivered its done packet → `_markersCleared` was set true and `this.offset` was reset to 0 (line 2123). Time range changes; new search's first `formatData` sees `offset === 0 && _markersCleared === true`, the gate fires, `updateView`'s clear block runs once. **Duplicates avoided.**
- **Path B — cancellation during chunk 1 of the prior cycle.** Prior cycle was cancelled before `updateView` ran (or before line 3593 incremented `offset`). `this.offset` is still 0; the new cycle's gate fires; clear block runs. **Duplicates avoided.**

**Where the fix does NOT fully cover the race:**

- **Path C — cancellation after the prior cycle rendered rows but before its done packet.** This is the reporter's scenario: a 5-row search completes `updateView` (so `this.offset = 5`), the user changes the time range before the done packet arrives, and Splunk cancels the search. On the new search's first `formatData`, `this.offset === 5` (not 0), so the gate at line 2174 does **not** fire and `_markersCleared` remains `true`. `updateView`'s clear block is skipped and the new markers stack on top of the old.

  The verification run for v4.6.5 used 800 ms settle windows that likely allowed each prior search to deliver its done packet before the next change — pushing every iteration into Path A and never exercising Path C. The intermittency the reporter observed corresponds to Path C, which the shipped fix does not address.

**A more complete fix** would also reset `this.offset` and `this._markersCleared` when a new search is initiated (e.g., via a Splunk SearchManager `search:start` event listener attached in `initialize`). The current fix narrows the race substantially but does not close it.

The deeper insight is still useful: **cycle start** (`this.offset === 0` after a done packet or init) is one observable signal, but it is not the same as **new-search start**. Splunk's custom-visualization API does not expose a "search cancelled" or "search start" event to the viz; the only built-in end-of-cycle signal is the trailing empty done packet, which Splunk does not guarantee on cancellation.

## Prevention

- **When a flag is reset by an end-of-cycle packet, add a start-of-cycle fallback — and verify what "start" means.** Splunk's zero-results `data.meta.done` packet at `formatData` line 2114 is best-effort on cancellation; `this.offset === 0` is only true at init and after a clean done packet, not at every new-search boundary. Document this asymmetry where the flag is read.
- **For complete cancellation safety, drive resets off a new-search event, not a chunk-position counter.** Splunk's SearchManager emits `search:start` (and related lifecycle events); subscribing in `initialize` and resetting `_markersCleared` / `this.offset` / `_cycleComplete` there is the structurally correct hook.
- **Statically enumerate all `(offset, _markersCleared, _cycleComplete)` triples** for any change that touches the render-cycle state machine. The v4.6.5 fix narrowed the race but the static analysis above shows Path C remains uncovered — enumerate before believing a fix is complete.
- **Don't trust headless timing tests to reproduce intermittent races.** A consistent 800 ms settle window made every iteration take the same code path; the reporter saw duplicates with irregular human timing. Verification by static analysis of state-machine paths is essential alongside (or instead of) browser-level tests.

## Related Issues

- [GitHub #59 — Duplicate pins are sometimes rendered](https://github.com/sghaskell/maps-plus/issues/59) (CLOSED, partial fix in v4.6.5; see "Where the fix does NOT fully cover the race" above)
- [GitHub #10 — Dynamic tooltip and panel refresh](https://github.com/sghaskell/maps-plus/issues/10) (CLOSED, fixed in v4.6.2 — predecessor that introduced `_markersCleared` and the clear-in-place block)
- [GitHub #53 — `markerColor` ignored without `layerGroup` or `icon`](https://github.com/sghaskell/maps-plus/issues/53) (CLOSED, fixed in v4.6.3 — same cleanup block, different symptom; removed `cachedIcon`)
- Fix commit: [`fa2c7dd`](https://github.com/sghaskell/maps-plus/commit/fa2c7dd) — v4.6.5 hotfix
- Release tag: [`v4.6.5`](https://github.com/sghaskell/maps-plus/releases/tag/v4.6.5)
- Internal design lineage: `docs/superpowers/specs/2026-03-26-stale-markers-on-refresh-design.md` (issue #10 architecture — still accurate, this fix extends rather than supersedes)
