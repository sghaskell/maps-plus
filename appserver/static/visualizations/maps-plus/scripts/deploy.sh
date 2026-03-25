#!/bin/bash
# Deploys the entire Maps+ Splunk app to a running Docker container.
# Stages app files to a temp dir then uses docker cp — avoids tar pipe path
# issues on Windows/Git Bash where tar -C can silently mis-package files.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

CONTAINER=$(docker ps --format '{{.ID}} {{.Image}}' | awk '/splunk\/splunk/{print $1; exit}')

if [ -z "$CONTAINER" ]; then
  echo "Error: No running Splunk container found. Is Docker Desktop running?"
  exit 1
fi

SPLUNK_APP_PATH="/opt/splunk/etc/apps/leaflet_maps_app"

echo "Deploying to container $CONTAINER..."

# Stage to a temp dir then docker cp — reliable on Windows; tar pipe is not
# Use a sibling dir of REPO_ROOT — guaranteed to exist; avoids /tmp issues on Windows
STAGE=$(mktemp -d "$(dirname "$REPO_ROOT")/maps-plus-deploy.XXXXXX")
trap "rm -rf '$STAGE'" EXIT

# Copy only the directories Splunk actually uses
for dir in appserver default metadata lookups; do
  [ -d "$REPO_ROOT/$dir" ] && cp -r "$REPO_ROOT/$dir" "$STAGE/"
done

# Strip dev-only artifacts from staging area
find "$STAGE" -name "node_modules" -type d | xargs rm -rf 2>/dev/null || true
rm -rf \
  "$STAGE/appserver/static/visualizations/maps-plus/src" \
  "$STAGE/appserver/static/visualizations/maps-plus/scripts" \
  "$STAGE/appserver/static/visualizations/maps-plus/package.json" \
  "$STAGE/appserver/static/visualizations/maps-plus/package-lock.json" \
  "$STAGE/appserver/static/visualizations/maps-plus/webpack.config.js" \
  "$STAGE/appserver/static/visualizations/maps-plus/.babelrc" \
  "$STAGE/appserver/static/visualizations/google-street-view/src" \
  2>/dev/null || true

# docker cp on Windows needs a Windows-style source path
STAGE_WIN=$(cygpath -w "$STAGE")
MSYS_NO_PATHCONV=1 docker cp "$STAGE_WIN/." "$CONTAINER:$SPLUNK_APP_PATH"

echo "Done. Hard-refresh your browser (Ctrl+Shift+R) to pick up changes."
