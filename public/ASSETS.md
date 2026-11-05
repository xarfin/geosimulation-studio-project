# Project assets

These files were extracted from the nine ZIP exports in the supplied CesiumJS_assets folder. The source archives were left unchanged. Keep all files within a tileset or imagery folder together.

| Source archive | Project folder | Format |
| --- | --- | --- |
| Proposed_complex.zip | models/proposed-complex | Georeferenced 3D Tiles |
| BuildingsGJ.zip | data/landUse/buildings | GeoJSON |
| DevelopmentSiteGJ.zip | data/landUse/development-site | GeoJSON |
| GreenGJ.zip | data/landUse/green | GeoJSON |
| StudyAreaGJ.zip | data/landUse/study-area | GeoJSON |
| WaterGJ.zip | data/landUse/water | GeoJSON |
| AHN_DTM_0,5m.zip | data/elevation/ahn | TMS PNG image tiles |
| Luchtfoto_clipped.zip | data/background/luchtfoto | TMS PNG image tiles |

The unused original `data/buildings/rotterdam/` export has been removed. Layers and Task 4.7 use the current models in `data/buildings/study-area/`.

## Replacing files

Replace a GeoJSON layer's doc.geojson with valid longitude/latitude GeoJSON (CRS84). For imagery or 3D Tiles, replace the whole corresponding dataset folder with the new unpacked export, preserving tiles.json or tileset.json and its relative file structure. Do not overlay a new export on an old folder: old tiles might remain. Keep a backup of the previous version before replacement.

If filenames or folder names change, update src/layers.js. Stop and restart npm.cmd run dev after replacing files. This regenerates available-tiles.json for imagery. Refresh the browser to clear the current loaded scene. A production copy needs npm.cmd run build and a new deployment.

The imagery reader expects the supplied export format: Web Mercator TMS PNG tiles and a tiles.json with bounds and zoom levels. Other formats require a different loader or conversion.

## Saved study-area aerial imagery

`data/background/study-area/` contains a local extract of PDOK's `2026_orthoHR` RGB aerial imagery.
The source is Beeldmateriaal Nederland, distributed by PDOK under CC BY 4.0:
https://www.beeldmateriaal.nl/ and https://creativecommons.org/licenses/by/4.0/.
The WMS endpoint is https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0.

`scripts/prepare-study-imagery.py` requests a small set of aligned EPSG:3857 image blocks, clips their
alpha to `data/landUse/study-area/doc.geojson`, and builds transparent 256 px TMS tiles from zoom
9 through 19. At the site, the maximum-zoom pixels represent approximately 18 cm on the ground;
the source photography is higher resolution. `tiles.json` records the exact geographic bounds,
source layer, extraction date and attribution. Every map page uses this extract. Introduction keeps
the online PDOK service underneath for the surroundings; other pages load their backgrounds locally.

The original `data/background/luchtfoto/` export is preserved. Regenerate the new extract with
`python scripts/prepare-study-imagery.py` (Pillow, NumPy and rasterio required). Original downloaded
blocks and a preview are cached in the ignored `local-data-backups/study-area-imagery/` folder.

## Elevation and placement

The original `data/elevation/ahn/` export contains rendered image tiles without a height field or
colour legend. It is preserved. The Layers page instead uses the full-boundary AHN crop described
below. The app displays ground heights as an image over the ellipsoid; it does not generate terrain
geometry from these colours.

The 3D models retain their exported transforms and height coordinates. No manual shifts, scale changes, terrain adjustments, or datum corrections are applied. Their placement has not been validated against surveyed control points.

## Full study-area display layers

`data/landUse/study-area-layers/` contains current BAG building footprints and BGT vegetated-ground
and water polygons clipped to the study boundary. BAG comes from
`https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items`; BGT comes from the
`begroeidterreindeel` and `waterdeel` collections under `https://api.pdok.nl/kadaster/bgt/ogc/v1/`.
The importer follows every pagination link, excludes ended BGT records, and keeps physical BAG
building statuses. Duplicate source identifiers are removed. Its summary records counts and sources.
Clipping uses EPSG:28992; browser GeoJSON is transformed back to WGS 84.

`data/elevation/study-area/ground-elevation.tif` is the AHN `dtm_05m` ground-height coverage from
`https://service.pdok.nl/rws/ahn/wcs/v1_0`, clipped to the study area at its native 0.5 m resolution in
EPSG:28992. Pixel values are metres NAP. `ground-elevation.png` is reprojected to EPSG:4326 for the
map, with no-data pixels transparent. `metadata.json` records its image bounds, colour scale,
height range and source. Method and Sources describes the image's -2 to 10 m colour scale. The original measured
values remain in the downloadable GeoTIFF. Heights are not inferred from the displayed colours.

`data/buildings/study-area/` is a saved subset of the municipal LoD2 3D Tiles service linked from
`https://www.rotterdam.nl/rotterdam-in-3d`. Its root source is
`https://www.3drotterdam.nl/datasource-data/8b5d0ded-a222-4e44-bc70-2992bc2192fc/tileset.json`.
Only tile branches intersecting the study polygon are retained. Models keep their full geometry,
embedded glTF, transforms and original height coordinates. The saved hierarchy uses relative
local paths. On Layers and Task 4.7, an inverted Cesium clipping polygon restricts their display to the same study
boundary used to clip the aerial image. Geometry outside the image is hidden at every tile detail
level. `source.json` records provenance, tile count, size and download selection rules.

`combined-tileset.json` adds a local supplement from 3DBAG under `gaps/`. The importer compares
current BAG footprints with all saved municipal tile identifiers, requests only absent identifiers
from `https://api.3dbag.nl/collections/pand/items/NL.IMBAG.Pand.<identifier>`, and converts available
CityJSON LoD2.2 roof and wall surfaces to embedded glTF in 3D Tiles. Horizontal coordinates are
transformed from EPSG:28992 to WGS 84; the original NAP heights are retained for the app's flat
base. The source metadata records included identifiers, unavailable models and request failures.
No model is invented where the source has none. 3DBAG is distributed under CC BY 4.0:
https://docs.3dbag.nl/en/ and https://creativecommons.org/licenses/by/4.0/.

Layers and Task 4.7 share this combined model. Scenario A and B add the development boundary
as a clipping hole to hide old buildings under the new allocation. Satellite only hides every model
and GeoJSON overlay. This does not alter the original analysis inputs or scenario outputs.

Regenerate with `scripts/prepare-study-layers.py`, `scripts/prepare-study-buildings.py`, then
`python scripts/prepare-building-gaps.py` (pyproj plus Node and the project's Cesium dependency). Source
responses are cached under the ignored `local-data-backups/` directory. These refreshed display
layers do not replace the input geometry or results supplied for the separate analysis tasks.

## Wind and noise results (task 4.5)

`data/environment/` is derived from `4.5 Wind and Noise simulation-20261101T154518Z-1-001.zip`.
Wind uses the final saved `U` fields: baseline 741, Design A 776 and Design B 774.
The cases document `local = EPSG:28992 source - (90980, 435560, 0)`. A horizontal
slice at 1.5 m is sampled after cell-to-point interpolation and transformed to
EPSG:4326. The PNGs and little-endian float32 grids have identical extents and
dimensions; NaN represents missing data, including building interiors. The
GeoTIFFs retain the numeric speeds in m/s. All displayed overlays are clipped to
the supplied study boundary. Site statistics use the 2 m source grid inside the
development boundary, excluding building interiors, so open-air sample counts
differ between designs. A 2 m sample spacing does not imply a uniform 2 m CFD mesh.

Noise is an image overlay derived from `Output_Noise_Simulation.png`. Axis ticks
were used to place its map rectangle under an inferred EPSG:3857 coordinate
system, then checked against the supplied footprints. The source does not state
its CRS, so the interface labels the alignment approximate. The original
`Lw (dB)` scale (0–9) is preserved; the app does not infer dB(A), a noise metric,
receiver height or numeric readings from those colours. There is one supplied
noise image, not a separate result for each design. The unchanged source image
and three wind PDFs are in `sources/`; `summary.json` records the conversion.

## Urban morphology results (task 4.3)

`data/morphology/` imports `4.3-20261101T154521Z-1-001.zip` without recalculating
the supplied analysis. Nine PNG overlays use `overlays_rectangles.json` in
EPSG:4326. SVF uses the source's reversed Blues scale, 0–1; the H/W proxy uses
Oranges, 0–3, saturated above 3. PNG alpha is preserved. Original numeric rasters
are absent; area summaries come directly from the six rows of `indicators.csv`.
The source analysis uses EPSG:28992, 1 m grid spacing, an observer at 1.5 m,
36 azimuths and a 150 m sky-view search radius. H/W is nearest-building height
divided by twice the building distance, limited to open cells within 30 m.

The baseline GeoJSON has 502 existing features, three marked `cleared_in_designs`.
Design views retain the other 499 and add six proposed features (five housing
buildings and one indoor sports building). Geographic coordinates and heights
are preserved; extrusions use relative heights above a flat zero-height base.
Green share is the union of ground vegetation and canopy, excluding buildings;
green roofs are separate and reported by the source only for the development
site. Whole-study-area roof totals are not displayed.
Six original PDFs are in `figures/`. `task43-source.zip` preserves the entire
archive, including GIS packages and source scripts. Reimport with
`scripts/prepare-morphology.py` using only Python's standard library.

Task 4.3 now displays `study-area.geojson`, the intersection of its original analysis boundary
and the current satellite boundary. `analysis-area.geojson` preserves the source Study Area layer
from `4.1 Area, Massing, Cesium2.zip` / `qgis/Study_Area_Package.gpkg` in WGS 84. This is the same
layer read by the supplied morphology analysis script. `coverage.json` records provenance and areas.
The globe is clipped to this polygon, and `clipped/` contains matching display-only copies of the
three building layers. Original overlays, footprints, heights and CSV results remain available on disk.
The cards use the supplied development-site statistics; the area selector and full table were removed.
Regenerate this display crop with `python scripts/prepare-morphology-area.py` (pyproj and Shapely).
For the flat ellipsoid, a Cesium 1.146 workaround skips neighbour-height propagation into fill tiles
at clipped edges. Satellite tiles and result images use their original loaders and pixels.

## Shared work

Commit the source files, package.json, package-lock.json, and the project data/models to your shared repository. node_modules, dist, cesiumStatic, and generated imagery indexes are recreated locally and excluded from Git. The imagery contains thousands of small files; keep that size in mind when selecting hosting.

Cesium and the study-area datasets are served locally. Introduction uses online OpenStreetMap and
PDOK services for its wider backgrounds, and the KNMI dashboard requests weather data online.
Saved PDOK and municipal display layers include their source information; original supplied exports
retain their existing credit labels. Public deployment is separate from the local build workflow.
