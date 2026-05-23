# Maps+ for Splunk — Release Notes v4.6.8

## Bug Fixes

### Fixed: Map panel stuck on infinite loading after rapid filter change

Reported by Ambulance Australia.

When a user changed or cleared a dashboard filter while the map panel was still rendering its previous result set, the panel could stop showing markers and keep its loading spinner visible indefinitely. The map only recovered when the user clicked the panel's Refresh button. This was particularly disruptive for unattended TV/dashboard displays and for non-Splunk users who don't know to use the per-panel Refresh button.

The map now detects this rapid-filter-change race and resumes rendering automatically when the new search finishes — no manual refresh required. Most reliably observed on dashboards with multiple cascading filters where the user can change a second filter while the first one's results are still streaming in.

## Upgrade Notes

- Drop-in upgrade — no dashboard changes, SPL field changes, or formatter option changes are required.
- Recommended for any dashboard with multi-filter forms, especially TV/wall display deployments.
