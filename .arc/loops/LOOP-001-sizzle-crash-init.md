# Session — Fix #55: Sizzle selector crash on parentheses in panel ID

## Date
2026-04-30

## Goal
Diagnose and fix the jQuery/Sizzle crash that occurs when a Splunk panel's ID
contains a literal `(` character, blocking the Format Visualization panel from
loading entirely (reported in Maps+ 4.6.3 on Splunk Enterprise 9.4.2).

## What we know
- The error is a Sizzle CSS selector parse failure triggered by a `(` in a
  dynamically generated panel ID
- The source uses jQuery attribute selectors built by string concatenation in
  at least two places (`_setFullScreenMode`, `_setDefaultHeight`) that use
  `parentEl` — a value read from a `data-cid` DOM attribute
- These are the most likely sites but have not been confirmed as the crash origin

## Hypothesis to validate
The `$("div[data-cid=" + options.parentEl + "]")` pattern is likely the trigger.
If `parentEl` contains `(`, Sizzle treats it as an invalid CSS selector.
A possible fix is escaping the value with `$.escapeSelector()` (jQuery 3+) or
`CSS.escape()` before use in the selector — but confirm the crash site first.
Refactoring the parent-traversal DOM walk may also be appropriate depending on
what the investigation reveals.

## Definition of done
- [ ] Root cause confirmed (crash site identified in source)
- [ ] Fix applied; operator validates fix in source on first principles OR
      confirms with reporter (wpierbattisti) that the Format panel loads
      without error in their environment
- [ ] Release new version to Splunkbase

## Out of scope
- Any other open issues
