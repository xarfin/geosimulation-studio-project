import { renderNavigation } from './ui/navigation.js';
import { charts } from './predictions/charts.js';
import './styles/predictions.css';

renderNavigation('predictions');

const select = document.querySelector('#chartSelect');
const horizon = document.querySelector('#horizonSelect');
const metric = document.querySelector('#metricSelect');
const image = document.querySelector('#predictionChart');
const format = value => value.toFixed(2);
let results;
let chartIndex = 2;

function showChart(index) {
  chartIndex = index;
  const chart = charts[index];
  const url = `/data/predictions/charts/${chart.file}`;
  select.value = String(index);
  document.querySelector('#chartTitle').textContent = chart.title;
  document.querySelector('#chartCategory').textContent = chart.category;
  document.querySelector('#chartCaption').textContent = chart.caption;
  document.querySelector('#fullChart').href = url;
  document.querySelector('#chartLink').href = url;
  document.querySelector('#chartCounter').textContent = `${index + 1} / ${charts.length}`;
  document.querySelector('#previousChart').disabled = index === 0;
  document.querySelector('#nextChart').disabled = index === charts.length - 1;
  document.querySelector('#chartStatus').textContent = 'Loading chart.';
  image.alt = `${chart.title}. ${chart.caption}`;
  image.src = url;
  if (chart.horizon) {
    horizon.value = String(chart.horizon);
    if (results) renderAccuracy();
  }
}

function renderComparison() {
  const container = document.querySelector('#comparisonCards');
  for (const row of results.comparison) {
    const card = document.createElement('article');
    card.className = 'prediction-card';
    const heading = document.createElement('h3');
    heading.textContent = row.indicator;
    const values = document.createElement('dl');
    for (const [label, value] of [
      ['Measured', row.measured_2021_2025], ['Forecast', row.forecast_2026_2030],
    ]) {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = `${format(value)} ${row.unit}`;
      values.append(term, detail);
    }
    const change = document.createElement('p');
    change.className = 'muted';
    change.textContent = `Change: ${row.change > 0 ? '+' : ''}${format(row.change)} ${row.unit}`;
    const error = document.createElement('p');
    error.className = 'muted';
    error.textContent = `Historical five-year average MAE: ${format(row.historical_5year_MAE)} ${row.unit}`;
    card.append(heading, values, change, error);
    container.append(card);
  }
}

function tableRow(values) {
  const row = document.createElement('tr');
  values.forEach((value, index) => {
    const cell = document.createElement(index === 0 ? 'th' : 'td');
    if (index === 0) cell.scope = 'row';
    cell.textContent = value;
    row.append(cell);
  });
  return row;
}

function renderAccuracy() {
  const rows = document.querySelector('#accuracyRows');
  rows.replaceChildren();
  for (const [key, label] of [
    ['temperature_c', 'Temperature'], ['rain_mm', 'Rainfall'], ['mean_wind_ms', 'Wind speed'],
  ]) {
    const selected = results.accuracy.filter(row => row.indicator === key && row.months_ahead === Number(horizon.value));
    const lstm = selected.find(row => row.model === 'LSTM');
    const baseline = selected.find(row => row.model === 'Seasonal baseline');
    rows.append(tableRow([`${label} (${lstm.unit})`, format(lstm[metric.value]), format(baseline[metric.value])]));
  }
  const label = metric.value === 'MAE' ? 'Mean absolute error' : 'Root mean squared error';
  document.querySelector('#accuracyCaption').textContent = `${label} at ${horizon.value} month${horizon.value === '1' ? '' : 's'} ahead`;
}

charts.forEach((chart, index) => select.add(new Option(chart.title, String(index))));
select.addEventListener('change', () => showChart(Number(select.value)));
document.querySelector('#previousChart').addEventListener('click', () => showChart(Math.max(0, chartIndex - 1)));
document.querySelector('#nextChart').addEventListener('click', () => showChart(Math.min(charts.length - 1, chartIndex + 1)));
image.addEventListener('load', () => { document.querySelector('#chartStatus').textContent = ''; });
image.addEventListener('error', () => {
  document.querySelector('#chartStatus').textContent = 'Could not load this chart. Choose another chart or refresh to retry.';
});
horizon.addEventListener('change', renderAccuracy);
metric.addEventListener('change', renderAccuracy);
showChart(chartIndex);

async function start() {
  const response = await fetch('/data/predictions/summary.json');
  if (!response.ok) throw new Error(`Prediction results: HTTP ${response.status}`);
  results = await response.json();
  renderComparison();
  renderAccuracy();
  document.querySelector('#annualRows').replaceChildren(...results.annual.map(row => tableRow([
    String(row.year), format(row.temperature_c), format(row.rain_mm), format(row.mean_wind_ms),
  ])));
  horizon.disabled = false;
  metric.disabled = false;
  document.querySelector('#dataStatus').textContent = 'Saved model results · forecast starts January 2026.';
}

start().catch(error => {
  console.error(error);
  const status = document.querySelector('#dataStatus');
  status.textContent = 'Could not load the result tables. The supplied charts and source downloads remain available.';
  status.classList.add('error');
});
