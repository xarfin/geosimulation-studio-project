import 'cesium/Build/Cesium/Widgets/widgets.css';
import { renderNavigation } from './ui/navigation.js';
import './styles/demographics.css';
import {
  allIndicators, neighbourhoodStyles, formatValue,
} from './demographics/indicators.js';
import { createNeighbourhoodMap } from './demographics/map.js';

renderNavigation('demographics');

const select = document.querySelector('#neighbourhoodFocus');
let neighbourhoods = [];
let map;

function focusNeighbourhood(code, zoom = true) {
  select.value = code;
  document.querySelectorAll('[data-neighbourhood]').forEach(element => {
    element.classList.toggle('is-muted', code !== 'all' && element.dataset.neighbourhood !== code);
  });
  map?.setFocus(code, zoom);
}

function renderCards() {
  const cards = document.querySelector('#neighbourhoodCards');
  for (const area of neighbourhoods) {
    const card = document.createElement('article');
    card.className = 'neighbourhood-card';
    card.dataset.neighbourhood = area.buurtcode;
    card.style.setProperty('--neighbourhood-color', neighbourhoodStyles[area.buurtcode].color);
    const heading = document.createElement('h2');
    heading.textContent = area.buurtnaam;
    const code = document.createElement('small');
    code.textContent = area.buurtcode;
    const population = document.createElement('p');
    const value = document.createElement('strong');
    value.textContent = formatValue(area.population);
    population.append(value, ' residents');
    const metrics = document.createElement('dl');
    for (const [label, key, decimals] of [
      ['Residents/km²', 'population_density_per_km2', 0],
      ['Households', 'households_total', 0],
      ['People/household', 'average_household_size', 1],
      ['Homes', 'housing_units', 0],
    ]) {
      const name = document.createElement('dt');
      name.textContent = label;
      const amount = document.createElement('dd');
      amount.textContent = formatValue(area[key], decimals);
      metrics.append(name, amount);
    }
    card.append(heading, code, population, metrics);
    cards.append(card);
  }
}

function renderTable() {
  const rows = document.querySelector('#indicatorRows');
  for (const indicator of allIndicators) {
    const row = document.createElement('tr');
    const title = document.createElement('th');
    title.scope = 'row';
    title.textContent = `${indicator.label} (${indicator.unit})`;
    row.append(title);
    for (const area of neighbourhoods) {
      const cell = document.createElement('td');
      cell.textContent = formatValue(area[indicator.key], indicator.decimals ?? 0);
      row.append(cell);
    }
    rows.append(row);
  }
}

async function start() {
  const response = await fetch('/data/demographics/neighbourhoods.geojson');
  if (!response.ok) throw new Error(`CBS data: HTTP ${response.status}`);
  const collection = await response.json();
  neighbourhoods = collection.features.map(feature => feature.properties);
  for (const area of neighbourhoods) select.add(new Option(area.buurtnaam, area.buurtcode));
  renderCards();
  renderTable();
  select.disabled = false;
  document.querySelector('#dataStatus').textContent = 'Comparing complete CBS neighbourhoods · 2025.';
  select.addEventListener('change', () => focusNeighbourhood(select.value));

  try {
    map = await createNeighbourhoodMap(collection, code => focusNeighbourhood(code, false));
    map.setFocus(select.value);
    document.querySelector('#neighbourhoodView').disabled = false;
    document.querySelector('#neighbourhoodView').addEventListener('click', () => focusNeighbourhood('all'));
    document.querySelector('#studyView').addEventListener('click', () => map.showStudyArea());
  } catch (error) {
    console.error(error);
    document.querySelector('#mapStatus').textContent = 'Map unavailable. The neighbourhood figures remain available below.';
  }
}

start().catch(error => {
  console.error(error);
  const status = document.querySelector('#dataStatus');
  status.textContent = 'Could not load the CBS figures. Refresh to retry.';
  status.classList.add('error');
  document.querySelector('#mapStatus').textContent = 'Neighbourhood data unavailable.';
});
