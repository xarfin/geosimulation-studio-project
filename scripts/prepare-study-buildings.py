import copy
import gzip
import json
import math
import posixpath
import struct
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from shapely.geometry import box, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.3drotterdam.nl/datasource-data/8b5d0ded-a222-4e44-bc70-2992bc2192fc/tileset.json'
SOURCE_DIRECTORY = urllib.parse.urljoin(SOURCE, './')
CACHE = ROOT / 'local-data-backups/study-buildings-lod2'
OUTPUT = ROOT / 'public/data/buildings/study-area'


def relative_path(url):
    if not url.startswith(SOURCE_DIRECTORY):
        raise ValueError(f'Unexpected resource outside the municipal dataset: {url}')
    relative = PurePosixPath(urllib.parse.urlparse(url).path).relative_to(urllib.parse.urlparse(SOURCE_DIRECTORY).path)
    if '..' in relative.parts:
        raise ValueError('Invalid relative tileset path')
    return relative


def download(url):
    destination = CACHE / relative_path(url)
    if destination.exists():
        return destination.read_bytes()
    request = urllib.request.Request(url, headers={'User-Agent': 'SchiehavenNoordStudy/1.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return data


def validate_building_tile(data):
    if data[:4] != b'b3dm':
        raise ValueError('The municipal building payload is not a b3dm tile')
    version, length, feature_json, feature_binary, batch_json, batch_binary = struct.unpack_from('<6I', data, 4)
    if version != 1 or length != len(data):
        raise ValueError('Invalid or truncated building tile')
    glb_start = 28 + feature_json + feature_binary + batch_json + batch_binary
    magic, glb_version, glb_length = struct.unpack_from('<4sII', data, glb_start)
    padding = data[glb_start + glb_length:]
    if magic != b'glTF' or glb_version != 2 or glb_start + glb_length > len(data) or len(padding) > 7 or any(value not in (0, 32) for value in padding):
        raise ValueError('Expected an embedded glTF 2 model')
    json_length, chunk_type = struct.unpack_from('<I4s', data, glb_start + 12)
    if chunk_type != b'JSON':
        raise ValueError('The embedded glTF JSON chunk is missing')
    model = json.loads(data[glb_start + 20:glb_start + 20 + json_length])
    for kind in ['buffers', 'images']:
        for item in model.get(kind, []):
            uri = item.get('uri', '')
            if uri and not uri.startswith('data:'):
                raise ValueError('A building tile requires an external resource; it cannot be saved as a self-contained tile')


def prepare():
    boundary_file = ROOT / 'public/data/landUse/study-area/doc.geojson'
    boundary = json.loads(boundary_file.read_text(encoding='utf-8'))
    study = unary_union([shape(feature['geometry']) for feature in boundary['features']])
    downloaded = set()
    bounds = []

    def intersects(volume):
        region = volume.get('region')
        if region is None:
            raise ValueError('This downloader expects geographic region bounding volumes')
        rectangle = [math.degrees(value) for value in region[:4]]
        return study.intersects(box(*rectangle))

    def save(path, data):
        destination = OUTPUT / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)

    def subset_document(url):
        document = json.loads(download(url))
        root = subset_tile(document['root'], url)
        if root is None:
            return None
        document['root'] = root
        path = relative_path(url)
        save(path, json.dumps(document, separators=(',', ':')).encode('utf-8'))
        return path

    def subset_tile(original, document_url):
        if not intersects(original['boundingVolume']):
            return None
        tile = copy.deepcopy(original)
        children = [child for original_child in original.get('children', [])
                    if (child := subset_tile(original_child, document_url)) is not None]
        if children:
            tile['children'] = children
        else:
            tile.pop('children', None)
        content = tile.get('content')
        if content and 'boundingVolume' in content and not intersects(content['boundingVolume']):
            tile.pop('content')
            content = None
        if content:
            uri_key = 'uri' if 'uri' in content else 'url'
            url = urllib.parse.urljoin(document_url, content[uri_key])
            if urllib.parse.urlparse(url).path.endswith('.json'):
                path = subset_document(url)
                if path is None:
                    tile.pop('content')
            else:
                path = relative_path(url)
                if path not in downloaded:
                    data = download(url)
                    validate_building_tile(data)
                    save(path, data)
                    downloaded.add(path)
                    print(f'Saved building tile {len(downloaded)}: {path}', flush=True)
                bounds.append(content.get('boundingVolume', tile['boundingVolume'])['region'])
            if 'content' in tile:
                tile['content'][uri_key] = posixpath.relpath(str(path), str(relative_path(document_url).parent))
        return tile if 'content' in tile or children else None

    subset_document(SOURCE)
    if not downloaded:
        raise ValueError('No LoD2 building tiles overlap the study area')
    summary = {
        'source': SOURCE, 'provider': 'Gemeente Rotterdam - Rotterdam in 3D', 'lod': 2,
        'downloadedAt': datetime.now(timezone.utc).isoformat(), 'tileCount': len(downloaded),
        'studyBoundary': '/data/landUse/study-area/doc.geojson',
        'selection': 'Tiles intersecting the study polygon; complete tile geometry is preserved, including buildings at the boundary.',
        'geographicBounds': [math.degrees(min(b[0] for b in bounds)), math.degrees(min(b[1] for b in bounds)),
                             math.degrees(max(b[2] for b in bounds)), math.degrees(max(b[3] for b in bounds))],
        'bytes': sum((OUTPUT / path).stat().st_size for path in downloaded),
    }
    (OUTPUT / 'source.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    print(f'LoD2 buildings ready: {len(downloaded)} local tiles, {summary["bytes"] / 1024 ** 2:.1f} MiB.', flush=True)


if __name__ == '__main__':
    prepare()
