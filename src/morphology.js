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
  const zone = $('#zoneSelect').value;
  const scenario = $('#scenarioSelect').value;
  const records = results.scenarios.map(item => results.indicators.find(row => row.zone === zone && row.scenario === item.id));
  const current = records.find(row => row.scenario === scenario);
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
  $('#indicatorContext').textContent = `${formatIndicator(current.land_area_m2, indicators.find(item => item.key === 'land_area_m2'))} of land, excluding water. Green share includes ground vegetation and canopy; roofs are separate.`;
  $('#comparisonCaption').textContent = `${zone === 'development_site' ? 'Development site' : 'Whole study area'} · supplied indicator values`;
  const rows = indicators.map(indicator => {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = indicator.label;
    const definition = document.createElement('small');
    definition.textContent = indicator.description;
    heading.append(definition);
    row.append(heading);
    for (const record of records) {
      const cell = document.createElement('td');
      cell.textContent = formatIndicator(record[indicator.key], indicator);
      if (record.scenario === scenario) cell.className = 'selected-scenario';
      if (zone === 'study_area' && indicator.key === 'green_roof_m2') {
        cell.textContent = '—';
        cell.title = 'The source reports green-roof totals for the development site only.';
      }
      row.append(cell);
    }
    return row;
  });
  $('#indicatorTable').replaceChildren(...rows);
}

async function showResult() {
  const version = ++selection;
  const scenario = results.scenarios.find(item => item.id === $('#scenarioSelect').value);
  const metric = $('#metricSelect').value;
  $('#scenarioDescription').textContent = scenario.description;
  $('#downloadBuildings').href = base + scenario.buildings;
  $('#downloadBuildings').textContent = `Download ${scenario.id === 'baseline' ? 'existing' : 'proposed'} buildings (GeoJSON)`;
  $('#downloadOverlay').href = base + scenario.layers[metric].image;
  renderLegend();
  renderIndicators();
  const status = $('#morphologyStatus');
  status.classList.remove('error');
  status.textContent = `Loading ${scenario.title.toLowerCase()} results.`;
  try {
    await map.show(scenario, metric);
    if (version !== selection) return;
    status.textContent = `${scenario.title} · ${metrics[metric].label}`;
  } catch (error) {
    console.error(error);
    if (version !== selection) return;
    status.textContent = 'Could not load this result. Choose it again to retry.';
    status.classList.add('error');
  }
}

async function start() {
  const response = await fetch(base + 'summary.json');
  if (!response.ok) throw new Error(`Morphology metadata: HTTP ${response.status}`);
  results = await response.json();
  for (const scenario of results.scenarios) $('#scenarioSelect').add(new Option(scenario.title, scenario.id));
  for (const figure of results.figures) {
    const link = document.createElement('a');
    link.href = base + figure.file;
    link.textContent = `${figure.title} (PDF)`;
    link.target = '_blank';
    link.rel = 'noopener';
    $('#figureLinks').append(link);
  }
  renderIndicators();
  map = await createMorphologyMap();
  for (const control of document.querySelectorAll('.morphology-controls select, .morphology-controls input, #zoneSelect, #resetView')) {
    control.disabled = false;
  }
  $('#scenarioSelect').addEventListener('change', showResult);
  $('#metricSelect').addEventListener('change', showResult);
  $('#zoneSelect').addEventListener('change', () => {
    renderIndicators();
    map.setFocus($('#zoneSelect').value);
  });
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
  $('#resetView').addEventListener('click', map.resetView);
  await showResult();
}

start().catch(error => {
  console.error(error);
  $('#morphologyStatus').textContent = 'Could not initialise morphology. Check the supplied data and aerial imagery, then refresh.';
  $('#morphologyStatus').classList.add('error');
});
