import argparse
import concurrent.futures
import json
import struct
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIRECTORY = ROOT / 'public/data/buildings/study-area'
CACHE = ROOT / 'local-data-backups/missing-buildings-3dbag'
API = 'https://api.3dbag.nl/collections/pand/items/'


def municipal_identifiers():
    identifiers = set()
    for file in MODEL_DIRECTORY.glob('*/*/*.b3dm'):
        data = file.read_bytes()
        _, _, feature_json, feature_binary, batch_json, _ = struct.unpack_from('<6I', data, 4)
        offset = 28 + feature_json + feature_binary
        properties = json.loads(data[offset:offset + batch_json])
        identifiers.update(item['GEBOUWNUMMER'] for item in properties.get('attributes', [])
                           if isinstance(item, dict) and item.get('GEBOUWNUMMER'))
    return identifiers


def download(identifier, cached_only=False):
    file = CACHE / f'{identifier}.json'
    if file.exists():
        return identifier, json.loads(file.read_text(encoding='utf-8'))
    if cached_only:
        return identifier, {'requestError': 'No cached response. Run the importer without --cached-only to retry.'}
    for attempt in range(2):
        try:
            request = urllib.request.Request(API + 'NL.IMBAG.Pand.' + identifier, headers={'User-Agent': 'SchiehavenNoordStudy/1.0'})
            with urllib.request.urlopen(request, timeout=10) as response:
                data = response.read()
            payload = json.loads(data)
            file.write_bytes(data)
            return identifier, payload
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return identifier, None
            if attempt == 1:
                return identifier, {'requestError': f'HTTP {error.code}'}
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == 1:
                return identifier, {'requestError': str(error)}
        time.sleep(attempt + 1)


def main():
    parser = argparse.ArgumentParser(description='Fill municipal 3D building gaps with available 3DBAG models.')
    parser.add_argument('--cached-only', action='store_true', help='Rebuild downloaded models without network requests.')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    footprints = json.loads((ROOT / 'public/data/landUse/study-area-layers/buildings.geojson').read_text(encoding='utf-8'))
    known = municipal_identifiers()
    missing = [feature['id'] for feature in footprints['features'] if feature['id'] not in known]
    to_geo = Transformer.from_crs(28992, 4326, always_xy=True).transform
    buildings = []
    unavailable = []
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for identifier, payload in executor.map(lambda identifier: download(identifier, args.cached_only), missing):
            if payload is None:
                unavailable.append(identifier)
                continue
            if 'requestError' in payload:
                errors.append({'id': identifier, 'error': payload['requestError']})
                continue
            feature = payload['feature']
            encoding = payload['metadata']['transform']
            vertices = [[coordinate * encoding['scale'][axis] + encoding['translate'][axis]
                         for axis, coordinate in enumerate(vertex)] for vertex in feature['vertices']]
            positions = [[*to_geo(x, y), height] for x, y, height in vertices]
            faces = []
            for obj in feature['CityObjects'].values():
                candidates = [geometry for geometry in obj.get('geometry', [])
                              if geometry['type'] == 'Solid' and float(geometry['lod']) > 0]
                if not candidates:
                    continue
                geometry = max(candidates, key=lambda item: float(item['lod']))
                semantics = geometry.get('semantics', {})
                for shell_index, shell in enumerate(geometry['boundaries']):
                    for face_index, rings in enumerate(shell):
                        surface_index = semantics.get('values', [[]])[shell_index][face_index] if semantics.get('values') else None
                        kind = semantics['surfaces'][surface_index]['type'] if surface_index is not None else 'WallSurface'
                        if kind != 'GroundSurface':
                            faces.append({'rings': [[positions[index] for index in ring] for ring in rings], 'kind': kind})
            if faces:
                buildings.append({'id': identifier, 'faces': faces})
                print(f'3DBAG model ready: {identifier}', flush=True)
            else:
                unavailable.append(identifier)
    prepared = CACHE / 'prepared-surfaces.json'
    prepared.write_text(json.dumps({'buildings': buildings, 'unavailable': unavailable, 'requestErrors': errors}), encoding='utf-8')
    subprocess.run(['node', str(ROOT / 'scripts/build-building-gap-tiles.mjs'), str(prepared)], check=True)
    print(f'Filled {len(buildings)} missing buildings; {len(unavailable)} have no 3DBAG model.', flush=True)
    print(f'{len(errors)} identifiers remain unresolved. See gaps/source.json for details.', flush=True)


if __name__ == '__main__':
    main()
