# Task 4.4a — KNMI weather dashboard

This update adds `/weather.html` to your existing Rotterdam Cesium application.
It keeps the layer viewer, task 4.7 page and local map assets, and adds navigation between the pages.

## Install the update

1. Stop the current Vite server with Ctrl+C.
2. Extract `rotterdam-cesium-weather-update.zip`.
3. Copy the CONTENTS of its `update` folder into `C:\Users\user\Downloads\rotterdam-cesium`.
   Merge the folders and replace matching files. Keep the existing `public` and `node_modules` folders.
   The update contains no replacement map assets and no `.env.local` file.
4. Open the existing `.env.local` in the application folder (create it if absent).
   Preserve its other entries and add:

   ```dotenv
   KNMI_EDR_API_KEY=your_actual_knmi_edr_key
   ```

   Use your EDR key, without a `VITE_` prefix. Never add this key to a source file,
   notebook output, browser URL or shared screenshot. The server reads this key;
   the browser receives observations only.
5. In PowerShell:

   ```powershell
   cd "$env:USERPROFILE\Downloads\rotterdam-cesium"
   npm.cmd run dev
   ```

6. Open the Local address printed by Vite, with `/weather.html` appended.
   Example: `http://127.0.0.1:5173/weather.html`.

No new npm dependency is needed. On a new computer, install existing dependencies
with `npm.cmd ci` first. Use Node.js 22.12+ or 24; the supplied project uses Vite 8.

## What to check with your key

- Temperature, wind speed and wind-from direction show values, with separate times.
- The station/site button shows the actual airport location and study-area centre.
- The map shows the local aerial background, study and development boundaries, and the airport station marker.
- The 24-hour temperature and wind charts update automatically every ten minutes while open.
- Historical summaries initially show 2025; year selection can also show the two preceding years.
- The 2025 December table should show 31/31 days if KNMI returns the same complete data as your notebook.
- At least 80% of daily observations are needed for each monthly mean. Otherwise that variable shows “Insufficient data”.
- With no key, the page shows a setup message. With a connection error, it shows an error, or clearly labels retained observations.

“Recent” means all displayed available readings are at most 30 minutes old.
This is our interface threshold, not a KNMI quality flag. Readings are not treated
as current simply because a request succeeded. Age labels update every minute.

## Build and run

```powershell
npm.cmd run build
npm.cmd run preview
```

The weather API also works in Vite preview. For a built application without Vite:

```powershell
npm.cmd run build
npm.cmd start
```

This runs the built pages and weather API at `http://127.0.0.1:4173` using Node.
Keep `.env.local` at the project root. `npm start` requires a current Node version
with `process.loadEnvFile` (Node 22.12+ or 24).

Copying only `dist` onto static hosting will not provide `/api/weather/*`.
For an online deployment, host the Node server with its KNMI secret, or port the
fixed weather endpoints to the target host's server functions. No deployment is
included in this local update.

## Data logic and interpretation

Station: Rotterdam Airport 344, WIGOS `0-20000-0-06344`, 4.4469° E, 51.9606° N.
The distance displayed is calculated from the centre of your supplied study boundary.
The local aerial covers the study area only; outside that export, the regional view
uses the neutral globe surface. No additional external basemap or ion token is required.

Live collection: `10-minute-in-situ-meteorological-observations`.
`ta` is a 1-minute mean in °C, `ff` a preceding 10-minute mean in m/s representative
of 10 m height, and `dd` the wind-from direction in degrees. Missing values stay null.
Each card uses its latest VALID reading and shows that reading's time; different
variables may therefore have different times. A speed below 0.5 m/s in the same
record is labelled calm instead of interpreting a direction. This is our display
convention, not a source quality flag. The map pop-up preserves the numeric direction.

Historical collection: `daily-in-situ-meteorological-observations-validated`.
`TG` and `FG` are already °C and m/s. These EDR fields must NOT be divided by ten
(unlike the old KNMI text-download fields). Each daily end timestamp is shifted
back one UTC day before assigning the record to a month. The mean uses the available
daily means, separately per variable. Counts use all calendar days, including leap
February. One year is descriptive weather history, not a climate normal or trend.

The backend limits requests to the fixed KNMI station, fixed collections and
approved variables. It validates CoverageJSON array dimensions before parsing,
merges fields by observation time, shares concurrent requests, and caches successful
live responses for ten minutes and historical responses for 24 hours. A failed
refresh can return the prior cache only with an explicit upstream-error flag.
Caches are in memory and are lost on server restart. There is no background polling
after all browser pages close. Do not use a scheduled automation for this page refresh.

Airport observations represent regional conditions, not the wind between the
proposed buildings or temperatures inside the development. Relate them to the
wind modelling in task 4.5; they do not quantify a design's local effects.

## Validation

Run `npm.cmd run test:weather` for parser, date assignment, missing-value,
coverage, API routing, cache, failed-update and credential-redaction checks.
Run `npm.cmd run build` to check all three application pages.
The delivered update has been checked with controlled test responses; the live
authenticated connection still needs your local key when you run it.

## Sources

- https://developer.dataplatform.knmi.nl/edr-api
- https://dataplatform.knmi.nl/dataset/docs/10-minute-in-situ-meteorological-observations-1-0
- https://dataplatform.knmi.nl/dataset/docs/daily-in-situ-meteorological-observations-validated-1-0

Map asset credits remain those of your original application. Add the original
provider/licence details before public release.
