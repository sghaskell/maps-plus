#!/bin/bash
# Builds a Splunk app package (leaflet_maps_app_<version>.tgz) at the repo root.
# Uses 'git archive' to respect .gitattributes export-ignore rules and avoid
# macOS resource fork (._) files that fail Splunk AppInspect.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
VERSION=$(grep '^version' "$REPO_ROOT/default/app.conf" | head -1 | sed 's/version = //')
OUTPUT="$REPO_ROOT/leaflet_maps_app_${VERSION}.tar.gz"

echo "Building app package v${VERSION}..."

cd "$REPO_ROOT"
git archive --format=tar.gz --prefix=leaflet_maps_app/ -o "$OUTPUT" HEAD

echo "Done: $OUTPUT"
echo "Upload via Splunk UI: Apps > Manage Apps > Install app from file"
