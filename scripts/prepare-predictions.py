import argparse
import csv
import io
import json
import shutil
import zipfile
from pathlib import Path


def prepare(archive_path):
    destination = Path(__file__).resolve().parents[1] / 'public/data/predictions'
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        roots = [name.rsplit('/', 1)[0] for name in archive.namelist()
                 if name.endswith('/KNMI_LSTM_1_12_60_months.ipynb')]
        if len(roots) != 1:
            raise ValueError('Expected one task 4.4b notebook in the archive.')
        root = roots[0]

        def rows(name):
            text = archive.read(f'{root}/results_graphs/{name}').decode('utf-8-sig')
            return list(csv.DictReader(io.StringIO(text)))

        def numbers(records, keys):
            return [{key: float(value) if key in keys else value
                     for key, value in record.items()} for record in records]

        data = {
            'station': 'Rotterdam Airport (344)',
            'observations': '1974–2025',
            'forecastPeriod': '2026–2030',
            'comparison': numbers(rows('08_climate_comparison_and_design.csv'), {
                'measured_2021_2025', 'forecast_2026_2030', 'change', 'historical_5year_MAE',
            }),
            'accuracy': numbers(rows('01_accuracy_1_12_60_months.csv'), {
                'months_ahead', 'MAE', 'RMSE', 'forecast_starts',
            }),
            'annual': numbers(rows('07_forecast_annual_2026_2030.csv'), {
                'year', 'temperature_c', 'rain_mm', 'mean_wind_ms',
            }),
        }
        if len(data['comparison']) != 3 or len(data['accuracy']) != 18 or len(data['annual']) != 5:
            raise ValueError('Incomplete forecast tables.')

        for name in archive.namelist():
            path = Path(name)
            if path.parent.as_posix() == f'{root}/cesium_graphs' and path.suffix == '.png':
                target = destination / 'charts' / path.name
            elif path.parent.as_posix() == f'{root}/results_graphs' and path.suffix in {'.csv', '.txt'}:
                target = destination / 'results' / path.name
            elif path.name == '06_model_training.png':
                target = destination / 'charts' / path.name
            else:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(name))

    (destination / 'summary.json').write_text(
        json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8',
    )
    shutil.copyfile(archive_path, destination / 'task44b-source.zip')
    print(f'Prepared task 4.4b data in {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Import the supplied task 4.4b results without retraining.')
    parser.add_argument('archive', type=Path)
    prepare(parser.parse_args().archive)
