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
Maps+ for Splunk is compatible with **Splunk 10.x**

## AppInspect Notes
The warnings about "hotlinking" Leaflet are false positives. Leaflet is bundled 
via Webpack into visualization.js - the imports are resolved at build time, 
not runtime. The app does not depend on Splunk Web's copy of Leaflet.

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
Whether to fill the path with color. Set it to `false` to disable filling on polygons or circles. For multi-point features, setting `featureFill=false` renders the coordinates as an open polyline (`L.polyline`) rather than a closed polygon — useful for drawing routes, boundaries, or lines without a fill area. Single-point features (circle markers) are unaffected by this field.

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

### Military Symbols (Milsymbol)
Render NATO APP-6 / MIL-STD-2525D compliant tactical symbols on the map using the [milsymbol](https://github.com/spatialillusions/milsymbol) library. Milsymbol markers are driven entirely through SPL — symbol identity, appearance, modifiers, and color are all controlled via search fields, making it straightforward to visualize asset status, affiliation, and echelon directly from operational data.

Set `markerType` to `milsymbol` and provide a valid SIDC via `msSidc` to enable this marker type. All other fields are optional.

#### Required Fields

##### markerType
`milsymbol`

##### msSidc
15-character Symbol Identification Code (SIDC) conforming to NATO APP-6 / MIL-STD-2525D. The SIDC encodes the symbol's affiliation (friend, hostile, neutral, unknown), battle dimension (ground, air, sea surface, subsurface, etc.), and function (infantry, armor, aviation, etc.).

Example: `SFGPUCI--------` — Friendly Ground Unit (Infantry)

Refer to the [milsymbol documentation](https://github.com/spatialillusions/milsymbol) and APP-6/2525D references for SIDC construction and function catalogs.

---

#### Symbol Rendering Fields

##### msSize
Base pixel size of the rendered symbol at the reference zoom level. The symbol scales automatically as the user zooms the map in or out. - **Default** `35`

##### msStandard
Symbology standard to use for rendering. Accepts `APP6` (NATO APP-6) or `2525` (MIL-STD-2525). - **Default** inherited from format menu global setting

##### msColorMode
Symbol color palette applied to affiliation fills. Accepts `Light`, `Medium`, or `Dark`. Per-marker override of the format menu global color mode setting. - **Default** inherited from format menu global setting

##### msFrame
Whether to draw the symbol frame (the geometric shape encoding affiliation — rectangle for friend, diamond for hostile, etc.). Set to `false` to render the function icon only. - **Default** `true`

##### msIcon
Whether to draw the symbol's function icon inside the frame. Set to `false` to render the frame only. - **Default** `true`

##### msFill
Whether to fill the symbol frame with the affiliation color. Set to `false` for an outline-only frame. - **Default** `true`

##### msFillOpacity
Opacity of the symbol frame fill, as a decimal between `0` and `1`. - **Default** `1`

##### msSquare
Render the symbol frame as a square instead of the standard geometric shape for its affiliation. Useful for certain schematic or planning use cases. - **Default** `false`

##### msPadding
Padding in pixels added around the symbol bounding box. Increasing this value provides extra whitespace between the symbol and any adjacent labels or markers. - **Default** `0`

##### msStrokeWidth
Width in pixels of the symbol frame stroke. - **Default** `3`

##### msOutlineWidth
Width in pixels of an outer outline drawn around the entire symbol. Set to a non-zero value to add a contrasting halo effect that improves readability on complex tile backgrounds. - **Default** `0`

##### msFontfamily
CSS font family used for all text modifier labels rendered on or around the symbol. - **Default** `Arial`

---

#### Color Override Fields

The following fields accept a JSON object string that maps symbol sub-elements to color values. Each field overrides the corresponding color that would otherwise be determined by the active `msColorMode`. The JSON keys correspond to milsymbol's internal color slot names (e.g. `friend`, `hostile`, `neutral`, `unknown`).

##### msFrameColor
JSON color map for the symbol frame stroke. Example: `{"friend":"#004080","hostile":"#800000"}`

##### msIconColor
JSON color map for the function icon rendered inside the frame.

##### msInfoColor
JSON color map for the text modifier labels.

##### msInfoBackground
JSON color map for the background fill behind text modifier labels.

##### msInfoBackgroundFrame
JSON color map for the border drawn around text modifier label backgrounds.

##### msOutlineColor
JSON color map for the outer outline (halo) drawn around the symbol when `msOutlineWidth` is non-zero.

##### msMonoColor
Single CSS color string. When set, renders the entire symbol in a single monochrome color, overriding all affiliation color fills. Useful for decluttered or print-friendly displays. - **Default** `""` (disabled)

---

#### Text Modifier Fields

Text modifiers are labels rendered around the symbol frame that convey additional tactical information per APP-6/2525D modifier positions. All fields are optional and default to empty (modifier not rendered).

##### msUniqueDesignation
Unit or equipment designation (modifier T). Typically the unit's abbreviated title. Example: `1-9 IN`

##### msHigherFormation
Higher formation label (modifier M). Example: `3ID`

##### msType
Equipment type label (modifier V). Example: `M1A2`

##### msAdditionalInformation
Additional information label (modifier H). Free-text field for supplemental data.

##### msAltitudeDepth
Altitude or depth label (modifier X). Example: `FL250`

##### msCombatEffectiveness
Combat effectiveness label (modifier K). Example: `85%`

##### msCommonIdentifier
Common identifier label (modifier AF). Example: `APACHE`

##### msCountry
Two-letter country code (modifier CC). Example: `US`

##### msDtg
Date-time group label (modifier W). Example: `010830ZMAR26`

##### msEngagementBar
Engagement bar modifier. Renders a bar across the top of the symbol indicating engagement status.

##### msEngagementType
Engagement type qualifier for `msEngagementBar`.

##### msEquipmentTeardownTime
Equipment teardown time label (modifier AE).

##### msEvaluationRating
Source evaluation and information rating (modifier J). Example: `B2`

##### msGuardedUnit
Guarded unit label (modifier P).

##### msHeadquartersElement
Headquarters element label (modifier AH).

##### msHostile
Hostile label (modifier N). Rendered for enemy and suspect symbols. Example: `ENY`

##### msIffSif
IFF/SIF identification label (modifier P1).

##### msLocation
Location label (modifier Y). Example: `38.9072N 077.0369W`

##### msPlatformType
Platform type label (modifier AD). Example: `C-130`

##### msQuantity
Quantity label (modifier C). Example: `12`

##### msReinforcedReduced
Reinforced/reduced indicator (modifier F). Accepts `+` (reinforced), `-` (reduced), or `+-` (reinforced and reduced).

##### msSigint
SIGINT mobility indicator (modifier R2).

##### msSignatureEquipment
Signature equipment label (modifier L).

##### msSpecialDesignator
Special designator label.

##### msSpecialHeadquarters
Special headquarters label (modifier S). Example: `ARFOR`

##### msSpeed
Speed label (modifier Z). Example: `25 KPH`

##### msStaffComments
Staff comments label (modifier G).

##### msTargetNumber
Target number label (modifier B). Example: `AF1234`

---

#### Display Behavior Fields

##### msDirection
Direction of travel or orientation of the symbol in degrees (0–360). Renders as a movement indicator line extending from the symbol. Accepts a numeric value or a simple arithmetic expression (e.g. `180+90`). - **Default** `""` (no direction indicator)

##### msSpeedLeader
Length of the speed/direction leader line as a multiplier of the symbol size. Requires `msDirection` to be set. - **Default** `0` (no leader line)

##### msInfoFields
Whether to render text modifier labels for this marker. Accepts `true` or `false`. When not set, the visualization automatically suppresses modifiers at low zoom levels to prevent crowding — labels appear when the rendered symbol reaches approximately 85% of its base size. Set this field explicitly on a per-marker basis to override the zoom-driven automatic behavior. - **Default** automatic (zoom-driven)

##### msInfoSize
Size of the text modifier labels expressed as a percentage relative to the symbol size, passed directly to milsymbol's `infoSize` option. When not set, the visualization scales modifier text proportionally with the rendered symbol, capped at `25` to prevent oversized labels at high zoom. Set this field explicitly to override the automatic scaling on a per-marker basis.

##### msHqStaffLength
Length of the headquarters staff line in pixels. Applies to symbols designated as headquarters units. Leave empty for default milsymbol behavior. - **Default** `""` (milsymbol default)

##### msAlternateMedal
Use the alternate Medal of Honor display style. Accepts `true` or `false`. - **Default** `false`

##### msCivilianColor
Apply the civilian color scheme (purple) to applicable symbols. Accepts `true` or `false`. - **Default** `true`

##### msSimpleStatusModifier
Use a simplified status modifier instead of the standard dashed/dotted frame for anticipated or planned symbols. Accepts `true` or `false`. - **Default** `false`

---

#### Example Search

The following search renders a small Combined Arms scenario demonstrating SIDC coding, text modifiers, color modes, directional indicators, headquarters staff, and layer grouping.

```spl
| makeresults count=1
| eval latitude="38.9072", longitude="-77.0369",
       markerType="milsymbol",
       msSidc="SFGPUCI----E---",
       msSize="35", msColorMode="Light",
       msUniqueDesignation="1-9 IN", msHigherFormation="3ID",
       msDirection="045", msSpeed="15 KPH",
       msReinforcedReduced="+",
       layerGroup="Friendly Infantry",
       layerDescription="Friendly Infantry", layerIcon="shield-halved",
       layerIconColor="#006eff", layerIconPrefix="fa",
       description="<b>1-9 Infantry Battalion</b><br>Status: OPCON<br>Strength: 85%"
| append [| makeresults count=1
  | eval latitude="38.8500", longitude="-77.0200",
         markerType="milsymbol",
         msSidc="SFGPUCA----E---",
         msSize="35", msColorMode="Light",
         msUniqueDesignation="2-66 AR", msHigherFormation="3ID",
         msHqStaffLength="30",
         layerGroup="Friendly Armor",
         layerDescription="Friendly Armor", layerIcon="shield-halved",
         layerIconColor="#006eff", layerIconPrefix="fa",
         description="<b>2-66 Armor Battalion HQ</b><br>Status: ATTACHED"]
| append [| makeresults count=1
  | eval latitude="38.8200", longitude="-76.9800",
         markerType="milsymbol",
         msSidc="SHGPUCA----H---",
         msSize="35", msColorMode="Light",
         msOutlineWidth="2",
         msUniqueDesignation="T-80 PLT", msQuantity="4",
         msEvaluationRating="B2",
         layerGroup="Hostile Armor",
         layerDescription="Hostile Armor", layerIcon="triangle-exclamation",
         layerIconColor="#cc0000", layerIconPrefix="fa",
         description="<b>Hostile Armor Contact</b><br>Reported: 0345Z<br>Confidence: High"]
| table latitude, longitude, markerType, msSidc, msSize, msColorMode,
        msUniqueDesignation, msHigherFormation, msDirection, msSpeed,
        msReinforcedReduced, msQuantity, msHqStaffLength, msOutlineWidth,
        msEvaluationRating, layerGroup, layerDescription,
        layerIcon, layerIconColor, layerIconPrefix, description
```

---

#### Credits
Tactical symbol rendering powered by [milsymbol](https://github.com/spatialillusions/milsymbol) by Måns Beckman (Spatial Illusions), licensed under MIT.

### Antarctic Polar Projection (EPSG:3031)

Maps+ supports polar stereographic projection for Antarctic mapping use cases via the [proj4leaflet](https://github.com/kartena/Proj4Leaflet) library. Enabling Antarctic projection mode switches the map's coordinate reference system to EPSG:3031, which renders the Antarctic continent with accurate geometry — avoiding the extreme distortion introduced by the standard Web Mercator (EPSG:3857) projection at polar latitudes.

When Antarctic projection is active, the standard map tile set is replaced with one of three polar-capable tile providers: GBIF Geyser, GBIF OSM Bright, or NASA GIBS. The NASA GIBS option enables date/time-driven Earth observation imagery sourced from NASA's satellite fleet, making this feature suitable for scientific research, environmental monitoring, and logistics operations in the south polar region.

Antarctic projection is configured entirely through the format menu. No SPL field changes are required — your existing `latitude`, `longitude`, `description`, and marker fields work as normal.

> **Note:** Antarctic projection is mutually exclusive with the standard map view. Enabling it replaces the map's CRS and tile layer. All standard format menu options for Map Tile, Map Tile Override, and Map Attribution Override are ignored while Antarctic projection is active.

---

#### Enabling Antarctic Projection

Open the format menu and navigate to the **Antarctic** section. Set **Antarctic Projection** to `Enabled`. The map will reload in EPSG:3031 polar stereographic projection.

---

#### Formatting Options

All Antarctic projection settings are found under **Format → Antarctic**.

###### Antarctic Projection
Enable or disable EPSG:3031 polar stereographic projection. When enabled, the standard map tile and CRS are replaced with the polar projection configuration. - **Default** `Disabled`

###### Map Tile
Select the tile provider for the polar base map. Three options are available:

| Option | Description |
|---|---|
| **GBIF Geyser** | GBIF polar tile service with a clean cartographic style. Default selection. |
| **GBIF OSM Bright** | GBIF polar tile service with an OSM Bright style. |
| **NASA GIBS** | NASA Global Imagery Browse Services. Enables date/time-driven Earth observation imagery. Requires GIBS-specific settings below. |

**Default** `GBIF Geyser`

---

#### NASA GIBS Settings

The following options apply only when **Map Tile** is set to **NASA GIBS**. They configure which Earth observation product is displayed and over what time period. Refer to the [NASA GIBS API documentation](https://nasa.github.io/gibs-api-docs/) and the [GIBS layer catalog](https://nasa.github.io/gibs-api-docs/available-visualizations/) for available layer identifiers, formats, and tile matrix sets.

###### GIBS Layer Identifier
The GIBS layer ID identifying which Earth observation product to display. Refer to the GIBS layer catalog for available identifiers.  - **Default** `MODIS_Aqua_CorrectedReflectance_TrueColor`

Example layer identifiers:

| Layer ID | Description |
|---|---|
| `MODIS_Aqua_CorrectedReflectance_TrueColor` | MODIS Aqua true color corrected reflectance |
| `MODIS_Terra_CorrectedReflectance_TrueColor` | MODIS Terra true color corrected reflectance |
| `MODIS_Terra_Sea_Ice` | MODIS Terra sea ice extent |
| `NSIDC_EASE2_NH_SeaIce_Age` | NSIDC sea ice age |
| `VIIRS_SNPP_CorrectedReflectance_TrueColor` | VIIRS SNPP true color corrected reflectance |

###### GIBS Format
Image format for GIBS tile requests. - **Default** `jpg`

| Value | Use when |
|---|---|
| `jpg` | Photographic imagery layers (true color, reflectance) |
| `png` | Thematic or classified layers that require transparency |

###### GIBS Time
Date for which GIBS imagery is requested, in `yyyy-mm-dd` format. Leave blank to display imagery from the current day. - **Default** `""` (current day)

Example: `2024-03-15`

###### GIBS Tile Matrix Set
The GIBS tile matrix set identifier, which determines the spatial resolution of the imagery. - **Default** `250m`

Common values for Antarctic (EPSG:3031) layers:

| Value | Resolution |
|---|---|
| `250m` | 250 meters per pixel |
| `500m` | 500 meters per pixel |
| `1km` | 1 kilometer per pixel |
| `2km` | 2 kilometers per pixel |

###### GIBS Lower Corner
The lower corner of the tile matrix bounding box in EPSG:3031 projected coordinates (meters). This defines the southernmost/westernmost extent of the tile grid. - **Default** `-4194304`

###### GIBS Upper Corner
The upper corner of the tile matrix bounding box in EPSG:3031 projected coordinates (meters). This defines the northernmost/easternmost extent of the tile grid. - **Default** `4194304`

> The default lower/upper corner values of `-4194304` and `4194304` are the standard extents for the GIBS Antarctic EPSG:3031 tile grid and are correct for all standard GIBS Antarctic layers. Only adjust these values if you are working with a custom GIBS configuration.

---

#### Example Search

The following search plots a set of Antarctic research stations in EPSG:3031 polar projection. Enable Antarctic Projection in the format menu and set Map Tile to GBIF Geyser or NASA GIBS before running.

```spl
| makeresults count=1
| eval latitude="-90.0000", longitude="0.0000",
       description="<b>South Pole</b><br>Amundsen–Scott South Pole Station<br>Elevation: 2,835 m",
       icon="star", markerColor="red", layerGroup="Stations", layerDescription="Research Stations"
| append [| makeresults count=1
  | eval latitude="-77.8500", longitude="166.6667",
         description="<b>McMurdo Station</b><br>United States Antarctic Program<br>Largest Antarctic station",
         icon="home", markerColor="blue", layerGroup="Stations", layerDescription="Research Stations"]
| append [| makeresults count=1
  | eval latitude="-75.1000", longitude="123.3500",
         description="<b>Concordia Station</b><br>French-Italian research station<br>Elevation: 3,233 m",
         icon="home", markerColor="green", layerGroup="Stations", layerDescription="Research Stations"]
| append [| makeresults count=1
  | eval latitude="-70.9667", longitude="-11.4333",
         description="<b>Neumayer Station III</b><br>German research station<br>Operated by AWI",
         icon="home", markerColor="orange", layerGroup="Stations", layerDescription="Research Stations"]
| table latitude, longitude, description, icon, markerColor, layerGroup, layerDescription
```

---

#### Credits
Polar projection support powered by [proj4leaflet](https://github.com/kartena/Proj4Leaflet), licensed under BSD.  
NASA GIBS imagery provided by [NASA's Global Imagery Browse Services](https://nasa.github.io/gibs-api-docs/). Use of NASA GIBS imagery is subject to [NASA's data use policy](https://www.earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy).  
GBIF polar tiles provided by the [Global Biodiversity Information Facility](https://www.gbif.org/).

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