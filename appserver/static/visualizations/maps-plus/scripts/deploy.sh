#!/bin/bash
# Builds a Splunk app package (leaflet_maps_app.tgz) at the repo root.
# Upload via Splunk UI: Apps > Manage Apps > Install app from file.
# This mirrors the real user install flow and avoids Docker volume issues.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
OUTPUT="$REPO_ROOT/leaflet_maps_app.tgz"

echo "Building app package..."

# Stage to a sibling dir — guaranteed to exist; avoids /tmp issues on Windows
STAGE=$(mktemp -d "$(dirname "$REPO_ROOT")/maps-plus-pkg.XXXXXX")
trap "rm -rf '$STAGE'" EXIT

mkdir "$STAGE/leaflet_maps_app"

# Copy only the directories Splunk actually uses
for dir in appserver default metadata lookups; do
  [ -d "$REPO_ROOT/$dir" ] && cp -r "$REPO_ROOT/$dir" "$STAGE/leaflet_maps_app/"
done

# Strip dev-only artifacts
find "$STAGE" -name "node_modules" -type d | xargs rm -rf 2>/dev/null || true
rm -rf \
  "$STAGE/leaflet_maps_app/appserver/static/visualizations/maps-plus/src" \
  "$STAGE/leaflet_maps_app/appserver/static/visualizations/maps-plus/scripts" \
  "$STAGE/leaflet_maps_app/appserver/static/visualizations/maps-plus/package.json" \
  "$STAGE/leaflet_maps_app/appserver/static/visualizations/maps-plus/package-lock.json" \
  "$STAGE/leaflet_maps_app/appserver/static/visualizations/maps-plus/webpack.config.js" \
  "$STAGE/leaflet_maps_app/appserver/static/visualizations/maps-plus/.babelrc" \
  "$STAGE/leaflet_maps_app/appserver/static/visualizations/google-street-view/src" \
  2>/dev/null || true

(cd "$STAGE" && tar -czf "$OUTPUT" leaflet_maps_app)

echo "Done: $OUTPUT"
echo "Upload via Splunk UI: Apps > Manage Apps > Install app from file"
