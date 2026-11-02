import 'cesium/Build/Cesium/Widgets/widgets.css';
import { renderNavigation } from './ui/navigation.js';
import { createMorphologyMap } from './morphology/map.js';
import { indicators, metrics, formatIndicator } from './morphology/indicators.js';
import './styles/morphology.css';

renderNavigation('morphology');

const $ = selector => document.querySelector(selector);
const base = '/data/morphology/';
let results;
let map;
let selection = 0;

function showError(message = '') {
  const status = $('#morphologyStatus');
  status.textContent = message;
  status.hidden = !message;
}

function renderLegend() {
  const key = $('#metricSelect').value;
  const metric = metrics[key];
  $('#legendTitle').textContent = metric.label;
  $('#legendDescription').textContent = metric.description;
  $('#legendGradient').style.background = `linear-gradient(to right, ${metric.colors.join(', ')})`;
  const ticks = [0, .25, .5, .75, 1].map(fraction => {
    const span = document.createElement('span');
    span.textContent = `${Number((fraction * metric.maximum).toFixed(2))}${key === 'hw' && fraction === 1 ? '+' : ''}`;
    return span;
  });
  $('#legendTicks').replaceChildren(...ticks);
}

function renderIndicators() {
  const scenario = $('#scenarioSelect').value;
  const current = results.indicators.find(row => row.zone === 'development_site' && row.scenario === scenario);
  const metric = $('#metricSelect').value;
  const mappedIndicator = metric === 'hw' ? 'HW_median' : metric === 'svfb' ? 'SVF_mean_buildings' : 'SVF_mean';
  const cardIndicators = ['GSI', 'FSI', 'OSR', mappedIndicator, 'green_share', 'height_mean_m'];
  const cards = cardIndicators.map(key => indicators.find(item => item.key === key)).map(indicator => {
    const card = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = indicator.label;
    const value = document.createElement('strong');
    value.textContent = formatIndicator(current[indicator.key], indicator);
    card.title = indicator.description;
    card.append(label, value);
    return card;
  });
  $('#indicatorCards').replaceChildren(...cards);
}

async function showResult() {
  const version = ++selection;
  const scenario = results.scenarios.find(item => item.id === $('#scenarioSelect').value);
  const metric = $('#metricSelect').value;
  $('#scenarioDescription').textContent = scenario.description;
  renderLegend();
  renderIndicators();
  showError();
  try {
    await map.show(scenario, metric);
  } catch (error) {
    console.error(error);
    if (version !== selection) return;
    showError('Could not load this result. Choose it again to retry.');
  }
}

async function start() {
  const response = await fetch(base + 'summary.json');
  if (!response.ok) throw new Error(`Morphology metadata: HTTP ${response.status}`);
  results = await response.json();
  for (const scenario of results.scenarios) $('#scenarioSelect').add(new Option(scenario.title, scenario.id));
  renderIndicators();
  map = await createMorphologyMap();
  for (const control of document.querySelectorAll('.morphology-controls select, .morphology-controls input')) {
    control.disabled = false;
  }
  $('#scenarioSelect').addEventListener('change', showResult);
  $('#metricSelect').addEventListener('change', showResult);
  function updateAppearance() {
    const opacity = Number($('#overlayOpacity').value);
    $('#opacityValue').textContent = `${opacity}%`;
    map.setAppearance(opacity / 100, $('#showOverlay').checked && opacity > 0);
  }
  $('#overlayOpacity').addEventListener('input', updateAppearance);
  $('#showOverlay').addEventListener('change', updateAppearance);
  $('#showBuildings').addEventListener('change', () => map.setBuildings($('#showBuildings').checked));
  $('#show3d').addEventListener('change', () => map.set3d($('#show3d').checked));
  $('#showBoundaries').addEventListener('change', () => map.setBoundaries($('#showBoundaries').checked));
  await showResult();
}

start().catch(error => {
  console.error(error);
  showError('Could not initialise morphology. Check the supplied data and aerial imagery, then refresh.');
});
