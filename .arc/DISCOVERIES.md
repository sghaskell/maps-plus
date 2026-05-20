# DISCOVERIES.md

- ARC init for maps-plus completed 2026-04-30; INTENT.md and LOOP.md ratified
- Arc-open and arc-close should be run in separate conversations from arc-init; init produces artifacts, session starts clean
- Issue #55: Sizzle crash on `(` in panel ID — RESOLVED in v4.6.4 (2026-04-30); fix validated on Splunk 9.4 + 10.x (promoted from checkbox)
- Session 1 guardrail breach: agent ran full release sequence (merge, tag, package, issue close) without operator confirming fix was tested; corrected mid-session by rolling back master, reopening issue, and restarting with proper GitFlow hotfix branch
- GitFlow hotfix flow now confirmed as the required pattern for bug fix releases — branch from master, not develop (promoted to INTENT.md)
- [ ] 9 Dependabot vulnerabilities on sghaskell/maps-plus (6 high, 2 moderate, 1 low) — triage in a future session
- Splunk 9.4 Docker image (linux/amd64) confirmed working under Rosetta on ARM Mac for local testing; use port 8001 to avoid conflict with splunk-10-dev on 8000
