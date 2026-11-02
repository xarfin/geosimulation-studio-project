import argparse
import json
import sqlite3
import zipfile
from pathlib import Path

from pyproj import Transformer
from shapely import from_wkb, make_valid
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/data/morphology'
TO_GEO = Transformer.from_crs(28992, 4326, always_xy=True).transform
TO_RD = Transformer.from_crs(4326, 28992, always_xy=True).transform


def read_json(file):
    return json.loads(file.read_text(encoding='utf-8'))


def write_json(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(data, ensure_ascii=False) + '\n', encoding='utf-8')


def collection(geometry, properties):
    return {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'properties': properties, 'geometry': mapping(geometry)},
    ]}


def polygon_parts(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [polygon for part in getattr(geometry, 'geoms', []) for polygon in polygon_parts(part)]


def read_analysis_area(archive_path):
    with zipfile.ZipFile(archive_path) as archive:
        package = next(name for name in archive.namelist() if name.endswith('/Study_Area_Package.gpkg'))
        with sqlite3.connect(':memory:') as database:
            database.deserialize(archive.read(package))
            crs = database.execute('SELECT srs_id FROM gpkg_geometry_columns WHERE table_name = ?', ('Study Area',)).fetchone()[0]
            if crs != 28992:
                raise ValueError('Expected the supplied study polygon in EPSG:28992.')
            geometries = []
            for (blob,) in database.execute('SELECT geom FROM "Study Area"'):
                # Skip the GeoPackage header and coordinate envelope before reading its WKB.
                envelope = (blob[3] >> 1) & 7
                offset = 8 + [0, 32, 48, 48, 64][envelope]
                geometries.append(from_wkb(blob[offset:]))
    area = transform(TO_GEO, unary_union(geometries))
    return collection(area, {'sourceArchive': archive_path.name, 'sourcePackage': package,
                             'sourceLayer': 'Study Area', 'sourceCrs': 'EPSG:28992'})


def prepare(archive_path=None):
    original = OUTPUT / 'analysis-area.geojson'
    if archive_path:
        write_json(original, read_analysis_area(archive_path))
    analysis = read_json(original)
    study = read_json(ROOT / 'public/data/landUse/study-area/doc.geojson')
    analysis_area = unary_union([transform(TO_RD, shape(feature['geometry'])) for feature in analysis['features']])
    study_area = unary_union([transform(TO_RD, shape(feature['geometry'])) for feature in study['features']])
    display_area = analysis_area.intersection(study_area)
    if display_area.is_empty or not display_area.is_valid:
        raise ValueError('The analysis and satellite boundaries have no valid common area.')
    write_json(OUTPUT / 'study-area.geojson', collection(transform(TO_GEO, display_area), {
        'name': 'Task 4.3 data coverage', 'source': 'Original analysis area intersected with the satellite study boundary',
    }))
    counts = {}
    for name in ['buildings_existing.geojson', 'buildings_design_A.geojson', 'buildings_design_B.geojson']:
        data = read_json(OUTPUT / name)
        features = []
        for feature in data['features']:
            clipped = transform(TO_RD, shape(feature['geometry'])).intersection(display_area)
            if clipped.is_empty or clipped.area <= 0:
                continue
            if clipped.geom_type not in ('Polygon', 'MultiPolygon'):
                clipped = unary_union(polygon_parts(clipped))
            geographic = unary_union(polygon_parts(make_valid(transform(TO_GEO, clipped))))
            features.append({**feature, 'geometry': mapping(geographic)})
        write_json(OUTPUT / 'clipped' / name, {**data, 'features': features})
        counts[name] = len(features)
    write_json(OUTPUT / 'coverage.json', {
        'analysisBoundary': 'analysis-area.geojson', 'displayBoundary': 'study-area.geojson',
        'analysisAreaM2': analysis_area.area, 'displayAreaM2': display_area.area,
        'clippedBuildings': counts, 'source': analysis['features'][0]['properties'],
    })
    print(f'Task 4.3 display clipped to {display_area.area:.0f} m² of supplied analysis coverage.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Clip the morphology display to its supplied analysis boundary.')
    parser.add_argument('study_archive', type=Path, nargs='?', help='Original task 4.1 ZIP containing Study_Area_Package.gpkg; omit to reuse the saved boundary.')
    prepare(parser.parse_args().study_archive)
