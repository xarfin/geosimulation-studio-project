import argparse
import io
import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from rasterio.features import bounds as geometry_bounds, geometry_mask
from rasterio.transform import from_bounds
from rasterio.warp import transform_geom

ROOT = Path(__file__).resolve().parents[1]
HALF_WORLD = 20037508.342789244
TILE_SIZE = 256
WMS_URL = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0'


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')


def tile_extent(bounds, zoom):
    span = 2 * HALF_WORLD / 2 ** zoom
    west, south, east, north = bounds
    return (
        math.floor((west + HALF_WORLD) / span),
        math.floor((HALF_WORLD - north) / span),
        math.ceil((east + HALF_WORLD) / span) - 1,
        math.ceil((HALF_WORLD - south) / span) - 1,
    )


def download_image(url, destination, size):
    if destination.exists():
        with Image.open(destination) as image:
            if image.size == size:
                return image.convert('RGB')
    request = urllib.request.Request(url, headers={'User-Agent': 'SchiehavenNoordStudy/1.0'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
            with Image.open(io.BytesIO(data)) as image:
                if image.size != size:
                    raise ValueError(f'Unexpected image size: {image.size}, expected {size}')
                result = image.convert('RGB')
            destination.write_bytes(data)
            return result
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def prepare(layer, zoom):
    source = ROOT / 'public/data/landUse/study-area/doc.geojson'
    study = json.loads(source.read_text(encoding='utf-8'))
    geographic = [feature['geometry'] for feature in study['features']]
    projected = [transform_geom('EPSG:4326', 'EPSG:3857', geometry) for geometry in geographic]
    rectangles = [geometry_bounds(geometry) for geometry in projected]
    bounds = [min(b[0] for b in rectangles), min(b[1] for b in rectangles),
              max(b[2] for b in rectangles), max(b[3] for b in rectangles)]
    geographic_rectangles = [geometry_bounds(geometry) for geometry in geographic]
    geographic_bounds = [min(b[0] for b in geographic_rectangles), min(b[1] for b in geographic_rectangles),
                         max(b[2] for b in geographic_rectangles), max(b[3] for b in geographic_rectangles)]
    output = ROOT / 'public/data/background/study-area'
    cache = ROOT / 'local-data-backups/study-area-imagery' / f'{layer}-z{zoom}'
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    if (output / 'tiles.json').exists():
        previous = json.loads((output / 'tiles.json').read_text(encoding='utf-8'))
        if previous['bounds'] != geographic_bounds or previous['source']['layer'] != layer or previous['maxzoom'] != zoom:
            raise ValueError('The existing extract has different settings. Preserve it before preparing a replacement.')

    left, top, right, bottom = tile_extent(bounds, zoom)
    resolution = 2 * HALF_WORLD / (TILE_SIZE * 2 ** zoom)
    width = (right - left + 1) * TILE_SIZE
    height = (bottom - top + 1) * TILE_SIZE
    west = left * TILE_SIZE * resolution - HALF_WORLD
    north = HALF_WORLD - top * TILE_SIZE * resolution
    mosaic = Image.new('RGB', (width, height))
    blocks = [(x, y) for y in range(0, height, 2048) for x in range(0, width, 2048)]
    for index, (x, y) in enumerate(blocks, 1):
        block_width, block_height = min(2048, width - x), min(2048, height - y)
        block_bounds = [west + x * resolution, north - (y + block_height) * resolution,
                        west + (x + block_width) * resolution, north - y * resolution]
        parameters = {
            'SERVICE': 'WMS', 'VERSION': '1.1.1', 'REQUEST': 'GetMap',
            'LAYERS': layer, 'STYLES': '', 'SRS': 'EPSG:3857', 'FORMAT': 'image/jpeg',
            'BBOX': ','.join(map(str, block_bounds)), 'WIDTH': block_width, 'HEIGHT': block_height,
        }
        url = WMS_URL + '?' + urllib.parse.urlencode(parameters)
        destination = cache / f'{left}-{top}-{x}-{y}-{block_width}-{block_height}.jpg'
        mosaic.paste(download_image(url, destination, (block_width, block_height)), (x, y))
        print(f'Imagery block {index}/{len(blocks)} ready.', flush=True)

    transform = from_bounds(west, north - height * resolution, west + width * resolution, north, width, height)
    inside = geometry_mask(projected, out_shape=(height, width), transform=transform, invert=True)
    mosaic.putalpha(Image.fromarray(inside.astype(np.uint8) * 255))
    preview = mosaic.copy()
    preview.thumbnail((1200, 1200))
    preview.save(cache / 'preview.png')

    available = []
    for level in range(9, zoom + 1):
        x_min, y_min, x_max, y_max = tile_extent(bounds, level)
        factor = 2 ** (zoom - level)
        size = ((x_max - x_min + 1) * TILE_SIZE, (y_max - y_min + 1) * TILE_SIZE)
        offset_x = x_min * TILE_SIZE * factor - left * TILE_SIZE
        offset_y = y_min * TILE_SIZE * factor - top * TILE_SIZE
        image = mosaic.transform(size, Image.Transform.AFFINE,
                                 (factor, 0, offset_x, 0, factor, offset_y), Image.Resampling.BICUBIC)
        for row in range(y_max - y_min + 1):
            for column in range(x_max - x_min + 1):
                tile = image.crop((column * TILE_SIZE, row * TILE_SIZE,
                                   (column + 1) * TILE_SIZE, (row + 1) * TILE_SIZE))
                if tile.getchannel('A').getbbox() is None:
                    continue
                path = f'{level}/{x_min + column}/{2 ** level - (y_min + row) - 1}.png'
                destination = output / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                tile.save(destination, optimize=True)
                available.append(path)
        print(f'Zoom {level} saved.', flush=True)

    metadata = {
        'tilejson': '3.0.0', 'name': 'Schiehaven Noord study-area aerial imagery',
        'scheme': 'tms', 'minzoom': 9, 'maxzoom': zoom, 'tiles': ['{z}/{x}/{y}.png'],
        'bounds': geographic_bounds,
        'attribution': 'Beeldmateriaal Nederland / PDOK - CC BY 4.0',
        'source': {
            'url': WMS_URL, 'layer': layer, 'crs': 'EPSG:3857',
            'boundary': '/data/landUse/study-area/doc.geojson',
            'licence': 'https://creativecommons.org/licenses/by/4.0/',
            'provider': 'https://www.beeldmateriaal.nl/',
            'downloadedAt': datetime.now(timezone.utc).isoformat(),
            'groundResolutionMetres': resolution * math.cos(math.radians(sum(geographic_bounds[1::2]) / 2)),
        },
    }
    write_json(output / 'tiles.json', metadata)
    (output / 'available-tiles.json').write_text(json.dumps(available), encoding='utf-8')
    print(f'Saved {len(available)} local tiles, clipped to the study polygon.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Save the PDOK aerial imagery inside the study boundary as local TMS tiles.')
    parser.add_argument('--layer', default='2026_orthoHR')
    parser.add_argument('--zoom', type=int, choices=range(9, 22), default=19)
    arguments = parser.parse_args()
    prepare(arguments.layer, arguments.zoom)
