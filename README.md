# Maps+ for Splunk

### Synopsis
The mapping equivalent of a Swiss Army knife for Splunk.

### Credits
#### Included Open Source Software
##### [Leaflet Maps](http://leafletjs.com/)
##### [Leaflet Markercluster Plugin](https://github.com/Leaflet/Leaflet.markercluster)
##### [Leaflet Awesome Markers Plugin](https://www.npmjs.com/package/drmonty-leaflet-awesome-markers)
##### [Leaflet.vector-markers Plugin](https://github.com/hiasinho/Leaflet.vector-markers)
##### [Leaflet.FeatureGroup.SubGroup](https://github.com/ghybs/Leaflet.FeatureGroup.SubGroup)
##### [leaflet-measure](https://www.npmjs.com/package/leaflet-measure)
##### [Leaflet.contextmenu](https://github.com/aratcliffe/Leaflet.contextmenu)
##### [leaflet-bing-layer](https://github.com/digidem/leaflet-bing-layer)
##### [Leaflet.Dialog](https://github.com/NBTSolutions/Leaflet.Dialog)
##### [Leaflet.spin](https://github.com/makinacorpus/Leaflet.Spin)
##### [spin.js](https://github.com/fgnass/spin.js)
##### [togeojson](https://github.com/mapbox/togeojson)
##### [load-google-maps-api](https://www.npmjs.com/package/load-google-maps-api#usage)
##### [load-google-places-autocomplete](https://www.npmjs.com/package/leaflet-google-places-autocomplete)
##### [load-google-maps-api-2](https://www.npmjs.com/package/load-google-maps-api-2)
##### [JSZip](https://stuk.github.io/jszip/)
##### [JSZipUtils](http://stuk.github.io/jszip-utils/)
##### [Jquery](https://jquery.com/)
##### [Underscore.js](http://underscorejs.org/)
##### [jquery.i18n](https://github.com/wikimedia/jquery.i18n)
##### [CLDRPluralRuleParser](https://github.com/wikimedia/CLDRPluralRuleParser)
##### [Webpack](https://webpack.github.io/)
##### [transform-loader](https://www.npmjs.com/package/transform-loader)
##### [moment](https://github.com/moment/moment)
##### [brfs](https://www.npmjs.com/package/brfs)
##### [fontawesome](https://fontawesome.com/)
##### [Glyphicons](https://getbootstrap.com/docs/3.3/components/#glyphicons-how-to-use)
##### [Ionicons](https://ionicons.com/)
##### [leaflet-ant-path](https://github.com/rubenspgcavalcante/leaflet-ant-path)
##### Icon made by [Pixel Buddha](https://www.flaticon.com/authors/pixel-buddha) from [www.flaticon.com](www.flaticon.com)
##### [City of Chicago Data Portal - Crimes - 2001 to present](https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-present/ijzp-q8t2)
##### [UCI Machine Learning Repository - GPS Trajectories Data Set](https://archive.ics.uci.edu/ml/datasets/GPS+Trajectories)
Publications: 
1 - CRUZ, M. O.; MACEDO, H.; GUIMARÃ£ES, A. P. Grouping similar trajectories for 
carpooling purposes. In: Brazilian Conference on Intelligent Systems. [S.l.: s.n.], 2015. p. 
234â€“239. ISBN 9781509000166. 

Big thanks to the following people: 

* [Damien Dallimore](https://splunkbase.splunk.com/apps/#/page/1/search/damien%2520dallimore/order/relevance) and **Andrew Stein** for all the feature requests and extensive testing.
* Johannes Effland for contributing the path tracing code.
* Paul Thompson for [marker priority](#marker-priority) and [SVG marker](#svg-markers) feature suggestions.
* [dxwils3](https://github.com/dxwils3) for **pathColor** enhancement.

### Compatibility
Maps+ for Splunk is compatible with **Splunk 7.x**

### Usage
##### Fields must be named exactly as labled here. The app is keyed off of field names and not field order.
```
base_search | table latitude, longitude [ description | tooltip | title | icon | customIcon | customIconShadow | markerColor | markerPriority | markerSize | markerAnchor | popupAnchor | markerVisibility | iconColor | shadowAnchor | shadowSize | prefix | extraClasses | layerDescription | layerVisibility | layerIcon | layerIconSize | layerIconColor | layerIconPrefix | pathLayer | pathWeight | pathOpacity | pathColor | antPath | antPathDelay | antPathPulseColor | antPathPaused | antPathReverse | antPathDashArray | layerGroup | layerPriority | clusterGroup | heatmapInclude | heatmapLayer | heatmapPointIntensity | heatmapMinOpacity | heatmapRadius | heatmapBlur | heatmapColorGradient | circleStroke | circleRadius | circleColor | circleWeight | circleOpacity | circleFillColor | circleFillOpacity | feature | featureDescription | featureTooltip | featureColor | featureWeight | featureOpacity | featureStroke | featureFill | featureFillColor | featureFillOpacity | featureRadius | _time]
```

### Required Fields
##### latitude
Latitude Coordinates
##### longitude
Longitude Coordinates

### Optional Fields
##### description
Desciption that is displayed in a pop-up when then marker is clicked on the map. You can get creative with this field. Combine a bunch of other fields or lookups using eval to make the description full of detail. **This field supports HTML**.


### Style Markers And Icons Dynamically Through SPL
Maps+ allows you to dynamically style map markers and add icons via SPL. Create fields using [eval](http://docs.splunk.com/Documentation/Splunk/6.4.0/SearchReference/CommonEvalFunctions) to define colors for the marker or use an icon from [Font Awesome Solid](https://fontawesome.com/icons?d=gallery&s=solid&m=free), [Font Awesome Brands](https://fontawesome.com/icons?d=gallery&s=brands&m=free), [ionicons](http://ionicons.com/) or [Bootstrap Glyphicons](https://getbootstrap.com/docs/3.3/components/).

By default, markers are rendered as PNG's. The set of markers comes in a limited array of color values and cannot be re-sized. If you want access to an unlimited color palette and the ability to size markers, use [SVG based markers](#svg-markers).

Control the size of the icons using the `extraClasses` field. See [Font Awesome documentation](https://fontawesome.com/how-to-use/on-the-web/styling/sizing-icons) for details on which classes to use.

If you own a [Font Awesome Pro license](https://fontawesome.com/pro), you can upload the remaining web fonts into `$SPLUNK_HOME/etc/apps/leaflet_maps_app/appserver/static/visualizations/maps-plus/contrib/fonts` and then [reference them using the appropriate](https://fontawesome.com/how-to-use/on-the-web/referencing-icons/basic-use) `prefix` values `far` or `fal`.

### PNG Markers
#### Available Fields and Values
##### markerType
`png` - **Default**

##### title
Icon mouse hover over description. **Deprecated (with backwards compatibility) - see tooltip**

##### tooltip
Tooltip displayed on marker hover.

##### icon
Icon displayed in map marker - Any icon from [Font Awesome](https://fontawesome.com/v4.7.0/icons/), [ionicons](http://ionicons.com/) or [Bootstrap Glyphicons](https://getbootstrap.com/docs/3.3/components/) - **Default** ``circle``
##### markerColor
Color of map marker - ``red``, ``darkred``, ``lightred``, ``orange``, ``beige``, ``green``, ``darkgreen``, ``lightgreen``, ``blue``, ``darkblue``, ``lightblue``, ``purple``, ``darkpurple``, ``pink``, ``cadetblue``, ``white``, ``gray``, ``lightgray``, ``black``. - **Default** ``blue``
##### iconColor
Color of icon - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). - **Default** `white`.
##### prefix
``fa`` ([Font Awesome](https://fontawesome.com/icons?d=gallery&s=solid&m=free)), ``fab`` ([Font Awesome Brands](https://fontawesome.com/icons?d=gallery&s=brands&m=free)), ``ion`` ([ionicons](http://ionicons.com/)) or ``glyphicon`` ([Bootstrap Glyphicons](https://getbootstrap.com/docs/3.3/components/)) - **Default** ``fa``

##### extraClasses
Any extra CSS classes you wish to add for styling. Here are some [additional classes](http://fortawesome.github.io/Font-Awesome/examples/) you can use with Font Awesome or Ionicons to change the styling. **Default** ``fa-lg``


### SVG Markers
Dynamically size markers and assign any color (name or hex value). The following settings control SVG based markers.

##### markerType
``svg``

##### markerSize
Comma separated string representing the pixel width and height of marker, respectively. - **Default** ``35,45``

##### markerColor
Color of map marker. Use any common [HTML color code name](http://www.w3schools.com/colors/colors_names.asp) or [hex value](http://www.google.com/search?q=html+color+picker). - **Default** ``#38AADD``

##### markerAnchor
Comma separated string representing the coordinates of the "tip" of the icon (relative to its top left corner). - **Default** ``15,50``

##### popupAnchor
Comma separated string representing the coordinates of the point from which popups will "open", relative to the icon anchor.

##### shadowSize
Comma separated string representing the pixel width and height of the marker shadow. You typically don't need to change this value unless you increase or decrese the **markerSize**. Set to ``0,0`` to disable shadows. - **Default** ``30,46``

##### shadowAnchor
Comma separated string representing the coordinates of the "tip" of the shadow (relative to its top left corner). You typically don't need to change this value unless you increase or decrese the **markerSize**. - **Default** ``30,30``

##### iconColor
Color of icon - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). **Default** white.
##### prefix
``fa`` (Font Awesome) or ``ion`` (ionicons). **Default** ``fa``

##### extraClasses
Any extra CSS classes you wish to add for styling. Here are some [additional classes](http://fortawesome.github.io/Font-Awesome/examples/) you can use with Font Awesome to change the styling.

### Circle Markers
Use circle markers when you have a lot of points to plot and you need performance. Circle markers are rendered using canvas instead of SVG which gives a huge performance boost. There are also a ton of customizaiton options through the available SPL fields.

##### markerType
``circle``

##### circleRadius 
Radius of the circle marker, in pixels

##### circleColor 
Stroke color - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). - **Default** `white`

##### circleFillColor 
Fill color - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). - **Default** `white`. Defaults to the value of the [circleColor](#circlecolor) field

##### circleOpacity
Stroke opacity

##### circleFillOpacity  
Fill opacity.

##### circleStroke
Whether to draw stroke along the path. Set it to false to disable borders.

##### circleWeight 
Stroke width in pixels

### Custom Icons
Use any image as a map marker. Copy the image into `$SPLUNK_HOME/etc/apps/leaflet_maps_app/appserver/static/visualizations/maps-plus/contrib/images` and set the `customIcon` field to the name of the image. Use `markerSize` to increase or decrease the size of the icon.

### Display icon without marker
Set the `markerType` field to `icon` to only display the icon without a marker. Control the size of the icons using the `extraClasses` field. See [Font Awesome documentation](https://fontawesome.com/how-to-use/on-the-web/styling/sizing-icons) for details on which classes to use. Control the color of the icon with [`iconColor`](#iconcolor).

### Heatmaps
Render heatmaps with or without markers. Control heatmaps via the [format menu](#heatmap) or directly with SPL. Create multiple heatmap layers via SPL with the `heatmapLayer` field. When controlling heatmaps through SPL, the first event for a given `heatmapLayer` will define the heatmap settings `heatmapMinOpacity` `heatmapMaxZoom` `heatmapRadius` `heatmapBlur` `heatmapColorGradient`, if specified, otherwise values specified in the format menu will be used.

#### Available Fields and Values
##### heatmapLayer
Name of group for display using [layer controls](#layer-controls) - **Default** `heatmap`

##### heatmapInclude
Include coordinates in heatmap layer - **Default** `true`

##### heatPointIntensity
Control the intensity of the point - **Default** ``1.0``

##### heatmapMinOpacity
The minimum opacity the heat will start at

##### heatmapRadius 
Radius of each "point" of the heatmap - **Default** ``25``

##### heatmapBlur
Amount of blur - **Default** ``15``

##### heatmapColorGradient 
Color gradient config - **Default** ``{"0.4":"blue","0.6":"cyan","0.7":"lime","0.8":"yellow","1":"red"})``

### Features
Load features drawn with the [measure tool](#measure-tool) on the map through SPL or lookup files. 

Use the measure tool in the upper right corner to draw a point, line or polygon on the map. Upon completion, a **Feature Defintion** can be copied and used with the `feature` field. 

![Alt text](appserver/static/visualizations/maps-plus/contrib/images/feature-definition.png?raw=true)

Adjust the look and behavior of the feature with the following fields.

##### featureColor
Feature color - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). - **Default** `white`

##### featureDescription 
Desciption that is displayed in a pop-up when then marker is clicked on the map. You can get creative with this field. Combine a bunch of other fields or lookups using eval to make the description full of detail. **This field supports HTML**.

##### featureTooltip 
Tooltip displayed on feature hover.

##### featureLayer 
Name of group for display using [layer controls](#layer-controls) - **Default** `feature`

##### featureWeight 
Stroke width in pixels - **Default** `3`

##### featureStroke 
Whether to draw stroke along the path. Set it to `false` to disable borders on polygons or circles. 

##### featureFill 
Whether to fill the path with color. Set it to `false` to disable filling on polygons or circles.

##### featureFillColor
Feature fill color - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). - **Default** `featureColor`

##### featureFillOpacity
Fill opacity - **Default** `0.2`

##### featureRadius 
Radius of circle in meters - **Default** `10`

Define the features with the `feature` field. Optionally, store the features in a lookup file and use `| append [|inputlookup feature-lookup.csv]` to load the features on map

Example Search

```| makeresults | eval feature="42.259016415705766,-87.99087524414064", featureWeight="3", featureColor="#5CBF5C", featureDescription="point description", featureTooltip="point tip", featureFillOpacity="0.350", featureFillColor="#f4f141", featureFill="false",featureStroke="true", featureRadius="10", featureLayer="point layer", featureFillOpacity="1.0"
| append [| makeresults | eval feature="42.25946306970395,-87.99049168825151;42.25916530072335,-87.99044072628021;42.259145449407995,-87.98961728811265;42.259472995312414,-87.98967629671098;42.25946306970395,-87.99049168825151", layerDescription="polygon layer", featureTooltip="polygon tooltip", featureDescription="polygon description", featureLayer="polygon layer", featureColor="#41dff4", featureFillColor="#55f441", featureFillOpacity="0.1"]
| append [| makeresults | eval feature="42.25895289132462,-87.99104690551759;42.25959408760995,-87.98937588930131", layerDescription="line layer", featureDescription="line description", featureTooltip="line tooltip", featureLayer="line layer", featureColor="#f441d3"]
| table feature, layerDescription, tooltip, featureDescription, featureTooltip, featureColor, featureStroke, featureWeight, featureRadius, featureLayer, featureFillColor, featureFillOpacity
```

### Path Tracing
If you have a dataset that contains multiple coordinates for each object (think cars, trains, planes, bicycles, anything that moves and can be tracked) you can trace the path on the map. Control whether markers are displayed along the path using the ``markerVisibility`` setting. Show split intervals by enabling ``Path Splits`` and adjusting the ``Path Split Interval`` in the [format menu options](#path-lines). Note that ``_time`` must be present for split intervals to work.

#### Available Fields and Values
##### markerVisibility
Show marker for the given coordinates. Set to ``marker`` to show marker or any other value to hide.

##### pathLayer
Name of group for display using [layer controls](#layer-controls) - **Default** `path`

##### pathWeight
Weight (width) of path - **Default** ``5``

##### pathOpacity
Opacity of path line - **Default** ``0.5``

##### pathColor
The color of the path.  If not specified, the color will be chosen randomly from the set of colors listed in the **Path Colors** option.

#### Path Direction
Use the following fields to add an ant path animation showing direction of travel. 

##### antPath
Enable or disable Ant Path animation. Disabled by default. Set to ``true`` to enable.

##### antPathDelay
Animation delay in milliseconds - **Default** ``1000``

##### antPathPulseColor
Color of dash - **Default** ``#FFFFFF``

##### antPathPaused
Pause animation - **Default** ``false``

##### antPathReverse
Reverse animation - **Default** ``false``

##### antPathDashArray
Comma separated size of animated dashes - **Default** ``10,20``

#### Path Playback
Visualize direction along a path with a moveable marker. Enable playback on all paths under **Format Menu -> Path Lines -> Playback**. When playback is enabled, use the play or slider controls to replay the route for a path. Use the context menu to add all paths, clear or reset playback. Use the context menu by clicking on a path to add or remove it from playback. If time ranges for paths vary wildly there may be significant gaps (wait times) before the next marker(s) begin to play.

Use the following fields to control playback.

##### playback
toggle playback for a path - **Default** ``false``

### Marker Priority
Higher priority markers will render on top of lower priority markers. This is especially useful for dense maps where you need certain markers to stand out over others.

Use the following setting to set the marker priority.

##### markerPriority
Number used to set marker priority. Higher value numbers render over lower value numbers. Set a high value like ``1000`` (or a high negative value to render beneath). **Default** ``0``

### Layer Priority
Use in conjunction with `layerGroup` for [circle markers](#circle-markers), `pathLayer` for [paths](#path-tracing) and `heatmapLayer` for [heatmaps](#heatmap) to prioritize layer rendering. This is especially useful for dense maps where you need certain layers to stand out over others.

**Warning**: When using the canvas renderer in conjunction with `layerPriority`, mouse events are affected for all layers below the highest priority layer. This is a [bug in Leaflet](https://github.com/Leaflet/Leaflet/issues/4135). If you don't need to use `tooltip`, `description` or [drilldown](#drilldown) and want the performance boost canvas provides, this shouldn't be an issue.

Use the following setting to set the layer priority.

##### layerPriority
Number used to set layer priority when using Circle. Higher value numbers render over lower value numbers. Set a high value like ``1000`` (or a high negative value to render beneath). **Default** ``0``

### Drilldown
The visualization will identify any non-standard fields and make them available as drilldown fields. Simply add any fields you wish to the final table command and you'll have access to them via drilldown in Simple XML. 

Use the [drilldown editor](http://docs.splunk.com/Documentation/Splunk/latest/Viz/DrilldownIntro#Access_the_drilldown_editor) to [set the action](http://docs.splunk.com/Documentation/Splunk/latest/Viz/DrilldownIntro#Choose_a_drilldown_action) for the drilldown.

See the [documentation on contextual drilldown](http://docs.splunk.com/Documentation/Splunk/latest/Viz/ContextualDrilldown). Refer to this section of the docs on [accessing tokens for dynamic drilldown](http://docs.splunk.com/Documentation/Splunk/latest/Viz/tokens#Define_tokens_for_dynamic_drilldown).

Note that `$click.value$` does not get set through the Custom Visualization API. Use `$row.fieldname$` to acceess a drilldown value.

When using the `Click` drilldown mouse event, use the `tooltip` field instead of the `description` field to display information about the marker as you hover over the icon.

#### Usage
Drilldown is disabled by default. Enable it in the main **Map** section of the format menu.  Simply **double-click** on a marker to activate the drilldown behavior.

### Layer Controls
Group marker/icon styles into their own layer. A layer control widget (enabled by default, but optionally hidden) is presented in the upper right hand corner that displays a legend for each icon class with a check-box to toggle visibility of the markers on the map. This control works for both clustered and stand-alone markers. 

Specify groups with the ``layerGroup`` field to filter markers via layer controls. The default behavior is to group by icon. If you have the same icon with different colors, the ``layerGroup`` field allows you to split them into their own group for filtering.

#### Available Fields
##### layerDescription
Description that is added next to the icon in the layer control legend. **this field supports HTML**

##### layerGroup
Specify unique group that markers, including [circle markers](#circle-markers), belong to. Use `heatmapLayer` and `pathLayer` to group heatmap and path layers (repsectively) together

##### layerIcon
Icon displayed in layer control legend - Any icon from [Font Awesome Solid](https://fontawesome.com/icons?d=gallery&s=solid&m=free), [Font Awesome Brands](https://fontawesome.com/icons?d=gallery&s=brands&m=free), [ionicons](http://ionicons.com/) or [Bootstrap Glyphicons](https://getbootstrap.com/docs/3.3/components/) - **Default** first icon detected for defined ``layerGroup``

##### layerIconSize
Size of icon, in pixels, displayed in the layer control legend, specified as `height,width`

##### layerIconColor
Color of icon in layer control legend - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). - **Default** `white`

##### layerIconPrefix
Icon prefix - **Default** `fa`

##### layerVisibility
Initial visibility of layer in layer control menu. Set to `false` to hide from map. - **Default** `true`

### Cluster Groups
By default, the visualization renders all markers into a single cluster group. Override this behavior using the ``clusterGroup`` SPL field. Refer to the `Multi-Cluster Groups` dashboard example in the app for details.

### Overlays
Add custom overlays to the map. The first release implements a KML or KMZ overlay feature. If you have existing KML/KMZ files that define features (polyline, polygons, whatever) you can now leverage them to overlay these features on the map.


##### KML/KMZ Overlay
Copy any KML or KMZ files into the following directory

```
$SPLUNK_HOME/etc/apps/leaflet_maps_app/appserver/static/visualizations/maps-plus/contrib/kml
```

Click `Format` and selct the `Overlays` tab. Enter a comma separated list of filenames that you uploaded to the above directory. File order dictates feature layering - e.g., file1.kml renders beneath file2.kml

```
file1.kml,file2.kmz
```

The files will be asynchronously loaded when the map is rendered. 

### i18n Localization
The app has limited support for localizing portions of the app. Select the `i18n` tab of the format menu to select your language. Current supported languages are English and Japanese. Reach out to me directly if you'd like to contribute translations for your language.

### Measure Tool
Interactively measure paths and area on the map. The feature is enabled by default. Hover over the icon in the upper right corner of the map and then select `Create new measurement`. You can draw a simple path or click to define multiple points to measure an area. Measurements will not be persisted for future use. This is an interactive tool designed for a single session. See the [features](#features) section for persisting features drawn by the measurement tool.

### API Key Storage
API keys for use with Google Places search, Bing Maps and the Google Streetview comapnion viz must be stored in Splunk's [storage/passwords](http://docs.splunk.com/Documentation/Splunk/7.2.0/RESTREF/RESTaccess#storage.2Fpasswords) REST endpoint. Every user who needs access to a key must have the `list_storage_passwords` capability enabled for their role. Set ACL's on credentials to narrow the scope of who can access them. Download and install my [REST storage/passwords Manager for Splunk](https://splunkbase.splunk.com/app/4013/) to make this process painless.

### Google Places Search
A search control for the Google Places API. Log into the [Google API Console](https://console.developers.google.com/flows/enableapi?apiid=places_backend&reusekey=true&authuser=2) and enable the `Google Places API Web Service` and `Google Maps JavaScript API` for the given project and create an API key. See [Google's docs](https://developers.google.com/places/web-service/get-api-key?authuser=2) for detailed instructions.


Enable the search control via the format menu option ``Google Places -> Google Places Search -> Enabled``

Set the `API Key User` option `Google Places -> API Key User`

If a realm is specified when creating the API Key User, use the optional `API Key Realm` option `Google Places -> API Key Realm`

Optionally set the `Zoom Level` option `Google Places -> Zoom Level` for the desired fly to zoom level.

### Bing Maps
A Bing Maps tile layer. 

`Enable` or `Disable` Bing Maps via the format menu option `Bing Maps -> Bing Maps -> Enabled`. When Bing Maps are enabled, the default tile layer set and the map attribution override setting will not work.

Set the `API Key User` option `Bing Maps -> API Key User`

If a realm is specified when creating the API Key User, use the optional `API Key Realm` option `Google Places -> API Key Realm`

Choose the desired `Tile Layer` under `Bing Maps -> Tile Layer`

Optionally set the `Label Language` using `Bing Maps -> Label Language` to localize the tile labels in the desired language. See [Microsoft's documentation](https://msdn.microsoft.com/en-us/library/hh441729.aspx) for more details.


### Formatting Options
#### Map
###### Map Tile
Select one of six available map tiles
###### Map Tile Override
Use your own map tile URL and override defaults. Example: http://a.tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png. Find more tiles [here](http://wiki.openstreetmap.org/wiki/Tiles)
###### Map Attribution Override
Use your own attribution.
###### Renderer
Use Canvas renderer for performance boost drawing vector layers (path, circle). Requires modern browser with Canvas support.
###### Progress Indicator
Display progress spinner for long running searches
###### Scroll Wheel Zoom
Enable or disable scroll wheel zoom
###### Full Screen Mode
Enable or disable full screen mode. Map takes up all available space in browser and adjust to resize. 
###### Drilldown
Enable or disable drilldown - **Requires browser Refresh**
###### Drilldown Mouse Event
Select mouse event that triggers drilldown from markers
###### Context Menu
Enable or disable context menu when right clicking the map
###### Default Height
Initial Height Of Map - **Default** `600`
###### Auto Fit & Zoom
Dynamically set map view that contains all markers with the maximum zoom level possible when search finishes. - **Default** `Enabled`
###### Auto Fit & Zoom Delay (ms)
Delay in milliseconds before triggering Auto Fit & Zoom. Increase if you get inconsistent behavior - **Default** `500`
###### Dashboard Refresh Interval
Delay in seconds before refreshing the dasbhoard. WARNING - Refresh forces a full browser refresh on the entire dashboard. This workaround addresses a usability issue in the Custom Viz API around reliably honoring panel or global SimpleXML refresh. (default: 0 - disabled)
###### Map Zoom
Initial Zoom for map - **Default** `6`
###### Center Lat
Initial Center Latitiude - **Default** `39.50`
###### Center Lon
Initial Center Longitude - **Default** `-98.35`
###### Min Zoom
Minimum zoom for tile layer. Does not affect map zoom. - **Default** `1`
###### Max Zoom
Maximum zoom for tile layer. Does not affect map zoom. - **Default** `19`

#### Clustering
###### Enable Clustering
Disable clustering and plot all markers. WARNING - This comes at a significant performance penalty for large datasets. - **Requires browser Refresh**
###### Show All Popups
Display all popups on page load. Only works with clustering disabled. - **Requires browser Refresh**
###### Allow Multiple Popups
Allow multiple popups to dispaly on screen without closing previous. Will disappear at higher zoom levels with clustering enabled. Enabled by default when showing all popups. - **Requires browser Refresh**
###### Animate
Animate cluster separation on zoom - **Requires browser Refresh**
###### Single Marker Mode 
Re-style single marker icon to marker cluster style (round) - **Requires browser Refresh**
###### Disable Clustering At Zoom
At this zoom level and below, markers will not be clustered. Must set Disable Clustering At Zoom to Enabled.
###### Disable Clustering At Zoom Level
At this zoom level and below, markers will not be clustered. Must set Disable Clustering At Zoom to Enabled.
###### Max Cluster Radius
A cluster will cover at most this many pixels from its center - **Default** `80` - **Requires browser Refresh**
###### Cluster Warning Size
Display an alert warning that the cluster exceeds threshold at max-zoom and do not show underlying markers. Browser may hang and die if a single point exceeds a very large number.- **Default** `100` - **Requires browser refresh**
###### Distance Multiplier
Increase to increase the distance away that markers appear from the center when expanded at max zoom. - **Default** `1` - **Requires browser refresh**

#### Markers
###### Permanent Tooltip
Open the tooltip permanently or only on mouseover. Depends on tooltip field in search results.
###### Sticky Tooltip
Tooltip follows mouse instead of fixed position.

### Heatmap
###### Enable Heatmap
Enable or disable heatmap.
###### Heatmap Only
Only show the heatmap. No markers will be rendered.
###### Min Opacity
Minimum opacity the heat will start at. - **Default** `1.0`
###### Max Zoom
Zoom level where the points reach maximum intensity. - **Default** `Max Zoom of map`
###### Radius
Max point intensity. - **Default** `1.0`
###### Blur
Amount of blur. - **Default** `15`
###### Color Gradient
Color gradient config - **Default** ``{"0.4":"blue","0.6":"cyan","0.7":"lime","0.8":"yellow","1":"red"}``

#### Path Lines
###### Path Lines
Draw path lines on map for markers that have multiple coordinates.
###### Renderer
Use Canvas renderer for performance boost drawing paths. Requires modern browser with Canvas support
###### Path Identifier
Field used to distinguish unique paths, e.g. vehicle number or trip ID
###### Path Colors
Comma-separated list of hex or html colors for path lines (wraps around if more paths than colors)
###### Path Splits
Split path into unique segments based on time span between points in path. Use this to setting to determine gaps within your path baed on then Path Split Interval. _time field must be present in results.
###### Path Split Interval
Time in seconds by which path segments are defined. Higher values result in a more continuous path. Lower values result in more segments and gaps within the path. - **Default** `60`
###### Playback
Playback route along path line.
###### Slider Control
Show playback slider control.
###### Date Control
Show playback date control.
###### Play Control
Show playback play control.
###### Tick Length
Tick length in milliseconds. Increasing this value may improve performance at the cost of animation smoothness. - **Default** ``50``
###### Playback Speed
Multiplier for default animation speed. - **Default** ``100``


#### i18n
###### Language
Select language for localization

#### Google Places
###### Google Places Search
Enable or disable Google Places API search control.
###### API Key User
Google Places API Key user stored in storage/passwords REST endpoint
###### API Key Realm
Optional realm in storage/passwords REST endpoint associated with API key user.
###### Search Bar Position
Position of Google Places Search Bar - **Default** `Top Left`
###### Zoom Level
Desired zoom level to fly to

#### Bing Maps
###### Bing Maps
Enable or disable Bing Maps tiles
###### API Key User
Bing Maps API Key user stored in storage/passwords REST endpoint
###### API Key Realm
Optional realm in storage/passwords REST endpoint associated with API key user
###### Tile Layer
Select tile layer imagery set
###### Label Language
Select language used for labels

#### Cluster Colors
Cluster color changes require browser refresh

###### Range One Background
- **Default** `#B5E28C`
###### Range One Foreground
- **Default** `#6ECC39`
###### Range two thereshold
Number at which cluster group two starts
###### Range Two Background
- **Default** `#F1D357`
###### Range Two Foreground
- **Default** `#F0C20C`
###### Range three threshold
Number at which cluster group three starts
###### Range Three Background
- **Default** `#FD9C73`
###### Range Three Foreground
- **Default** `#F18017`

#### Layer Controls
Layer control changes require browser refresh

###### Layer Control
Enable or disable dynamic filtering of layer groups on map. Each icon type's visibility can be toggled via control in upper right corner of map. - **Default** `Enabled`
###### Control Collapsed
Collapse or expand layer control widget. If collapsed, mousing over icon will expand. - **Default** `Collapsed`

#### Overlays
Overlay control changes require browser refresh

###### KML/KMZ Overlay
Comma separated list of KML or KMZ file names copied into kml directory of app (file1.kml, file2.kml)

#### Measure
###### Enable Measurement Plugin
Enable or disable measurement plugin to allow path and area measurement on map. - **Default** `Enabled`
###### Localization
Language - **Default** `English`
###### Icon Position
Position of measurement icon on map - **Default** `Top Right`
###### Primary Length Unit
Primary unit for length measurement - **Default** `feet`
###### Secondary Length Unit
Secondary unit for length measurement - **Default** `miles`
###### Primary Area Unit
Primary unit for area measurement - **Default** `acres`
###### Secondary Area Unit
Secondary unit for area measurement - **Default** `square miles`
###### Active Color
Color of measurement when actively drawing - **Default** `#00ff00`
###### Completed Color
Color of measurement when drawing is complete - **Default** `#0066ff`

# Google Street View Companion Visualization
Maps+ comes bundled with the new Google Street View visualization. Use this visualization as a drill-down target when clicking on a marker. See the `Google Street View Drilldown` example dashboard in the app for detailed usage.

### Pre-requisites
The Google Street View visualization requires an API key. Log in to the [Google Cloud Console](https://console.cloud.google.com/) to enable the `Maps JavaScript API`,`Street View API` and [generate an API key](https://cloud.google.com/docs/authentication/api-keys).

### Required Fields
##### coordinates
Comma separated coordinate pair the format `<latitude>,<longitude>`. e.g - `| eval coordinates=latitude.",".longitude`

### Formatting Options
##### API Key
Google Street View API Key
##### Default Height
Initial Height Of Map - **Default** `600`
##### Full Screen Mode
Enable or disable full screen mode. Map takes up all available space in browser and adjust to resize.

# Support
###### This app is supported by Scott Haskell ([shaskell@splunk.com](mailto:shaskell@splunk.com))
###### [Code hosted at Github](https://github.com/sghaskell/maps-plus)