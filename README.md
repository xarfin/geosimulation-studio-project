# Schiehaven Noord viewer

Task 4.4a: open `/weather.html` for the KNMI weather dashboard. See
`WEATHER_SETUP.md` to configure the server-only EDR key and run the live data API.

A CesiumJS application with four pages: Layers, Land-use scenarios, KNMI data
and Socio-demographics.
Use the shared top navigation to switch pages. Each page uses the same map and
sidebar layout, typography and controls. On smaller screens, the sidebar sits
below the map.

Open `/demographics.html` to compare Delfshaven and Schiemond using the supplied
CBS 2025 data. Select a neighbourhood or click its map boundary to focus on it.
The dashboard compares age, households, housing, social assistance and service
distances using the original chart images from the supplied folder. Select a
chart to view it full size, or expand the source table to view every indicator
and download the CSV. Map controls are in the sidebar.

## Run in VS Code

1. Open this folder.
2. Open Terminal > New Terminal.
3. On a new computer, run `npm.cmd ci`.
4. Run `npm.cmd run dev`.
5. Open the local address printed in the terminal.

If the old starter is already running, stop it with Ctrl+C and restart it. This regenerates the imagery tile indexes.

Use the dropdown or Previous/Next buttons to browse nine layers: aerial image, study area, development site, footprints, green space, water, AHN image, existing 3D buildings, and proposed complex. Each vector/model layer has the aerial image underneath. The AHN slide displays its image alone. Reset view returns to the supplied study area.

## Folder structure

```text
src/
  main.js                     Layers page and loading logic
  layers.js                   Layer titles, file paths, colours
  task47.js                   Land-use scenario controls and rendering
  weather.js                  KNMI dashboard and station map
  weather-charts.js           Weather chart rendering
  demographics.js            Socio-demographic page and controls
  demographics/
    indicators.js             Indicator labels, units and number formatting
    map.js                    Neighbourhood boundaries and map interaction
  ui/
    navigation.js             Shared page links and current-page indicator
  styles/
    shared.css                Layout, navigation, typography and controls
    layers.css                Layer browser controls
    scenarios.css             Scenario controls, metrics and legend
    weather.css               Weather cards, charts and tables
    demographics.css          Neighbourhood cards, charts and table
public/
  models/proposed-complex/    Proposed building 3D Tiles
  data/
    landUse/
      study-area/            Each GeoJSON folder contains doc.geojson
      development-site/
      buildings/
      green/
      water/
    elevation/ahn/           AHN image tiles and metadata
    background/luchtfoto/    Aerial image tiles and metadata
    buildings/rotterdam/     Existing building 3D Tiles
    demographics/            Two-neighbourhood CBS data, chart images and provenance
  cesiumStatic/              Generated Cesium supporting files
  ASSETS.md                  Sources and replacement instructions
  task47/                    Land-use scenarios and model summaries
server/                      KNMI API, parsing and Vite middleware
tests/                       Weather parsing and API tests
scripts/
  copy-cesium-assets.js       Copies Cesium's supporting files
  index-imagery.js            Lists available tiles in the clipped exports
  prepare-assets.js          Runs both preparation steps
  prepare-demographics.py    Prepares the supplied two-neighbourhood archive
dist/                        Generated website for hosting
```

## Build

Run `npm.cmd run build` to create dist, then `npm.cmd run preview` to preview the build. Building does not publish anything. All study data is included in dist. The present configuration expects deployment at the website root; subfolder deployment requires adjusting the asset URLs.

Run `npm.cmd run test:weather` for the weather parsing and API tests.

The dataset exports do not include complete provider/licence details. Add the original source attribution before public deployment.
