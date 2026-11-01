# Project assets

These files were extracted from the nine ZIP exports in the supplied CesiumJS_assets folder. The source archives were left unchanged. Keep all files within a tileset or imagery folder together.

| Source archive | Project folder | Format |
| --- | --- | --- |
| Proposed_complex.zip | models/proposed-complex | Georeferenced 3D Tiles |
| 3D Rotterdam.zip | data/buildings/rotterdam | Georeferenced 3D Tiles |
| BuildingsGJ.zip | data/landUse/buildings | GeoJSON |
| DevelopmentSiteGJ.zip | data/landUse/development-site | GeoJSON |
| GreenGJ.zip | data/landUse/green | GeoJSON |
| StudyAreaGJ.zip | data/landUse/study-area | GeoJSON |
| WaterGJ.zip | data/landUse/water | GeoJSON |
| AHN_DTM_0,5m.zip | data/elevation/ahn | TMS PNG image tiles |
| Luchtfoto_clipped.zip | data/background/luchtfoto | TMS PNG image tiles |

## Replacing files

Replace a GeoJSON layer's doc.geojson with valid longitude/latitude GeoJSON (CRS84). For imagery or 3D Tiles, replace the whole corresponding dataset folder with the new unpacked export, preserving tiles.json or tileset.json and its relative file structure. Do not overlay a new export on an old folder: old tiles might remain. Keep a backup of the previous version before replacement.

If filenames or folder names change, update src/layers.js. Stop and restart npm.cmd run dev after replacing files. This regenerates available-tiles.json for imagery. Refresh the browser to clear the current loaded scene. A production copy needs npm.cmd run build and a new deployment.

The imagery reader expects the supplied export format: Web Mercator TMS PNG tiles and a tiles.json with bounds and zoom levels. Other formats require a different loader or conversion.

## Elevation and placement

AHN is supplied as rendered image tiles, not a height field or quantized-mesh terrain. This viewer does not infer heights from those colours and does not offer numeric elevation sampling. No colour-to-height legend was included.

The 3D models retain their exported transforms and height coordinates. No manual shifts, scale changes, terrain adjustments, or datum corrections are applied. Their placement has not been validated against surveyed control points.

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

## Shared work

Commit the source files, package.json, package-lock.json, and the project data/models to your shared repository. node_modules, dist, cesiumStatic, and generated imagery indexes are recreated locally and excluded from Git. The imagery contains thousands of small files; keep that size in mind when selecting hosting.

This app does not use Cesium ion or external map services. Dataset credit labels identify the supplied exports only; add the original providers and required attribution before publishing. No GitHub repository or public deployment has been created by this setup.
