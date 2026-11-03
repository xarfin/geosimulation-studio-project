import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union


def prepare():
    root = Path(__file__).resolve().parents[1]
    data = root / 'public/data/roads'
    allocation_path = root / 'public/task47/green.geojson'
    buildings_path = data / 'accessibility/site-and-buildings.geojson'
    allocation = json.loads(allocation_path.read_text(encoding='utf-8-sig'))
    buildings = json.loads(buildings_path.read_text(encoding='utf-8-sig'))
    to_rd = Transformer.from_crs(4326, 28992, always_xy=True).transform
    sports = {
        code: unary_union([shape(feature['geometry']) for feature in allocation['features']
                           if feature['properties']['land_use'] == code])
        for code in [13, 14]
    }
    if any(geometry.is_empty for geometry in sports.values()):
        raise ValueError('Design B must contain both indoor and outdoor sports allocations.')

    indoor_rd = transform(to_rd, sports[14])
    features = []
    indoor_count = 0
    for original in buildings['features']:
        feature = {**original, 'properties': dict(original['properties'])}
        if feature['properties']['type'] == 'Design_B':
            geometry = shape(feature['geometry'])
            projected = transform(to_rd, geometry)
            indoor = projected.intersection(indoor_rd).area / projected.area > .5
            feature['properties']['use'] = 'indoor_sports' if indoor else 'residential'
            if indoor:
                indoor_count += 1
                point = geometry.representative_point()
                feature['properties'].update({
                    'label': 'Indoor sports', 'label_position': [point.x, point.y],
                    'area_m2': indoor_rd.area,
                })
        features.append(feature)
    if indoor_count != 1:
        raise ValueError('Expected one road-analysis building matching the indoor sports allocation.')

    outdoor = sports[13]
    point = outdoor.representative_point()
    features.append({
        'type': 'Feature',
        'properties': {
            'type': 'sports', 'use': 'outdoor_sports', 'label': 'Outdoor sports',
            'label_position': [point.x, point.y], 'area_m2': transform(to_rd, outdoor).area,
        },
        'geometry': mapping(outdoor),
    })
    result = {
        'type': 'FeatureCollection', 'design': 'B',
        'sources': ['/task47/green.geojson', '/data/roads/accessibility/site-and-buildings.geojson'],
        'features': features,
    }
    (data / 'site-context.geojson').write_text(json.dumps(result, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
    print('Prepared the Design B outdoor sports allocation and identified its indoor sports building.')


if __name__ == '__main__':
    prepare()
