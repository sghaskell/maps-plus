# Maps+ for Splunk — Release Notes v4.6.4

## Bug Fixes

**Fixed: Format Visualization panel fails to open when Splunk panel ID contains parentheses**

On dashboards where a Splunk panel's element ID contains a `(` character, clicking the Format Visualization button for a Maps+ panel produced an error and the panel never opened. No map content was affected — only the formatter UI was broken.

The root cause was a jQuery selector that inserted the panel ID directly into an unquoted CSS attribute selector, for example `div[data-cid=foo(bar)]`. jQuery's Sizzle engine treats `(` as the start of a pseudo-class argument and throws a parse error. The fix quotes the attribute value so Sizzle treats the entire string as a literal: `div[data-cid='foo(bar)']`.

## Upgrade Notes

- Drop-in upgrade — no dashboard changes, no SPL field changes, no formatter option changes.
- Affects all versions of Maps+. If your panel IDs are plain alphanumeric strings this bug would not have been visible, but upgrading is still recommended.
