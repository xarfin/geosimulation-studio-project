import argparse
import json
import math
import shutil
import zipfile
from collections import Counter
from pathlib import Path


FILES = {
    'accessibility/current-routes.geojson': 'Accessibility/JSON/Existing Network/05_CURRENT_ROUTES_CESIUM.geojson',
    'accessibility/proposed-routes.geojson': 'Accessibility/JSON/Proposed Network/06_PROPOSED_ROUTES_CESIUM.geojson',
    'accessibility/destinations.geojson': 'Accessibility/JSON/Proposed Network/08_DESTINATIONS_CESIUM.geojson',
    'accessibility/site-and-buildings.geojson': 'Accessibility/JSON/Proposed Network/09_SITE_AND_BUILDINGS_CESIUM.geojson',
    'accessibility/entrances.geojson': 'Accessibility/JSON/Proposed Network/07_ASSUMED_ENTRANCES_CESIUM.geojson',
    'accessibility/interventions.geojson': 'Accessibility/JSON/Proposed Network/10_PROPOSED_INTERVENTIONS_CESIUM.geojson',
    'traffic/current-flow.geojson': 'Traffic Flow/GEOJSON/05_CURRENT_FLOW_CESIUM.geojson',
    'traffic/proposed-flow.geojson': 'Traffic Flow/GEOJSON/06_PROPOSED_FLOW_CESIUM.geojson',
    'traffic/current-exits.geojson': 'Traffic Flow/GEOJSON/07A_CURRENT_EXITS_CESIUM.geojson',
    'traffic/proposed-exits.geojson': 'Traffic Flow/GEOJSON/07B_PROPOSED_EXITS_CESIUM.geojson',
}

DESTINATIONS = [
    ('AH', 'Supermarket', '#df8a2c'),
    ('SCHOOL', 'School', '#9162b1'),
    ('DOCTOR', 'Doctor', '#c74f6b'),
    ('TRAM', 'Tram stop', '#337fb6'),
    ('PLAY', 'Playground', '#258d6c'),
]

# These values are printed in the supplied PNGs; no numeric trip/exit table was supplied.
FIGURE_VALUES = {
    'current': {'meanTripDistanceM': 2141, 'exitDemand': {'E1': 12, 'E2': 48}},
    'proposed': {'meanTripDistanceM': 2213, 'exitDemand': {'E1': 17, 'E2': 17, 'P1': 9, 'P2': 17}},
}


def coordinates(parts):
    if isinstance(parts[0], (int, float)):
        yield parts
    else:
        for part in parts:
            yield from coordinates(part)


def traffic_destinations(flow, exits):
    endpoints = Counter()
    positions = {}
    for feature in flow['features']:
        line = feature['geometry']['coordinates']
        for position in [line[0], line[-1]]:
            key = tuple(round(value, 7) for value in position[:2])
            endpoints[key] += 1
            positions[key] = position[:2]
    exit_positions = {tuple(round(value, 7) for value in feature['geometry']['coordinates'][:2])
                      for feature in exits['features']}
    terminals = [positions[key] for key, count in endpoints.items() if count == 1 and key not in exit_positions]
    if len(terminals) != 4:
        raise ValueError('Expected four traffic destinations after excluding the site exits.')
    directions = [
        ('North', max(terminals, key=lambda point: point[1])),
        ('East', max(terminals, key=lambda point: point[0])),
        ('South', min(terminals, key=lambda point: point[1])),
        ('West', min(terminals, key=lambda point: point[0])),
    ]
    if len({tuple(position) for _, position in directions}) != 4:
        raise ValueError('Traffic destinations must have four distinct positions.')
    return {
        'type': 'FeatureCollection',
        'sourceFigure': 'figures/Traffic Flow/02_PROPOSED_FOUR_EXITS.png',
        'features': [
            {'type': 'Feature', 'properties': {'type': 'traffic_destination', 'name': f'{direction} destination'},
             'geometry': {'type': 'Point', 'coordinates': position}}
            for direction, position in directions
        ],
    }


def prepare(archive_path):
    destination = Path(__file__).resolve().parents[1] / 'public/data/roads'
    files = {}
    with zipfile.ZipFile(archive_path) as archive:
        roots = [name.removesuffix(FILES['traffic/current-flow.geojson']) for name in archive.namelist()
                 if name.endswith(FILES['traffic/current-flow.geojson'])]
        if len(roots) != 1:
            raise ValueError('Expected one set of task 4.8 road-network results.')
        root = roots[0]
        for target, source in FILES.items():
            files[target] = archive.read(root + source)
        for name in archive.namelist():
            if name.startswith(root) and name.lower().endswith('.png'):
                files['figures/' + name[len(root):].replace('/PNG/', '/')] = archive.read(name)

    layers = {name: json.loads(contents.decode('utf-8-sig')) for name, contents in files.items()
              if name.endswith('.geojson')}
    for name, layer in layers.items():
        if layer['type'] != 'FeatureCollection' or not layer['features']:
            raise ValueError(f'Empty or invalid layer: {name}')
        for feature in layer['features']:
            for longitude, latitude, *_ in coordinates(feature['geometry']['coordinates']):
                if not (4.4 < longitude < 4.5 and 51.8 < latitude < 52):
                    raise ValueError(f'Expected WGS 84 coordinates near Rotterdam: {name}')

    destination_features = layers['accessibility/destinations.geojson']['features']
    traffic_destination_path = 'traffic/destinations.geojson'
    files[traffic_destination_path] = (json.dumps(traffic_destinations(
        layers['traffic/current-flow.geojson'], layers['traffic/current-exits.geojson']), indent=2) + '\n').encode('utf-8')
    summary = {
        'sourceArchive': archive_path.name,
        'crs': 'EPSG:4326',
        'design': 'Design B',
        'trafficIsObserved': False,
        'trafficDestinations': traffic_destination_path,
        'trafficFigureValues': {
            'meanTripDistanceM': 'figures/Traffic Flow/03_TWO_VS_FOUR_COMPARISON.png',
            'exitDemand': 'figures/Traffic Flow/04_EXIT_DEMAND_COMPARISON.png',
        },
        'destinations': [
            {'id': id_, 'label': label, 'color': color,
             'name': next(f['properties']['name'] for f in destination_features if f['properties']['id'] == id_)}
            for id_, label, color in DESTINATIONS
        ],
        'scenarios': [],
    }
    expected_routes = {(building, id_) for building in range(1, 7) for id_, _, _ in DESTINATIONS}
    for id_, title in [('current', 'Current'), ('proposed', 'Proposed')]:
        routes_path = f'accessibility/{id_}-routes.geojson'
        routes = [f['properties'] for f in layers[routes_path]['features']]
        if len(routes) != 30 or {(r['building'], r['destination_id']) for r in routes} != expected_routes:
            raise ValueError('Expected six buildings by five destinations for each network.')
        if any(not math.isfinite(r['distance_m']) or r['distance_m'] <= 0 for r in routes):
            raise ValueError('Invalid route distance.')
        flow_path = f'traffic/{id_}-flow.geojson'
        flows = [f['properties']['vehicles_per_hour'] for f in layers[flow_path]['features']]
        if any(not math.isfinite(value) or value < 0 for value in flows):
            raise ValueError('Invalid modelled traffic flow.')
        exits_path = f'traffic/{id_}-exits.geojson'
        summary['scenarios'].append({
            'id': id_, 'title': title, 'routes': routes_path, 'flow': flow_path, 'exits': exits_path,
            'meanWalkDistanceM': sum(r['distance_m'] for r in routes) / len(routes),
            'walkingByDestination': {
                destination_id: sum(r['distance_m'] for r in routes if r['destination_id'] == destination_id) / 6
                for destination_id, _, _ in DESTINATIONS
            },
            'maxAddedVehiclesPerHour': max(flows),
            'exitCount': len(layers[exits_path]['features']),
            **FIGURE_VALUES[id_],
        })

    destination.mkdir(parents=True, exist_ok=True)
    for name, contents in files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)
    (destination / 'summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
    source = destination / 'task48-source.zip'
    if archive_path.resolve() != source.resolve():
        shutil.copyfile(archive_path, source)
    print(f'Prepared accessibility and traffic results for both networks in {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Import task 4.8 results without rerunning the analysis.')
    parser.add_argument('archive', type=Path)
    prepare(parser.parse_args().archive)
