import argparse
import json
import math
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from matplotlib import colormaps
from PIL import Image
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform_geom

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    ('baseline', 'Baseline', 'Paraview windsimulatie area', 'Baseline_Windsimulation2.pdf'),
    ('design-a', 'Design A', 'Paraview design A', 'DesignA_Windsimulation.pdf'),
    ('design-b', 'Design B', 'Paraview Design B', 'DesignB_Windsimulation.pdf'),
]
OFFSET = [90980, 435560, 0]


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def geographic_grid(bounds, width, height, crs):
    transform, cols, rows = calculate_default_transform(crs, 'EPSG:4326', width, height, *bounds)
    return transform, cols, rows


def study_mask(width, height, transform):
    area = json.loads((ROOT / 'public/task47/study_area.geojson').read_text(encoding='utf-8'))
    return geometry_mask([feature['geometry'] for feature in area['features']],
                         (height, width), transform, invert=True)


def extract_cases(archive_path, work, destination):
    cases = []
    with zipfile.ZipFile(archive_path) as archive:
        roots = [name.rsplit('/', 2)[0] for name in archive.namelist()
                 if name.endswith('/Noise simulation/Output_Noise_Simulation.png')]
        if len(roots) != 1:
            raise ValueError('Expected the supplied task 4.5 archive structure.')
        root = roots[0]
        for key, title, folder, pdf in CASES:
            prefix = f'{root}/{title}/{folder}/'
            config = archive.read(prefix + 'system/snappyHexMeshDict').decode('utf-8')
            match = re.search(r'local = source - \((\d+) (\d+) (\d+)\)', config)
            if not match or list(map(int, match.groups())) != OFFSET or 'EPSG:28992' not in config:
                raise ValueError(f'Unrecognised coordinate transformation for {title}.')
            entries = [name for name in archive.namelist() if name.startswith(prefix)]
            step = max(int(name[len(prefix):].split('/')[0]) for name in entries
                       if name[len(prefix):].split('/')[0].isdigit())
            for name in entries:
                relative = name[len(prefix):]
                if not (relative.startswith('constant/polyMesh/') or relative == 'system/controlDict'
                        or relative == f'{step}/U'):
                    continue
                target = work / key / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(name) as source, target.open('wb') as output:
                    shutil.copyfileobj(source, output)
            case = work / key / 'case.foam'
            case.touch()
            (destination / 'sources' / pdf).write_bytes(archive.read(f'{root}/{title}/{pdf}'))
            cases.append((key, title, case, step, pdf))
        noise = archive.read(f'{root}/Noise simulation/Output_Noise_Simulation.png')
        (destination / 'sources/Output_Noise_Simulation.png').write_bytes(noise)
    return cases


def export_wind(sample_path, key, title, step, pdf, destination, maximum):
    sample = np.load(sample_path)
    if float(sample['timestep']) != step:
        raise ValueError(f'{title}: cached samples do not match the final saved timestep.')
    speed = sample['speed']
    west, south, east, north = sample['bounds']
    rd_bounds = [west + OFFSET[0], south + OFFSET[1], east + OFFSET[0], north + OFFSET[1]]
    source_transform = from_bounds(*rd_bounds, speed.shape[1], speed.shape[0])
    transform, width, height = geographic_grid(rd_bounds, speed.shape[1], speed.shape[0], 'EPSG:28992')
    geographic = np.full((height, width), np.nan, dtype=np.float32)
    reproject(speed, geographic, src_transform=source_transform, src_crs='EPSG:28992',
              dst_transform=transform, dst_crs='EPSG:4326', src_nodata=np.nan,
              dst_nodata=np.nan, resampling=Resampling.bilinear)
    valid = np.zeros((height, width), dtype=np.uint8)
    reproject(np.isfinite(speed).astype(np.uint8), valid, src_transform=source_transform,
              src_crs='EPSG:28992', dst_transform=transform, dst_crs='EPSG:4326',
              resampling=Resampling.nearest)
    geographic[valid == 0] = np.nan
    geographic[~study_mask(width, height, transform)] = np.nan
    colors = colormaps['turbo'](np.nan_to_num(geographic, nan=0) / maximum, bytes=True)
    colors[..., 3] = np.isfinite(geographic).astype(np.uint8) * 255
    Image.fromarray(colors).save(destination / f'{key}.png')
    geographic.astype('<f4').tofile(destination / f'{key}.bin')
    with rasterio.open(destination / f'{key}.tif', 'w', driver='GTiff', width=width,
                       height=height, count=1, dtype='float32', crs='EPSG:4326',
                       transform=transform, nodata=np.nan, compress='deflate') as dataset:
        dataset.write(geographic, 1)
        dataset.set_band_description(1, 'Wind speed at 1.5 m above model ground (m/s)')
        dataset.update_tags(scenario=title, solver='simpleFoam', timestep=str(step),
                            source_crs='EPSG:28992', local_offset=str(OFFSET), units='m/s')

    site = json.loads((ROOT / 'public/task47/development_site.geojson').read_text(encoding='utf-8'))
    shapes = [transform_geom('EPSG:4326', 'EPSG:28992', feature['geometry']) for feature in site['features']]
    mask = geometry_mask(shapes, speed.shape, source_transform, invert=True)
    values = speed[mask & np.isfinite(speed)]
    if not values.size:
        raise ValueError('No wind samples fall within the development site.')
    return {
        'id': key, 'title': title, 'timestep': step,
        'image': f'{key}.png', 'values': f'{key}.bin', 'geotiff': f'{key}.tif',
        'report': f'sources/{pdf}', 'width': width, 'height': height,
        'bounds': list(rasterio.transform.array_bounds(height, width, transform)),
        'statistics': {'mean': float(values.mean()), 'p95': float(np.percentile(values, 95)),
                       'max': float(values.max()), 'samples': int(values.size)},
    }


def export_noise(destination):
    original = Image.open(destination / 'sources/Output_Noise_Simulation.png').convert('RGBA')
    if original.size != (933, 665):
        raise ValueError('Noise figure changed: its axis calibration must be checked again.')
    # Pixel positions of labelled map ticks; Web Mercator is inferred from these axes.
    # Alignment was checked against the supplied building footprints, not surveyed points.
    x_fit = np.polyfit([161, 305, 448, 591, 735], [495000, 495500, 496000, 496500, 497000], 1)
    y_fit = np.polyfit([155, 213, 270, 328, 385, 442, 500, 557], np.arange(6783600, 6782199, -200), 1)
    crop = (119, 119, 769, 542)
    image = np.array(original.crop(crop))
    bounds = [float(np.polyval(x_fit, crop[0])), float(np.polyval(y_fit, crop[3])),
              float(np.polyval(x_fit, crop[2])), float(np.polyval(y_fit, crop[1]))]
    source_transform = from_bounds(*bounds, image.shape[1], image.shape[0])
    transform, width, height = geographic_grid(bounds, image.shape[1], image.shape[0], 'EPSG:3857')
    overlay = np.zeros((height, width, 4), dtype=np.uint8)
    for band in range(4):
        reproject(image[..., band], overlay[..., band], src_transform=source_transform,
                  src_crs='EPSG:3857', dst_transform=transform, dst_crs='EPSG:4326',
                  dst_nodata=0, resampling=Resampling.nearest)
    overlay[~study_mask(width, height, transform), 3] = 0
    Image.fromarray(overlay).save(destination / 'noise.png')
    stops = []
    for value in range(10):
        color = original.getpixel((865, round(644 - value / 9 * 626)))
        stops.append({'value': value, 'color': '#%02x%02x%02x' % color[:3]})
    return {
        'image': 'noise.png', 'source': 'sources/Output_Noise_Simulation.png',
        'bounds': list(rasterio.transform.array_bounds(height, width, transform)),
        'legend': {'label': 'Lw (dB)', 'minimum': 0, 'maximum': 9, 'stops': stops},
        'alignment': 'Approximate: calibrated from image axes, assuming EPSG:3857; checked against supplied building footprints.',
        'sourceCrs': 'EPSG:3857 (inferred)', 'sourceBounds': bounds,
        'sourceCropPixels': list(crop), 'numericValuesAvailable': False,
        'scenario': 'Single supplied result; no separate baseline/design noise layers were included.',
    }


def prepare(archive, pvpython, work):
    destination = ROOT / 'public/data/environment'
    (destination / 'sources').mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    cases = extract_cases(archive, work, destination)
    for key, title, case, step, pdf in cases:
        output = work / f'{key}.npz'
        subprocess.run([str(pvpython), '--no-mpi', str(ROOT / 'scripts/sample-wind.py'),
                        str(case), str(output)], check=True)
    maximum = max(12, math.ceil(max(float(np.nanmax(np.load(work / f'{key}.npz')['speed']))
                                  for key, *_ in cases) / 2) * 2)
    stops = [{'value': value, 'color': '#%02x%02x%02x' % tuple(colormaps['turbo'](value / maximum, bytes=True)[:3])}
             for value in np.linspace(0, maximum, 13)]
    summary = {
        'sourceArchive': archive.name, 'sourceCrs': 'EPSG:28992', 'localOffset': OFFSET,
        'heightMetres': 1.5, 'referenceWind': {'speed': 10, 'height': 10, 'direction': [1, 0, 0]},
        'displayClippedToStudyArea': True,
        'sampleSpacingMetres': 2, 'valueFormat': 'little-endian float32, north-to-south rows; NaN means no sample',
        'method': 'Latest saved simpleFoam U field; cell-to-point interpolation; triangulated horizontal slice at z=1.5 m sampled on a 2 m grid; bilinear reprojection to EPSG:4326, with a nearest-neighbour validity mask.',
        'statisticsArea': 'Open-air samples within the development site; building interiors excluded.',
        'legend': {'label': 'Wind speed (m/s)', 'minimum': 0, 'maximum': maximum, 'stops': stops},
        'scenarios': [export_wind(work / f'{key}.npz', key, title, step, pdf, destination, maximum)
                      for key, title, case, step, pdf in cases],
        'noise': export_noise(destination),
    }
    write_json(destination / 'summary.json', summary)
    print(f'Prepared wind and noise results in {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Prepare georeferenced task 4.5 overlays from the supplied archive.')
    parser.add_argument('archive', type=Path)
    parser.add_argument('--pvpython', type=Path, required=True)
    parser.add_argument('--work', type=Path, default=ROOT / 'local-data-backups/wind-noise-work')
    args = parser.parse_args()
    prepare(args.archive, args.pvpython, args.work)
