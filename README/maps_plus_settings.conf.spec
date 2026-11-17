# maps_plus_settings.conf.spec
#
# Written by the Maps+ Setup page (default/data/ui/views/maps_plus_setup.xml).
# Not shipped as a default file: the page creates local/maps_plus_settings.conf
# on first save. Secrets (Bing / Google keys) are NOT stored here; they live in
# storage/passwords (realm=leaflet_maps_app).

[basemap]
mapTileOverride = <string>
* Tile URL template for the basemap, for example a CARTO URL with ?key=...
* Must be an http(s) URL containing {z}, {x} and {y}.
* A tile key is not a secret: it is visible in every tile request. Do not put
  Bing or Google keys here.
* The Setup page also writes the same value to local/savedsearches.conf
  [default] display.visualizations.custom.leaflet_maps_app.maps-plus.mapTileOverride,
  which is what classic dashboards read. This copy exists so Dashboard Studio
  dashboards can read it with | rest.
* Consumers must re-validate it; this file can be edited by hand.
* Default: empty (no override).
