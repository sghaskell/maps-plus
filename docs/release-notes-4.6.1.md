# Maps+ v4.6.1 — Splunkbase Release Notes

## Security Updates

This is a patch release addressing dependency security updates. No features or behavior changes.

- **serialize-javascript** upgraded to 7.0.5, addressing CVE-2020-7660 (RegExp/Date serialization in the webpack build pipeline). This is a build-time dependency only and does not affect the shipped bundle or end-user behavior.
- **lodash** upgraded to 4.17.23 (precautionary patch update).

## Upgrade Notes

- Drop-in upgrade — no dashboard changes, no SPL field changes, no formatter option changes.
- If you are upgrading from v4.5.x, see the [v4.6.0 release notes](release-notes-4.6.0.md) for the full feature changelog.
