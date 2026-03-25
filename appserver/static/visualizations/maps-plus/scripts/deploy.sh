#!/bin/bash
# Deploys the entire Maps+ Splunk app to a running Docker container.
# Copies all app assets (dashboards, KML files, visualizations, etc.)
# while excluding source files, build tools, and dev artifacts.
# Finds the Splunk container by image name — no hardcoded container name.

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

tar -c \
  --exclude='.git' \
  --exclude='.gitignore' \
  --exclude='.gitattributes' \
  --exclude='.worktrees' \
  --exclude='node_modules' \
  --exclude='./docs' \
  --exclude='./build_release.sh' \
  --exclude='*.tar.gz' \
  --exclude='./appserver/static/visualizations/maps-plus/src' \
  --exclude='./appserver/static/visualizations/maps-plus/scripts' \
  --exclude='./appserver/static/visualizations/maps-plus/package.json' \
  --exclude='./appserver/static/visualizations/maps-plus/package-lock.json' \
  --exclude='./appserver/static/visualizations/maps-plus/webpack.config.js' \
  --exclude='./appserver/static/visualizations/maps-plus/.babelrc' \
  --exclude='./appserver/static/visualizations/google-street-view/src' \
  -C "$REPO_ROOT" . | \
  MSYS_NO_PATHCONV=1 docker exec -u root -i "$CONTAINER" tar -x --overwrite --no-same-owner --no-same-permissions -C "$SPLUNK_APP_PATH"

echo "Done. Hard-refresh your browser (Ctrl+Shift+R) to pick up changes."
