# Maps+ for Splunk

# Synopsis
The mapping equivalent of a Swiss Army knife for Splunk.

# Credits
### Included Open Source Software
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
##### [Webpack](https://webpack.github.io/)
##### [transform-loader](https://www.npmjs.com/package/transform-loader)
##### [moment](https://github.com/moment/moment)
##### [brfs](https://www.npmjs.com/package/brfs)
##### [fontawesome](https://fontawesome.com/)
##### [Glyphicons](http://glyphicons.com/)
##### [Ionicons](https://ionicons.com/)
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

# Compatibility
This app is compatible with **Splunk 6.4+** as it relies on the [Custom Visualization API](http://docs.splunk.com/Documentation/Splunk/latest/AdvancedDev/CustomVizDevOverview).

# Usage
### Fields must be named exactly as labled here. The app is keyed off of field names and not field order.
```
base_search | table latitude, longitude [ description | tooltip | title | icon | markerColor |markerPriority | markerSize | markerAnchor | popupAnchor | markerVisibility | iconColor | shadowAnchor | shadowSize | prefix | extraClasses | layerDescription | pathWeight | pathOpacity | pathColor | layerGroup | clusterGroup | heatmapLayer | heatmapPointIntensity | heatmapMinOpacity | heatmapMaxZoom | heatmapRadius | heatmapBlur | heatmapColorGradient]
```

# Required Fields
##### latitude
Latitude Coordinates
##### longitude
Longitude Coordinates

# Optional Fields
##### description
Desciption that is displayed in a pop-up when then marker is clicked on the map. You can get creative with this field. Combine a bunch of other fields or lookups using eval to make the description full of detail. **This field supports HTML**.
##### layerDescription
Description that is added next to the icon in the layer control legend. **this field supports HTML**

# Style Markers And Icons Dynamically Through SPL
### Feature Description
Maps+ allows you to dynamically style map markers and add icons via SPL. Create fields using [eval](http://docs.splunk.com/Documentation/Splunk/6.4.0/SearchReference/CommonEvalFunctions) to define colors for the marker or use an icon from [Font Awesome](http://fortawesome.github.io/Font-Awesome/icons/) or [ionicons](http://ionicons.com/). If you find the color set of icons too limiting, feel free to override the map marker icon with a map icon from Font Awesome and style it with any hex color or RGB value.

By default, markers are rendered as PNG's. The set of markers comes in a limited array of color values and cannot be re-sized. If you want access to an unlimited color palette and the ability to size markers, use [SVG based markers](#svg-markers).

### Available Fields and Values
##### title
Icon mouse hover over description. **Deprecated (with backwards compatibility) - see tooltip**
##### tooltip
Tooltip to display on marker hover.
##### icon
Icon displayed in map marker - Any icon from [Font Awesome](http://fortawesome.github.io/Font-Awesome/icons/) or [ionicons](http://ionicons.com/). **Default** ``circle``
##### markerColor
Color of map marker - ``red``, ``darkred``, ``lightred``, ``orange``, ``beige``, ``green``, ``darkgreen``, ``lightgreen``, ``blue``, ``darkblue``, ``lightblue``, ``purple``, ``darkpurple``, ``pink``, ``cadetblue``, ``white``, ``gray``, ``lightgray``, ``black``. **Default** ``blue``
##### iconColor
Color of icon - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). **Default** white.
##### prefix
``fa`` (Font Awesome) or ``ion`` (ionicons). **Default** ``fa``

##### extraClasses
Any extra CSS classes you wish to add for styling. Here are some [additional classes](http://fortawesome.github.io/Font-Awesome/examples/) you can use with Font Awesome or Ionicons to change the styling. **Default** ``fa-lg``

### SVG Markers
Dynamically size markers and assign any color (name or hex value). The following settings control SVG based markers.

##### markerType
``svg`` or ``png`` **Default** ``png``

##### markerSize
Comma separated string representing the pixel width and height of marker, respectively. **Default** ``35,45``

##### markerColor
Color of map marker. Use any common [HTML color code name](http://www.w3schools.com/colors/colors_names.asp) or [hex value](http://www.google.com/search?q=html+color+picker). **Default** ``#38AADD``

##### markerAnchor
Comma separated string representing the coordinates of the "tip" of the icon (relative to its top left corner). **Default** ``15,50``

##### popupAnchor
Comma separated string representing the coordinates of the point from which popups will "open", relative to the icon anchor.

##### shadowSize
Comma separated string representing the pixel width and height of the marker shadow. You typically don't need to change this value unless you increase or decrese the **markerSize**. Set to ``0,0`` to disable shadows. **Default** ``30,46``

##### shadowAnchor
Comma separated string representing the coordinates of the "tip" of the shadow (relative to its top left corner). You typically don't need to change this value unless you increase or decrese the **markerSize**. **Default** ``30,30``

##### iconColor
Color of icon - Any [CSS color name](https://www.vogatek.com/html-tutorials/cssref/css_colornames.asp.html), [Hex or RGB value](http://www.w3schools.com/colors/colors_picker.asp). **Default** white.
##### prefix
``fa`` (Font Awesome) or ``ion`` (ionicons). **Default** ``fa``

##### extraClasses
Any extra CSS classes you wish to add for styling. Here are some [additional classes](http://fortawesome.github.io/Font-Awesome/examples/) you can use with Font Awesome to change the styling.

# Heatmaps
Render heatmaps with or without markers. Control heatmaps via the [format menu](#heatmap) or directly with SPL. Create multiple heatmap layers via SPL with the `heatmapLayer` field. When controlling heatmaps through SPL, the first event for a given `heatmapLayer` will define the heatmap settings `heatmapMinOpacity` `heatmapMaxZoom` `heatmapRadius` `heatmapBlur` `heatmapColorGradient`, if specified, otherwise default values from the format menu will be used.

### Available Fields and Values
##### heatLayer
Name of the heatmap layer to render.

##### heatPointIntensity
Control the intensity of the point. (Default: 1.0)

# Path Tracing
If you have a dataset that contains multiple coordinates for each point (think cars, trains, planes, bicycles, anything that moves and can be tracked) you can trace the path of the object. Control whether markers are displayed along the path using the ``markerVisibility`` setting. Show split intervals by enabling ``Path Splits`` and adjusting the ``Path Split Interval`` in the [format menu options](#path-lines). Note that ``_time`` must be present for split intervals to work.

### Available Fields and Values
##### markerVisibility
Show marker for the given coordinates. Set to ``marker`` to show marker or any other value to hide.

##### pathWeight
Weight (width) of path. **Default** ``5``

##### pathOpacity
Opacity of path line. **Default** ``0.5``

##### pathColor
The color of the path.  If not specified, the color will be chosen randomly from the set of colors listed in the **Path Colors** option.

# Marker Priority
Higher priority markers will render on top of lower priority markers. This is especially useful for dense maps where you need certain markers to stand out over others.

Use the following setting to set the marker priority.

##### markerPriority
Number used to set marker priority. Higher value numbers render over lower value numbers. Set a high value like ``1000`` (or a high negative value to render beneath). **Default** ``0``

# Drilldown
The visualization will identify any non-standard fields and make them available as drilldown fields. Simply add any fields you wish to the final table command and you'll have access to them via drilldown in Simple XML. See the [documentation on dynamic drilldown](http://docs.splunk.com/Documentation/Splunk/6.5.1/Viz/Dynamicdrilldownindashboardsandforms). Refer to this section of the docs on [accessing tokens for dynamic drilldown](http://docs.splunk.com/Documentation/Splunk/latest/Viz/tokens#Define_tokens_for_dynamic_drilldown).

### Usage
Drilldown is disabled by default. Enable it in the main **Map** section of the format menu.  Simply **double-click** on a marker to activate the drilldown behavior.

# Layer Controls
Group marker/icon styles into their own layer. A layer control widget (enabled by default, but optionally hidden) is presented in the upper right hand corner that displays a legend for each icon class with a checkbox to toggle visbility of the markers on the map. This control works for both clustered and single value visualizations. 

Specify ``layerGroup`` via SPL for filtering markers via layer controls. The default behavior is to group by icon. If you have the same icon with different colors, the ``layerGroup`` field allows you to split them into their own group for filtering.

### Available Fields
##### layerDescription
Add description text next to each icon in the layer control legend.
##### layerGroup
Specify unique group that markers belong to. [See Issue 13 for details](https://github.com/sghaskell/Clustered-Single-Value-Map-Visualization/issues/13)

Example
```
layerGroup=case(like(description, "%HARASSMENT BY TELEPHONE%"), "hbt", like(description, "%RECKLESS CONDUCT%"), "rc", 1=1, "default")
```
# Multiple Cluster Groups
By default, the visualiztion renders all markers into a single cluster group. Override this behavior using the ``clusterGroup`` SPL field.

# Overlays
Add custom overlays to the map. The first release implements a KML or KMZ overlay feature. If you have existing KML/KMZ files that define features (polyline, polygons, whatever) you can now leverage them to overlay these features on the map.

#### Usage

##### KML/KMZ Overlay
Copy any KML or KMZ files into the following directory

```
$SPLUNK_HOME/etc/apps/leaflet_maps_app/appserver/static/visualizations/leaflet_maps/contrib/kml
```

Click 'Format' and selct the 'Overlays' tab. Enter a comma separated list of filenames that you uploaded to the above directory. File order dictates feature layering - e.g., file1.kml renders beneath file2.kml

```
file1.kml,file2.kmz
```

The files will be asynchronously loaded when the map is rendered. 

# Measurement Plugin
Interactively measure paths and area on the map. The feature is enabled by default. Click the icon in the upper right corner of the map and then select 'Create new measurement'. You can draw a simple path or click to define multiple points to measure an area. Measurements will not be persisted for future use. This is an interactive tool designed for a single session.

# Google Places Search
A search control for the Google Places API. Log into the [Google API Console](https://console.developers.google.com/flows/enableapi?apiid=places_backend&reusekey=true&authuser=2) and enable the **Google Places API Web Service** and **Google Maps JavaScript API** for the given project and create an API key. See [Google's docs](https://developers.google.com/places/web-service/get-api-key?authuser=2) for detailed instructions.

#### Usage
**Enable/Disable** the search control via the format menu option **Google Places -> Google Places Search -> Enabled**

Set the **API Key** option **Google Places -> API Key**

Optionally set the **Zoom Level** option **Google Places -> Zoom Level** for the desired fly to zoom level.

# Bing Maps
A Bing Maps tile layer. 

#### Usage
**Enable/Disable** Bing Maps via the format menu option **Bing Maps -> Bing Maps -> Enabled**. When Bing Maps are enabled, the default tile layer set and the map attribution override setting will not work.

Set the **API Key** option **Bing Maps -> API Key** by pasting your Bing Maps API Key into this field.

Choose the desired **Tile Layer** under **Bing Maps -> Tile Layer**

Optionally set the **Label Language** using **Bing Maps -> Label Language** to localize the tile labels in the desired language. See [Microsoft's documentation](https://msdn.microsoft.com/en-us/library/hh441729.aspx) for more details.

# Search Examples
### Basic plot of latitude and longitude
```
index=chicago_crime 
| fillnull 
| table latitude, longitude
```

### Plot with latitude, longitude and description
```
index=chicago_crime 
| fillnull 
| eval description = "<b>".description."</b>" 
| table latitude, longitude, description
```

### Plot with custom marker color and icons
```
index=chicago_crime 
| fillnull 
| eval description = "<b>".description."</b>" 
| eval markerColor = case(like(description, "%HARASSMENT BY TELEPHONE%"), "red", like(description, "%RECKLESS CONDUCT%"), "green", 1=1, "blue"), 
icon=case(like(description, "%HARASSMENT BY TELEPHONE%"), "exclamation", like(description, "%RECKLESS CONDUCT%"), "check-circle", 1=1, "circle") 
| table latitude, longitude, description, markerColor, icon
```

### Plot overriding custom marker with map icons from Font Awesome
```
index=chicago_crime 
| fillnull 
| eval description = "<b>".description."</b>"
| eval markerColor = case(like(description, "%HARASSMENT BY TELEPHONE%"), "red", like(description, "%RECKLESS CONDUCT%"), "green", 1=1, "blue"), 
icon=case(like(description, "%HARASSMENT BY TELEPHONE%"), "map-marker", like(description, "%RECKLESS CONDUCT%"), "map-pin", 1=1, "circle"), 
iconColor=case(like(description, "%HARASSMENT BY TELEPHONE%"), "#374D13", like(description, "%RECKLESS CONDUCT%"), "rgb(0,255,255)", 1=1, "white") 
| table latitude, longitude, description, markerColor, icon, iconColor
``` 

### Plot SVG markers with custom marker size, shadow size and marker priority
Red exclamation markers render on top of green check markers on top of smaller blue markers.
```
index=chicago_crime
| fillnull
| eval description = "<b>".description."</b>",
shadowSize = case(like(description, "%HARASSMENT BY TELEPHONE%"), "30,46", like(description, "%RECKLESS CONDUCT%"), "30,46", 1=1, "20,36"),
shadowAnchor = case(like(description, "%HARASSMENT BY TELEPHONE%"), "30,30", like(description, "%RECKLESS CONDUCT%"), "30,30", 1=1, "32,40"),
extraClasses = case(like(description, "%HARASSMENT BY TELEPHONE%"), "fa-lg", like(description, "%RECKLESS CONDUCT%"), "fa-lg", 1=1, ""),
markerSize = case(like(description, "%HARASSMENT BY TELEPHONE%"), "35,45", like(description, "%RECKLESS CONDUCT%"), "35,45", 1=1, "15,35"),
markerType = case(like(description, "%HARASSMENT BY TELEPHONE%"), "svg", like(description, "%RECKLESS CONDUCT%"), "svg", 1=1, "svg"),
markerColor = case(like(description, "%HARASSMENT BY TELEPHONE%"), "red", like(description, "%RECKLESS CONDUCT%"), "green", 1=1, "blue"),
icon=case(like(description, "%HARASSMENT BY TELEPHONE%"), "exclamation", like(description, "%RECKLESS CONDUCT%"), "check-circle", 1=1, "circle"),
markerPriority=case(like(description, "%HARASSMENT BY TELEPHONE%"), 1000000, like(description, "%RECKLESS CONDUCT%"), 500000, 1=1, -1000000)
| table latitude, longitude, description, markerColor, icon, markerType, markerSize, extraClasses, shadowSize, shadowAnchor, markerPriority
```

### Show path lines with only the last marker visible for data set with the following fields: _time, latitude, longitude, vehicle
```
| inputlookup vehicles.csv 
| reverse 
| streamstats current=f window=1 first(_time) as ftime by vehicle 
| reverse 
| eval markerVisibility=if(isnull(ftime), "marker", "foo"), description=vehicle, pathWeight=case(like(user, "%mustang%"), 10), pathOpacity=case(like(user, "%mustang%"), 0.8)
| table latitude, longitude, vehicle, description, markerVisibility, pathWeight, pathOpacity
```

# Formatting Options
### Map
###### Map Tile
Select one of six available map tiles
###### Map Tile Override
Use your own map tile URL and override defaults. Example: http://a.tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png. Find more tiles [here](http://wiki.openstreetmap.org/wiki/Tiles)
###### Map Attribution Override
Use your own attribution. - **Requires browser Refresh**
###### Scroll Wheel Zoom
Enable or disable scroll wheel zoom.
###### Full Screen Mode
Enable or disable full screen mode. Map takes up all available space in browser and adjust to resize. - **Requires browser Refresh**
###### Drilldown
Enable or disable drilldown. Double click a marker to activate drilldown. - **Requires browser Refresh**
###### Context Menu
Enable or disable context menu when right clicking the map.
###### Default Height
Initial Height Of Map (Default: 600)
###### Auto Fit & Zoom
Dynamically set map view that contains all markers with the maximum zoom level possible when search finishes. (Default: Enabled)
###### Auto Fit & Zoom Delay (ms)
Delay in milliseconds before triggering Auto Fit & Zoom. Increase if you get inconsistent behavior (Default: 500)
###### Dashboard Refresh Interval
Delay in seconds before refreshing the dasbhoard. WARNING - Refresh forces a full browser refresh on the entire dashboard. This workaround addresses a usability issue in the Custom Viz API around reliably honoring panel or global SimpleXML refresh. (default: 0 - disabled)
###### Map Zoom
Initial Zoom for map (Default: 6)
###### Center Lat
Initial Center Latitiude (Default: 39.50)
###### Center Lon
Initial Center Longitude (Default: -98.35)
###### Min Zoom
Minimum zoom for tile layer. Does not affect map zoom. (Default: 1)
###### Max Zoom
Maximum zoom for tile layer. Does not affect map zoom. (Default: 19)

### Clustering
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
###### Max Cluster Radius
A cluster will cover at most this many pixels from its center (Default: 80) - **Requires browser Refresh**
###### Cluster Warning Size
Display an alert warning that the cluster exceeds threshold at max-zoom and do not show underlying markers. Browser may hang and die if a single point exceeds a very large number.(Default: 100) - **Requires browser refresh**
###### Distance Multiplier
Increase to increase the distance away that markers appear from the center when expanded at max zoom. (Default: 1) - **Requires browser refresh**

### Markers
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
Minimum opacity the heat will start at. (Default: 1.0)
###### Max Zoom
Zoom level where the points reach maximum intensity. (Default: Max Zoom of map)
###### Radius
Max point intensity. (Default: 1.0)
###### Blur
Amount of blur. (Default: 15)
###### Color Gradient
(Default: {"0.4":"blue","0.6":"cyan","0.7":"lime","0.8":"yellow","1":"red"})

### Path Lines
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
Time in seconds by which path segments are defined. Higher values result in a more continuous path. Lower values result in more segments and gaps within the path. (Default: 60)

### Google Places
###### Google Places Search
Enable or disable Google Places API search control.
###### API Key
Google Places API Key
###### Search Bar Position
Position of Google Places Search Bar (Default: Top Left)
###### Zoom Level
Desired zoom level to fly to

### Bing Maps
###### Bing Maps
Enable or disable Bing Maps tiles
###### API Key
Bing Maps API Key
###### Tile Layer
Select tile layer imagery set
###### Label Language
Select language used for labels

### Cluster Colors
#### Cluster color changes require browser refresh
###### Range One Background
(Default: #B5E28C)
###### Range One Foreground
(Default: #6ECC39)
###### Range two thereshold
Number at which cluster group two starts
###### Range Two Background
(Default: #F1D357)
###### Range Two Foreground
(Default: #F0C20C)
###### Range three threshold
Number at which cluster group three starts
###### Range Three Background
(Default: #FD9C73)
###### Range Three Foreground
(Default: #F18017)

### Layer Controls
#### Layer control changes require browser refresh
###### Layer Control
Enable or disable dynamic filtering of layer groups on map. Each icon type's visibility can be toggled via control in upper right corner of map. (Default: Enabled)
###### Control Collapsed
Collapse or expand layer control widget. If collapsed, mousing over icon will expand. (Default: Collapsed)

### Overlays
#### Overlay control changes require browser refresh
###### KML/KMZ Overlay
Comma separated list of KML or KMZ file names copied into kml directory of app (file1.kml, file2.kml)

### Measure
###### Enable Measurement Plugin
Enable or disable measurement plugin to allow path and area measurement on map. (Default: Enabled)
###### Localization
Language (Default: English)
###### Icon Position
Position of measurement icon on map (Default: Top Right)
###### Primary Length Unit
Primary unit for length measurement (Default: feet)
###### Secondary Length Unit
Secondary unit for length measurement (Default: miles)
###### Primary Area Unit
Primary unit for area measurement (Default: acres)
###### Secondary Area Unit
Secondary unit for area measurement (Default: square miles)
###### Active Color
Color of measurement when actively drawing (Default: #00ff00)
###### Completed Color
Color of measurement when drawing is complete (Default: #0066ff)

# Support
###### This app is supported by Scott Haskell ([shaskell@splunk.com](mailto:shaskell@splunk.com))
###### [Code hosted at Github](https://github.com/sghaskell/maps-plus)
