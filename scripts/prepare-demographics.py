import argparse
import csv
import io
import json
from pathlib import Path
from zipfile import ZipFile


def prepare(archive_path):
    destination = Path(__file__).resolve().parents[1] / "public/data/demographics"
    prefix = "Socio-Demographic Data/"
    with ZipFile(archive_path) as archive:
        csv_text = archive.read(
            prefix + "CBS excel table/Delfshaven_Schiemond_CBS_2025.csv"
        ).decode("utf-8-sig")
        rows = list(csv.DictReader(io.StringIO(csv_text)))
        collection = json.loads(archive.read(
            prefix + "GeoJSON/CBS_Delfshaven_Schiemond_2025_Cesium.geojson"
        ))
        chart_names = [
            "01_age_structure.png",
            "02_household_composition.png",
            "03_housing_tenure.png",
            "04_accessibility.png",
            "05_woz.png",
            "06_social_assistance.png",
        ]
        charts = {
            name: archive.read(prefix + "Charts/CBS_Images/" + name)
            for name in chart_names
        }

    expected_codes = {"BU05990320", "BU05990329"}
    if {row["cbs_code"] for row in rows} != expected_codes or len(rows) != 2:
        raise ValueError("Expected the two supplied CBS neighbourhoods")
    if len(collection["features"]) != 2:
        raise ValueError("Expected two neighbourhood geometries")

    for feature in collection["features"]:
        properties = feature["properties"]
        row = next(row for row in rows if row["cbs_code"] == properties["buurtcode"])
        for key, value in properties.items():
            if key in row and isinstance(value, (int, float)):
                if value != float(row[key]):
                    raise ValueError(f"Conflicting value for {row['buurt']}: {key}")

        geometry = feature["geometry"]
        if geometry["type"] != "MultiLineString":
            raise ValueError("Expected the supplied closed boundary lines")
        polygons = []
        for ring in geometry["coordinates"]:
            if len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError("Neighbourhood boundary is not closed")
            if any(not (-180 <= lon <= 180 and -90 <= lat <= 90) for lon, lat in ring):
                raise ValueError("Expected longitude/latitude coordinates")
            signed_area = sum(
                first[0] * second[1] - second[0] * first[1]
                for first, second in zip(ring, ring[1:])
            )
            polygons.append([ring if signed_area > 0 else list(reversed(ring))])
        feature["id"] = properties["buurtcode"]
        feature["geometry"] = {"type": "MultiPolygon", "coordinates": polygons}
        for key in ("stroke", "stroke-width", "stroke-opacity"):
            properties.pop(key, None)

    destination.mkdir(parents=True, exist_ok=True)
    chart_directory = destination / "charts"
    chart_directory.mkdir(exist_ok=True)
    for name, content in charts.items():
        (chart_directory / name).write_bytes(content)
    (destination / "neighbourhoods.geojson").write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    with (destination / "cbs-2025.csv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Prepared {len(rows)} neighbourhoods in {destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare the supplied CBS neighbourhood exports")
    parser.add_argument("archive", type=Path)
    prepare(parser.parse_args().archive)
