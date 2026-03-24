#!/bin/bash
# Build and package Maps+ for Splunk
# Output: leaflet_maps_app_<version>.tar.gz — upload via Splunk UI → Apps → Manage Apps → Install app from file
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./appserver/static/visualizations/maps-plus/package.json').version")
OUTPUT="leaflet_maps_app_${VERSION}.tar.gz"

echo "Building Maps+ v${VERSION}..."
cd appserver/static/visualizations/maps-plus
npm run build
cd "$SCRIPT_DIR"

echo "Packaging..."
git archive --format=tar.gz --prefix=leaflet_maps_app/ --output="${OUTPUT}" HEAD

echo ""
echo "Created: ${OUTPUT}"
echo "Upload via: Splunk UI → Apps → Manage Apps → Install app from file"
