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

# Package from HEAD (includes the build commit if one was made).
#
# Phase 1: bin/ now contains the Python REST handler (tile proxy) and must
# ship in the release tarball. `git archive HEAD` includes every tracked
# file by default, so bin/tile_proxy.py and
# default/restmap.conf + default/settings.json flow through automatically.
# We stage the archive into a temp dir first so we can strip dev-only
# artifacts (tests/, run_tests.sh, .planning/) before re-tarring.
echo "Packaging..."

STAGE=$(mktemp -d "$(dirname "$SCRIPT_DIR")/maps-plus-release.XXXXXX")
trap "rm -rf '$STAGE'" EXIT

git archive --format=tar --prefix=leaflet_maps_app/ HEAD | tar -x -C "$STAGE"

# Strip dev-only artifacts from the release archive (T2-05 mitigation).
# bin/ is preserved (it's the REST handler). tests/, run_tests.sh, and
# .planning/ are repo-internal and must not ship to Splunkbase.
rm -rf "$STAGE/leaflet_maps_app/tests" 2>/dev/null || true
rm -f  "$STAGE/leaflet_maps_app/run_tests.sh" 2>/dev/null || true
rm -rf "$STAGE/leaflet_maps_app/.planning" 2>/dev/null || true
rm -rf "$STAGE/leaflet_maps_app/.claude" 2>/dev/null || true
rm -f  "$STAGE/leaflet_maps_app/CLAUDE.md" 2>/dev/null || true
# Clean __pycache__ and .pyc from bin/
find "$STAGE/leaflet_maps_app/bin" -name "__pycache__" -type d 2>/dev/null | xargs rm -rf 2>/dev/null || true
find "$STAGE/leaflet_maps_app/bin" -name "*.pyc" -type f 2>/dev/null | xargs rm -f 2>/dev/null || true

# Verify the Phase 1 artifacts made it into the stage before we tar.
if [ ! -f "$STAGE/leaflet_maps_app/bin/tile_proxy.py" ]; then
    echo "ERROR: bin/tile_proxy.py missing from release stage" >&2
    exit 1
fi
if [ ! -f "$STAGE/leaflet_maps_app/default/restmap.conf" ]; then
    echo "ERROR: default/restmap.conf missing from release stage" >&2
    exit 1
fi

# Strip macOS-specific metadata from the archive. On macOS 14+, every file has
# a com.apple.provenance xattr. bsdtar stores xattrs as PaxHeader entries
# (LIBARCHIVE.xattr.com.apple.provenance) which Splunk's `splunk install app`
# archive validator misreads as an extra top-level subdirectory, rejecting the
# archive with: "archive contains more than one immediate subdirectory". GNU
# tar on Linux tolerates these entries (emits "Ignoring unknown extended header
# keyword" warnings) but Splunk's validator does not.
#
# The four flags below are bsdtar-specific (no-ops on GNU tar, which doesn't
# write xattrs by default anyway):
#   --no-mac-metadata : skip ._ AppleDouble files
#   --no-xattrs       : skip xattrs (including com.apple.provenance)
#   --no-acls         : skip POSIX ACLs
#   --no-fflags       : skip BSD file flags
(cd "$STAGE" && tar --no-mac-metadata --no-xattrs --no-acls --no-fflags -czf "$SCRIPT_DIR/${OUTPUT}" leaflet_maps_app)

echo ""
echo "Created: ${OUTPUT}"
echo "Verify contents before upload (CLAUDE.md release checklist step 6):"
echo "  tar -tzf ${OUTPUT} | head -40"
echo "  tar -tzf ${OUTPUT} | grep -E 'bin/tile_proxy.py|default/restmap.conf|default/settings.json'"
echo "Upload via: Splunk UI → Apps → Manage Apps → Install app from file"
