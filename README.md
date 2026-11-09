# Schiehaven Noord

An interactive study of Schiehaven Noord in Rotterdam, built with CesiumJS and Vite. It brings together maps, 3D buildings and results for land-use scenarios, urban morphology, wind and noise, weather, demographics and road networks. Use the navigation at the top to switch between the nine pages.

## Context

We built this application for the final group project in the Geosimulation course, which uses spatial data and simulation to inform urban design. Our project compares two residential redevelopment layouts for Schiehaven Noord, considering green space, mobility and environmental conditions.

## Open and run

1. Install **Node.js 24** (the version specified in `.node-version`). npm is included with Node.js.
2. Download or clone the complete project, including `public/`, and open the `rotterdam-cesium` folder in VS Code.
3. Open **Terminal > New Terminal**. Run the following from the project folder to install dependencies:

   ```powershell
   npm.cmd ci
   ```

4. For live KNMI weather data, create `.env.local` in the project folder and add your EDR API key. If the file already exists, keep its other settings:

   ```dotenv
   KNMI_EDR_API_KEY=your_knmi_edr_key
   ```

   This is optional for the other pages. The key stays on the server; do not prefix it with `VITE_` or commit `.env.local`. Local map assets do not need a Cesium ion token.

5. Start the app:

   ```powershell
   npm.cmd run dev
   ```

6. Open the local URL printed in the terminal, usually `http://127.0.0.1:5173`. Keep the terminal running; press **Ctrl+C** to stop. Restart after changing `.env.local`.

On macOS or Linux, use `npm` instead of `npm.cmd`. Start the app through Vite rather than opening an HTML file directly. Startup copies Cesium support files and indexes the saved imagery automatically; Python is not needed to run the app.

The saved study-area data and analysis results work locally without internet. Online street maps, satellite imagery outside the saved area and KNMI observations need an internet connection.

## Project folders

| Location | Contents |
| --- | --- |
| `*.html` | The nine page layouts; `index.html` is the introduction and `task47.html` shows land-use scenarios. |
| `src/` | Page logic, shared map helpers, navigation and CSS. Subfolders group code by analysis. |
| `server/` | KNMI weather API, response parsing, caching and Vite integration. |
| `scripts/` | Asset setup, dataset import/preparation tools and the production Node server. Python scripts are only needed to regenerate data. |
| `tests/` | Node tests for weather, map layers, scenarios and analysis results. |
| `public/` | Files served directly: datasets, models and downloads (see below). |
| `local-data-backups/` | Local source downloads, intermediate processing files and backups; excluded from Git and the website build. |
| `node_modules/`, `.vite-cache/`, `dist/` | Installed dependencies, Vite cache and generated production build. |

## Datasets

Paths below are inside `public/`.

| Folder | Data |
| --- | --- |
| `data/background/study-area/` | Saved PDOK aerial imagery for the study area. |
| `data/landUse/` | Study/development boundaries and original land-use exports; `study-area-layers/` holds the current BAG buildings and BGT green/water polygons. |
| `data/elevation/study-area/` | AHN ground elevations as an image, numeric GeoTIFF and metadata. |
| `data/buildings/study-area/` | Local municipal 3D buildings and a 3DBAG supplement. |
| `task47/` | Existing land use, supplied proposal, scenarios A/B, trees, green roofs and summary results. |
| `data/morphology/` | Building layouts, sky-view and height-to-width overlays, indicators and source exports. |
| `data/environment/` | Wind images, numeric grids, GeoTIFFs and the approximately aligned noise image. |
| `data/predictions/` | Saved LSTM forecast charts, CSV results and source archive; no live API required. |
| `data/demographics/` | CBS 2025 data and charts for Delfshaven and Schiemond. The root-level socio-demographic ZIP is the reimport source. |
| `data/roads/` | Current/proposed walking routes, traffic flows, figures and source archive. |
| `downloads/` | Downloadable study-area boundary. |
| `cesiumStatic/` | Cesium support files generated on startup/build. |

`data/background/luchtfoto/` and `data/elevation/ahn/` retain older tile exports. They are no longer displayed, but the startup script still indexes them. `models/proposed-complex/` retains an original model that is not currently loaded by a page. Files under `public/`, including retained originals and archives, are copied into the build.

For dataset provenance and preparation details, see [public/ASSETS.md](public/ASSETS.md) and the [demographic data notes](public/data/demographics/README.md). Each analysis page also explains its methods and sources. The viewer displays prepared analysis results; it does not rerun simulations or train forecasts.

## Build and check

```powershell
npm.cmd run build
npm.cmd run preview
```

This creates `dist/` and serves a local preview, including the weather API. Alternatively, run `npm.cmd start` after building to serve `dist/` and the API with Node. Static hosting of `dist/` alone cannot serve the KNMI API. The current asset URLs expect hosting at the website root.

Run all existing tests with:

```powershell
node --test tests/*.test.mjs
```
