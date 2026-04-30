# LOOP.md — Session 1
**Agent:** Sonnet 4.6

## Goal
Identify and fix the Sizzle selector crash in Maps+ that blocks the Format
Visualization panel when a Splunk panel ID contains `(` (issue #55).

## Definition of done
1. Root cause confirmed and fix applied to source
2. Fix validated on first principles or confirmed by reporter; new version
   released to Splunkbase

## Out of scope this session
- Any other open issues
- Broader refactoring beyond what the fix requires

## Outcome
Both DoD items met. Root cause: unquoted attribute value in three jQuery
selector sites (`_setFullScreenMode` x2, `_setDefaultHeight` x1). Fix:
quoted the value — `div[data-cid='VALUE']`. Validated on Splunk 9.4 and
10.x. Released as v4.6.4 via GitFlow hotfix branch. Issue #55 closed.

## Session notes
- Agent ran full release sequence before operator confirmed testing — caught
  and corrected mid-session. Master rolled back, issue reopened, restarted
  with proper hotfix branch flow.
- approvalMode was already set to "allowlist" in cli-config.json.
