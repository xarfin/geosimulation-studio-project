import gzip
import json
import math
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.transform import array_bounds
from rasterio.warp import Resampling, calculate_default_transform, reproject
from shapely import make_valid
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
CACHE = ROOT / 'local-data-backups/study-layers' / datetime.now(timezone.utc).strftime('%Y-%m-%d')
BAG = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items'
BGT = 'https://api.pdok.nl/kadaster/bgt/ogc/v1/collections'
AHN = 'https://service.pdok.nl/rws/ahn/wcs/v1_0'
EXISTING_STATUSES = {'Pand in gebruik', 'Pand in gebruik (niet ingemeten)', 'Pand in aanbouw',
                     'Sloopvergunning verleend', 'Verbouwing pand', 'Pand buiten gebruik'}
HEIGHT_COLOURS = ['#245e7a', '#6ba6a7', '#bdd3b0', '#f1e8b1', '#d9ad74', '#b47c4d', '#794b35']


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n', encoding='utf-8')


def download(url, name):
    destination = CACHE / name
    if destination.exists():
        return destination.read_bytes()
    request = urllib.request.Request(url, headers={'User-Agent': 'SchiehavenNoordStudy/1.0'})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read()
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return data


def download_features(endpoint, bounds, name):
    query = urllib.parse.urlencode({'bbox': ','.join(map(str, bounds)), 'limit': 1000, 'f': 'json'})
    url = endpoint + '?' + query
    features = []
    page = 1
    visited = set()
    while url:
        if url in visited:
            raise ValueError(f'Repeated pagination link for {name}')
        visited.add(url)
        payload = json.loads(download(url, f'{name}-{page}.json'))
        features.extend(payload['features'])
        url = next((link['href'] for link in payload['links'] if link['rel'] == 'next'), None)
        page += 1
    print(f'{name}: downloaded {len(features)} source features.', flush=True)
    return features


def polygon_parts(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry]
    if geometry.geom_type in {'MultiPolygon', 'GeometryCollection'}:
        return [polygon for part in geometry.geoms for polygon in polygon_parts(part)]
    return []


def prepare_vectors(study, to_rd, to_geo):
    sources = [
        ('buildings', BAG, ['identificatie', 'bouwjaar', 'status', 'gebruiksdoel', 'aantal_verblijfsobjecten']),
        ('green', BGT + '/begroeidterreindeel/items', ['lokaal_id', 'fysiek_voorkomen', 'plus_fysiek_voorkomen', 'status', 'bronhouder']),
        ('water', BGT + '/waterdeel/items', ['lokaal_id', 'type', 'plus_type', 'status', 'bronhouder']),
    ]
    study_rd = transform(to_rd, study)
    summary = {}
    for name, endpoint, fields in sources:
        features = download_features(endpoint, study.bounds, name)
        clipped = []
        identifiers = set()
        for feature in features:
            properties = feature['properties']
            if name == 'buildings' and properties.get('status') not in EXISTING_STATUSES:
                continue
            if properties.get('eind_registratie') or properties.get('termination_date'):
                continue
            identifier = properties.get('identificatie') or properties.get('lokaal_id') or feature['id']
            if identifier in identifiers:
                continue
            geometry = make_valid(transform(to_rd, shape(feature['geometry']))).intersection(study_rd)
            parts = polygon_parts(geometry)
            if not parts or sum(part.area for part in parts) < 0.01:
                continue
            geometry = parts[0] if len(parts) == 1 else MultiPolygon(parts)
            clipped.append({
                'type': 'Feature', 'id': str(identifier),
                'properties': {field: properties.get(field) for field in fields},
                'geometry': mapping(transform(to_geo, geometry)),
            })
            identifiers.add(identifier)
        if not clipped:
            raise ValueError(f'No current polygon features found for {name}')
        collection = {'type': 'FeatureCollection', 'name': f'study-area-{name}', 'features': clipped}
        write_json(PUBLIC / f'data/landUse/study-area-layers/{name}.geojson', collection)
        summary[name] = {'count': len(clipped), 'source': endpoint}
        print(f'{name}: saved {len(clipped)} current features clipped to the full study polygon.', flush=True)
    return summary


def prepare_elevation(study, to_rd):
    study_rd = transform(to_rd, study)
    west, south, east, north = study_rd.bounds
    bounds = [math.floor(west), math.floor(south), math.ceil(east), math.ceil(north)]
    query = urllib.parse.urlencode([
        ('SERVICE', 'WCS'), ('VERSION', '2.0.1'), ('REQUEST', 'GetCoverage'),
        ('COVERAGEID', 'dtm_05m'), ('FORMAT', 'image/tiff'),
        ('SUBSET', f'x({bounds[0]},{bounds[2]})'), ('SUBSET', f'y({bounds[1]},{bounds[3]})'),
    ])
    print('Downloading AHN ground elevation at its native 0.5 m resolution.', flush=True)
    source_bytes = download(AHN + '?' + query, 'ahn-dtm-05m.tif')
    output = PUBLIC / 'data/elevation/study-area'
    output.mkdir(parents=True, exist_ok=True)
    with rasterio.MemoryFile(source_bytes) as memory, memory.open() as source:
        if source.crs.to_epsg() != 28992 or not np.allclose(source.res, (0.5, 0.5)):
            raise ValueError(f'Unexpected AHN grid: {source.crs}, {source.res}')
        data = source.read(1, masked=True).astype('float32').filled(np.nan)
        inside = geometry_mask([mapping(study_rd)], data.shape, source.transform, invert=True)
        data[~inside] = np.nan
        data[~np.isfinite(data) | (np.abs(data) > 1000)] = np.nan
        if not np.isfinite(data).any():
            raise ValueError('The AHN crop has no valid heights')
        profile = source.profile.copy()
        profile.update(driver='GTiff', count=1, dtype='float32', nodata=np.nan, compress='deflate')
        with rasterio.open(output / 'ground-elevation.tif', 'w', **profile) as destination:
            destination.write(data, 1)

        grid, width, height = calculate_default_transform(source.crs, 'EPSG:4326', source.width, source.height, *source.bounds)
        geographic = np.full((height, width), np.nan, dtype='float32')
        reproject(data, geographic, src_transform=source.transform, src_crs=source.crs, src_nodata=np.nan,
                  dst_transform=grid, dst_crs='EPSG:4326', dst_nodata=np.nan, resampling=Resampling.bilinear)
        geographic[~geometry_mask([mapping(study)], (height, width), grid, invert=True)] = np.nan
        minimum, maximum = -2, 10
        stops = np.linspace(minimum, maximum, len(HEIGHT_COLOURS))
        colours = np.array([[int(colour[index:index + 2], 16) for index in (1, 3, 5)] for colour in HEIGHT_COLOURS])
        pixels = np.zeros((height, width, 4), dtype=np.uint8)
        valid = np.isfinite(geographic)
        for channel in range(3):
            pixels[:, :, channel][valid] = np.interp(geographic[valid], stops, colours[:, channel]).astype(np.uint8)
        pixels[:, :, 3][valid] = 255
        Image.fromarray(pixels).save(output / 'ground-elevation.png', optimize=True)
        metadata = {
            'bounds': list(array_bounds(height, width, grid)), 'width': width, 'height': height,
            'source': AHN, 'coverage': 'dtm_05m', 'sourceCrs': 'EPSG:28992',
            'nativeResolutionMetres': 0.5, 'units': 'm NAP',
            'minimumHeight': float(np.nanmin(data)), 'maximumHeight': float(np.nanmax(data)),
            'colourScale': {'minimum': minimum, 'maximum': maximum, 'colours': HEIGHT_COLOURS},
            'downloadedAt': datetime.now(timezone.utc).isoformat(),
        }
        write_json(output / 'metadata.json', metadata)
    print(f'AHN: saved numeric GeoTIFF and {width} x {height} geographic image.', flush=True)
    return metadata


def main():
    study_file = PUBLIC / 'data/landUse/study-area/doc.geojson'
    collection = json.loads(study_file.read_text(encoding='utf-8'))
    study = make_valid(unary_union([shape(feature['geometry']) for feature in collection['features']]))
    to_rd = Transformer.from_crs(4326, 28992, always_xy=True).transform
    to_geo = Transformer.from_crs(28992, 4326, always_xy=True).transform
    summary = prepare_vectors(study, to_rd, to_geo)
    summary['elevation'] = prepare_elevation(study, to_rd)
    summary['downloadedAt'] = datetime.now(timezone.utc).isoformat()
    summary['studyBoundary'] = '/data/landUse/study-area/doc.geojson'
    write_json(PUBLIC / 'data/landUse/study-area-layers/summary.json', summary)
    write_json(PUBLIC / 'downloads/study_area.geojson', {
        'type': 'FeatureCollection', 'name': 'Schiehaven Noord study area',
        'features': [{'type': 'Feature', 'properties': {'name': 'Schiehaven Noord study area'}, 'geometry': mapping(study)}],
    })


if __name__ == '__main__':
    main()
