import argparse
import csv
import io
import json
import math
import shutil
import zipfile
from pathlib import Path


SCENARIOS = [
    ('baseline', 'Baseline', 'Existing buildings and trees'),
    ('design_A', 'Design A', 'Public connections'),
    ('design_B', 'Design B', 'Connected park'),
]


def prepare(archive_path):
    destination = Path(__file__).resolve().parents[1] / 'public/data/morphology'
    with zipfile.ZipFile(archive_path) as archive:
        roots = [name.removesuffix('/cesium/overlays_rectangles.json')
                 for name in archive.namelist() if name.endswith('/cesium/overlays_rectangles.json')]
        if len(roots) != 1:
            raise ValueError('Expected one set of task 4.3 overlay rectangles.')
        root = roots[0]
        rectangles = json.loads(archive.read(f'{root}/cesium/overlays_rectangles.json'))
        table = archive.read(f'{root}/indicators.csv')
        records = list(csv.DictReader(io.StringIO(table.decode('utf-8-sig'))))
        expected = {(scenario, zone) for scenario, _, _ in SCENARIOS
                    for zone in ['development_site', 'study_area']}
        if len(records) != 6 or {(r['scenario'], r['zone']) for r in records} != expected:
            raise ValueError('Expected six unique scenario/zone indicator records.')
        for record in records:
            for key in record.keys() - {'scenario', 'zone'}:
                record[key] = float(record[key])
                if not math.isfinite(record[key]):
                    raise ValueError(f'Invalid indicator: {key}')

        files = {'indicators.csv': table}
        scenarios = []
        for scenario, title, description in SCENARIOS:
            layers = {}
            for metric in ['svf', 'svfb', 'hw']:
                key = f'{metric}_{scenario}'
                rect = rectangles[key]
                bounds = [rect[k] for k in ['west', 'south', 'east', 'north']]
                if not (-180 <= bounds[0] < bounds[2] <= 180 and -90 <= bounds[1] < bounds[3] <= 90):
                    raise ValueError(f'Invalid geographic rectangle: {key}')
                image = f'{key}.png'
                files[image] = archive.read(f'{root}/cesium/{image}')
                if files[image][:8] != b'\x89PNG\r\n\x1a\n':
                    raise ValueError(f'Invalid overlay image: {image}')
                layers[metric] = {'image': image, 'bounds': bounds}
            buildings = 'buildings_existing.geojson' if scenario == 'baseline' else f'buildings_{scenario}.geojson'
            files[buildings] = archive.read(f'{root}/cesium/{buildings}')
            collection = json.loads(files[buildings])
            if not collection['features'] or any(not math.isfinite(f['properties']['height'])
                                                 or f['properties']['height'] <= 0 for f in collection['features']):
                raise ValueError(f'Invalid building heights: {buildings}')
            scenarios.append({'id': scenario, 'title': title, 'description': description,
                              'buildings': buildings, 'layers': layers})

        figures = [
            ('morph_layouts.pdf', 'Design layouts'),
            ('morph_svf.pdf', 'Sky-view factor comparison'),
            ('morph_svf_change.pdf', 'Sky-view change from baseline'),
            ('morph_hw.pdf', 'Height-to-width comparison'),
            ('morph_indicators_site.pdf', 'Development-site indicators'),
            ('morph_indicators_study.pdf', 'Study-area indicators'),
        ]
        for name, _ in figures:
            files[f'figures/{name}'] = archive.read(f'{root}/report/figures/{name}')
        files['overlays_rectangles.json'] = archive.read(f'{root}/cesium/overlays_rectangles.json')

    summary = {
        'sourceArchive': archive_path.name,
        'sourceCrs': 'EPSG:28992',
        'overlayCrs': 'EPSG:4326',
        'observerHeightMetres': 1.5,
        'sourceGridMetres': 1,
        'floorHeightMetres': 3,
        'numericRasterAvailable': False,
        'scenarios': scenarios,
        'indicators': records,
        'figures': [{'file': f'figures/{name}', 'title': title} for name, title in figures],
    }
    destination.mkdir(parents=True, exist_ok=True)
    for name, contents in files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)
    (destination / 'summary.json').write_text(
        json.dumps(summary, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    source = destination / 'task43-source.zip'
    if archive_path.resolve() != source.resolve():
        shutil.copyfile(archive_path, source)
    print(f'Prepared nine overlays, three building layers and six indicator records in {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Import the supplied task 4.3 results without recalculating them.')
    parser.add_argument('archive', type=Path)
    prepare(parser.parse_args().archive)
