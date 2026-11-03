# Schiehaven Noord viewer

Task 4.4a: open `/weather.html` for the KNMI weather dashboard. See
`WEATHER_SETUP.md` to configure the server-only EDR key and run the live data API.

A CesiumJS application with nine pages: Introduction, Layers, Land-use scenarios, Urban morphology,
Wind & noise, KNMI data, Weather predictions, Socio-demographics and Road networks.
Use the shared top navigation to switch pages. Each page uses the same map and
sidebar layout, typography and controls. On smaller screens, the sidebar sits
below the map.

The opening page (`/`) introduces the project on an OpenStreetMap street map of the Netherlands.
Focus on neighbourhood zooms to the existing study boundary. Switch between Map and Satellite
without changing the camera. Satellite uses the saved PDOK study-area extract over the online
`Actueel_orthoHR` background outside the study boundary. Neither service needs an API key. Only
visible online tiles are requested; no country-wide archive is downloaded. Attribution remains on the map.

The shared banner's focus button zooms the current map to that same study boundary. On Weather
predictions, which has no map, it opens `/?view=study-area`. Camera transitions respect reduced-motion
preferences. The original Layers page is now `/layers.html`.

The street map, satellite imagery outside the study area, and KNMI observations require internet.
The study-area aerial background, models, scenario results, analysis overlays, predictions and
demographics work offline when the application is served locally. The same saved aerial extract
is used on every map page, including Introduction in Satellite mode. The introduction shows a
connection message if online tiles fail; click the selected background again to retry.

`public/data/background/study-area/` contains the 2026 PDOK aerial image clipped to the study polygon,
as transparent Web Mercator TMS tiles from zoom 9 to 19 (about 18 cm per pixel at the site). Its
`tiles.json` records the source, bounds, licence and extraction date. The old aerial export is preserved.
To recreate the extract, run `python scripts/prepare-study-imagery.py` with Pillow, NumPy and rasterio
installed. Only this preparation step downloads the local background; normal starts and builds use
the saved files. Downloaded source blocks stay in the ignored `local-data-backups/` folder.

The Layers page now covers the full study polygon. Its building footprints come from BAG, and
vegetated ground and water come from BGT, downloaded through PDOK and clipped to the boundary.
The building layer excludes demolished, unrealised and permit-only records. The AHN layer uses
the current 0.5 m ground-elevation coverage, with a colour scale in metres NAP and a downloadable
numeric GeoTIFF. Missing ground measurements stay transparent over the aerial image.

Existing 3D buildings on Layers and Task 4.7 use a local subset of the municipality's LoD2 3D Tiles service.
Only intersecting tile branches and their embedded models are included. The map clips their display
to the same polygon as the aerial image, hiding geometry outside the study boundary. Whole source
tiles are preserved on disk. No external models or textures are requested when browsing this saved
layer. Missing municipal BAG identifiers are checked against 3DBAG; available LoD2.2 models
are saved locally in a supplement. Both pages use `combined-tileset.json`, which includes the
municipal hierarchy and supplement. The original supplied datasets remain available for the analysis pages.

Recreate these display layers with `python scripts/prepare-study-layers.py` (Pillow, NumPy, rasterio,
pyproj and Shapely), `python scripts/prepare-study-buildings.py` (Shapely), then
`python scripts/prepare-building-gaps.py` (pyproj and the project's Node/Cesium dependencies). Source downloads are
cached under `local-data-backups/`. The WGS 84 study boundary can be downloaded from Layers or
directly from `/downloads/study_area.geojson`.

Open `/task47.html` for task 4.7. Select None, Existing use, Supplied proposal, A or B.
The satellite option hides all scenario overlays and background buildings. In A and B, green roofs
appear automatically in 3D allocation view; the background model hides the existing development-site
buildings to leave room for the new allocation. Map legend and Final layout are collapsible, and
Method and Sources explains the supplied 5 m cellular automaton outputs and assumptions.

Open `/morphology.html` for task 4.3. Compare the baseline and Designs A and B
using the supplied sky-view factor layers (with or without trees) and H/W proxy
over the aerial image. The satellite background, boundary and displayed buildings are clipped to
the original Task 4.3 analysis area within the current satellite coverage. Indicator cards describe
the development site. Toggle buildings, 3D view, boundaries and
overlay opacity. Design views remove existing buildings marked for clearance
before adding the proposed footprints, extruded using their supplied heights.

The nine original PNGs retain the supplied EPSG:4326 geographic rectangles and
colour scales (SVF 0–1; H/W 0–3, saturated above 3). The 1 m source analysis uses
a 1.5 m observer; the H/W proxy uses nearest-building height divided by twice
the distance, within 30 m of buildings. Numeric rasters were not supplied, so
the app shows the supplied area statistics rather than sampling image colours.
Green share includes ground vegetation and tree canopy, excluding buildings;
green roofs are separate. Source roof totals are only reported for the site,
so the app does not present a whole-study-area green-roof total.

The original PDF comparisons, CSV, building GeoJSONs, PNGs and geographic rectangles remain
in `public/data/morphology/`. Method and Sources describes the supplied indicator calculations, data sources and modelling assumptions.
The unchanged original ZIP contains the source GIS packages and analysis scripts. Reimport with
`python scripts/prepare-morphology.py "path/to/task43.zip"`; this uses Python's
standard library and does not rerun the analysis. Then run `python scripts/prepare-morphology-area.py`
with pyproj and Shapely to regenerate the display crop. It reuses `analysis-area.geojson`, extracted
from the original Task 4.1 package's Study Area layer. To extract that boundary again, pass the
Task 4.1 ZIP as the script's argument. Original Task 4.3 exports and indicator values stay intact.

Open `/environment.html` for task 4.5. Compare the baseline, Design A and Design B
wind simulations over the aerial image, adjust opacity, and click for wind speed.
The overlays show the final saved OpenFOAM velocity fields at 1.5 m above model
ground, sampled on a 2 m grid and restored to real-world coordinates using the
offset documented in the cases. All scenarios use the same colour scale. The
summary cards describe open-air samples inside the development site, excluding
buildings. Original wind GeoTIFFs and supplied PDFs remain in `public/data/environment/`.
Method and Sources describes the supplied OpenFOAM and NoiseModelling workflows and data providers.

The noise layer preserves the supplied image's `Lw (dB)` scale of 0–9. Its
placement is approximate: the plotted axes were interpreted as EPSG:3857 and
checked against the building footprints. No numeric noise raster, confirmed CRS,
receiver height or separate design noise results were supplied. Both analyses
are clipped to the study area; the original noise image remains available.

The saved overlays work without Python or ParaView. To regenerate them, install
NumPy, rasterio, Pillow and matplotlib in a Python environment, then run:

```powershell
python scripts/prepare-wind-noise.py "path/to/task45.zip" --pvpython "C:\Program Files\ParaView 6.2.0\bin\pvpython.exe"
```

The importer reads the existing simulation results; it does not rerun the solver.
Intermediate meshes and samples stay under the ignored `local-data-backups/`
directory. The browser uses only the prepared PNGs, numeric grids and metadata.

Open `/predictions.html` for task 4.4b. Browse the supplied LSTM charts, compare
the 1-, 12- and 60-month historical errors (MAE or RMSE), and view the experimental
2026–2030 forecasts for temperature, rainfall and wind. The original charts are
shown at a readable size with full-size links. KNMI’23 climate scenarios have
their own chart and are labelled separately from the LSTM experiment.
The page works without a KNMI API key or Python server; it reads saved results.
The monthly/annual forecast CSVs and unchanged original ZIP remain in
`public/data/predictions/`. Method and Sources explains the supplied analysis and its data sources. The archive's notebook is supplied as received and
is not executed by the application.

To reimport the same archive structure, run
`python scripts/prepare-predictions.py "path/to/predictions.zip"`.
This copies the source charts and CSVs and prepares `summary.json`; it does not
retrain or change the model. Temperature and wind are annual means; rainfall
is summed by year and reported as mm/year in the five-year comparison.

Open `/demographics.html` to compare Delfshaven and Schiemond using the supplied
CBS 2025 data. Click a neighbourhood boundary to highlight it on the map and in the cards.
The dashboard compares age, households, housing, social assistance and service
distances using the original chart images from the supplied folder. Select a
chart to view it full size. The complete source CSV remains in `public/data/demographics/`.
Method and Sources explains the supplied analysis and its data sources.

Open `/roads.html` for task 4.8. Accessibility and traffic flow share one page and
the same Current/Proposed network selector. Both networks serve the supplied Design B buildings.
Accessibility shows the six-building routes to five destinations, with a destination filter
and walking-distance comparison. Traffic flow includes the proposed exit interventions,
peak added road flow, mean modelled trip distance and demand at each exit. Solid flow lines
use one width scale for both networks; unverified site-to-road connectors stay dashed.
The map retains the complete supplied network, including routes outside the study boundary.
Both traffic networks label the North, East, South and West destinations at their route
endpoints, matching the supplied traffic figures.
Only the development polygon has a green fill over the satellite base layer.
Housing and sports colours match the land-use tab.
Both analyses also show Design B's outdoor sports allocation from Task 4.7 and identify
Building 2 as indoor sports by overlap with that allocation. Recreate this display context
with `python scripts/prepare-roads-site.py` (Shapely and pyproj); the original Task 4.8
building and route files remain unchanged. The full outdoor allocation is 3675 m²,
including the 3000 m² reserve programme; the indoor allocation is 225 m².

The supplied conceptual crossing P1 is about 51 m outside the development site and
about 46 m from the nearest supplied walking route. It is displayed at its original
coordinate with the label Crossing; no crossing geometry or connected route through it was supplied.
The three conceptual pedestrian exits retain their original short line geometries.

Walking statistics and peak traffic loads come from the GeoJSON properties. Mean modelled
trip distances (2141/2213 m) and per-exit demands were transcribed from the two supplied
comparison PNGs; their filenames are recorded in `summary.json`. The original PNGs,
GeoJSONs and unchanged ZIP are in `public/data/roads/`. The data are modelled additional
traffic, with both directions combined. Method and Sources explains the pedestrian-accessibility analysis and its data sources.
Reimport with `python scripts/prepare-roads.py "path/to/task48.zip"`; no analysis is rerun.

## Run in VS Code

1. Open this folder.
2. Open Terminal > New Terminal.
3. On a new computer, run `npm.cmd ci`.
4. Run `npm.cmd run dev`.
5. Open the local address printed in the terminal.

If the old starter is already running, stop it with Ctrl+C and restart it. This regenerates the imagery tile indexes.

Use the dropdown or Previous/Next buttons to browse nine layers: aerial image, study area, development site, footprints, green space, water, AHN image, existing 3D buildings, and proposed complex. Each overlay has the saved study-area aerial image underneath. Reset view returns to the supplied study area.

## Folder structure

```text
src/
  introduction.js             Introduction map, boundaries and background controls
  main.js                     Layers page and loading logic
  layers.js                   Layer titles, file paths, colours
  task47.js                   Land-use scenario controls and rendering
  weather.js                  KNMI dashboard and station map
  weather-charts.js           Weather chart rendering
  demographics.js            Socio-demographic page and controls
  predictions.js             Forecast charts, comparison cards and accuracy controls
  environment.js             Wind/noise selection, legend, statistics and downloads
  morphology.js              Morphology controls, indicator cards and comparison table
  roads.js                   Road-network selection, walking/traffic results and comparison tables
  map/
    study-area.js             Shared study boundary, geographic bounds and camera focus
    basemaps.js               Online OpenStreetMap and PDOK imagery providers
    imagery.js                Shared local imagery reader and study-area background
  morphology/
    map.js                    Scenario buildings, 3D heights and georeferenced overlays
    indicators.js             Indicator definitions, units and scenario building selection
  environment/
    map.js                    Georeferenced overlays, opacity and map interaction
    values.js                 Numeric wind grid decoding and coordinate sampling
  roads/
    map.js                    Routes, destinations, exits and conceptual interventions
    results.js                Walking comparisons and shared traffic line-width scale
  predictions/charts.js      Supplied chart catalogue
  demographics/
    indicators.js             Neighbourhood colours and number formatting
    map.js                    Neighbourhood boundaries and map interaction
  ui/
    navigation.js             Shared page links, focus button and current-page indicator
  styles/
    shared.css                Layout, navigation, typography and controls
    introduction.css          Introduction panel and Map/Satellite control
    layers.css                Layer browser controls
    scenarios.css             Scenario controls, metrics and legend
    weather.css               Weather cards, charts and tables
    demographics.css          Neighbourhood cards, charts and map legend
    predictions.css           Forecast chart stage, cards and result tables
    environment.css           Analysis controls, legend and wind statistics
    morphology.css            Morphology controls, cards and comparison table
    roads.css                 Road-network controls, legends, cards and tables
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
    elevation/study-area/    Full study-area AHN DTM GeoTIFF, image and geographic metadata
    background/luchtfoto/    Original clipped aerial export, preserved
    background/study-area/   Saved PDOK aerial tiles covering the full study polygon
    buildings/study-area/    Full study-area subset of municipal LoD2 3D Tiles
    landUse/study-area-layers/ Current BAG/BGT polygons for the Layers page
    demographics/            Two-neighbourhood CBS data, chart images and provenance
    predictions/             Task 4.4b charts, CSVs, summary and original archive
    environment/             Task 4.5 overlays, wind values, GeoTIFFs and source figures
    morphology/              Task 4.3 overlays, buildings, indicators, PDFs and original ZIP
    roads/                   Task 4.8 networks, comparison figures, summary and original ZIP
  cesiumStatic/              Generated Cesium supporting files
  ASSETS.md                  Sources and replacement instructions
  downloads/study_area.geojson Downloadable WGS 84 boundary for future exports
  task47/                    Land-use scenarios and model summaries
server/                      KNMI API, parsing and Vite middleware
tests/                       Weather parsing and API tests
scripts/
  copy-cesium-assets.js       Copies Cesium's supporting files
  index-imagery.js            Lists available tiles in the clipped exports
  prepare-assets.js          Runs both preparation steps
  prepare-demographics.py    Prepares the supplied two-neighbourhood archive
  prepare-predictions.py     Imports the supplied task 4.4b result archive
  prepare-wind-noise.py      Imports task 4.5 results and restores geographic coordinates
  prepare-morphology.py      Imports the supplied task 4.3 archive without recalculation
  prepare-roads.py           Imports the supplied task 4.8 networks and comparison results
  prepare-study-imagery.py   Downloads and clips the study-area aerial background
  prepare-study-layers.py    Downloads, filters and clips BAG, BGT and AHN display data
  prepare-study-buildings.py Saves a local spatial subset of Rotterdam's LoD2 buildings
  sample-wind.py             Samples OpenFOAM horizontal slices using ParaView's Python
dist/                        Generated website for hosting
```

## Build

Run `npm.cmd run build` to create dist, then `npm.cmd run preview` to preview the build. Building does not publish anything. All study data is included in dist. The present configuration expects deployment at the website root; subfolder deployment requires adjusting the asset URLs.

Run `npm.cmd run test:weather` for the weather parsing and API tests.
Run `npm.cmd run test:environment` for wind sampling, data registration and noise metadata checks.
Run `npm.cmd run test:morphology` for morphology registration, building replacement and indicator checks.
Run `node --test tests/scenarios.test.mjs` for scenario visibility, green roofs and rapid switching.
Run `npm.cmd run test:layers` for refreshed layer coverage, elevation registration and local 3D Tiles checks.
Run `npm.cmd run test:roads` for source distances, traffic units, interventions and page switching.

The dataset exports do not include complete provider/licence details. Add the original source attribution before public deployment.
