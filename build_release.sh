#!/bin/bash
# Build and package Maps+ for Splunk.
#
# Run this on a release branch. It will:
#   1. Build visualization.js and CSS assets
#   2. Commit the build artifacts to the current branch if they changed
#   3. Package the app as a tarball for Splunkbase upload
#
# Output: leaflet_maps_app_<version>.tar.gz
# Upload via: Splunk UI → Apps → Manage Apps → Install app from file
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./appserver/static/visualizations/maps-plus/package.json').version")
OUTPUT="leaflet_maps_app_${VERSION}.tar.gz"

# Build
echo "Building Maps+ v${VERSION}..."
cd appserver/static/visualizations/maps-plus
npm run build
cd "$SCRIPT_DIR"

# Stage build artifacts (ignore errors for files that may not exist yet)
git add \
    appserver/static/visualizations/maps-plus/visualization.js \
    appserver/static/visualizations/maps-plus/visualization.js.LICENSE.txt \
    appserver/static/visualizations/maps-plus/contrib/css/maplibre-gl.css \
    appserver/static/visualizations/maps-plus/contrib/css/leaflet-geoman.css \
    2>/dev/null || true

# Commit if anything changed
if ! git diff --cached --quiet; then
    echo "Committing build artifacts..."
    git commit -m "chore: build artifacts for v${VERSION} release"
else
    echo "Build artifacts unchanged — no commit needed."
fi

# Package from HEAD (includes the build commit if one was made)
echo "Packaging..."
git archive --format=tar.gz --prefix=leaflet_maps_app/ --output="${OUTPUT}" HEAD

echo ""
echo "Created: ${OUTPUT}"
echo "Upload via: Splunk UI → Apps → Manage Apps → Install app from file"
