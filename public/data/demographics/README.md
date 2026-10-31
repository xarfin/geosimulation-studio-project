# CBS neighbourhood data

Source: the supplied `Socio-Demographic Data-20261022T163054Z-1-001.zip`.
The committed ZIP is a reduced copy retaining the two-neighbourhood exports,
charts, comparison workbook, chart script, and supporting tables. It excludes
the unused national GeoPackage, its duplicate nested ZIP, and national
`kwb 2025.xlsx` workbook. All retained files are unchanged. The original full
archive is kept locally in the Git-ignored `local-data-backups/` directory when
available; it is not required to run, build, or regenerate the dashboard.
The application contains only Delfshaven (BU05990320) and Schiemond (BU05990329),
Rotterdam, from CBS Kerncijfers wijken en buurten 2025 and Wijk- en Buurtkaart
2025 v1. Figures cover the complete neighbourhoods.

CBS source: https://www.cbs.nl/nl-nl/maatwerk/2026/42/kerncijfers-wijken-en-buurten-2025

`neighbourhoods.geojson` preserves the values from the supplied
`CBS_Delfshaven_Schiemond_2025_Cesium.geojson`. Its closed MultiLineString
boundaries are converted to filled MultiPolygons in longitude/latitude, with
counterclockwise exterior rings. The boundaries were checked against the
archive's EPSG:28992 GeoPackage after reprojection to EPSG:4326.

`cbs-2025.csv` contains the supplied two-row CBS table. Numeric values agree
with the GeoJSON and the `CBS_2025` sheet in the supplied comparison workbook;
the selected indicators were also checked against the archive's national
`kwb 2025.xlsx` table.

The six PNG files in `charts/` are copied unchanged from the archive's
`Charts/CBS_Images/` folder. The dashboard displays these original images and
links to full-size copies. Their age and household shares use the sum of the
listed categories, matching the supplied chart script. Rounded CBS counts can
differ from the published population or household totals. WOZ values in the
source table and image are in thousands of euros. Social assistance is a number
of benefits. Service distances are kilometres. Housing corporation ownership is
a percentage of the total housing stock.

Regenerate these files from the project root:

```powershell
python scripts/prepare-demographics.py 'Socio-Demographic Data-20261022T163054Z-1-001.zip'
```

The preparation script needs only Python's standard library and works with
either the reduced or original ZIP. The national-source checks described above
were performed against the original archive. The source ZIP is not copied into
the website build.
