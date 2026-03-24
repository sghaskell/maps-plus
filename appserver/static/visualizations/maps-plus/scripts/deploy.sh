#!/bin/bash
# Copies Maps+ build output into the running Splunk Docker container.
# Finds the Splunk container by image name — no hardcoded container name.

CONTAINER=$(docker ps --format '{{.ID}} {{.Image}}' | awk '/splunk\/splunk/{print $1; exit}')

if [ -z "$CONTAINER" ]; then
  echo "Error: No running Splunk container found. Is Docker Desktop running?"
  exit 1
fi

APP_PATH="/opt/splunk/etc/apps/leaflet_maps_app/appserver/static/visualizations/maps-plus"

echo "Deploying to container $CONTAINER..."
docker cp visualization.js "$CONTAINER:$APP_PATH/visualization.js"
docker cp contrib/css/leaflet-geoman.css "$CONTAINER:$APP_PATH/contrib/css/leaflet-geoman.css"

echo "Done. Hard-refresh your browser (Ctrl+Shift+R) to pick up changes."
