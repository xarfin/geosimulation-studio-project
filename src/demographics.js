import 'cesium/Build/Cesium/Widgets/widgets.css';
import { renderNavigation } from './ui/navigation.js';
import './styles/demographics.css';
import { neighbourhoodStyles, formatValue } from './demographics/indicators.js';
import { createNeighbourhoodMap } from './demographics/map.js';

renderNavigation('demographics');

let neighbourhoods = [];
let map;

function showError(selector, message) {
  const status = document.querySelector(selector);
  status.textContent = message;
  status.hidden = false;
}

function focusNeighbourhood(code, zoom = true) {
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

async function start() {
  const response = await fetch('/data/demographics/neighbourhoods.geojson');
  if (!response.ok) throw new Error(`CBS data: HTTP ${response.status}`);
  const collection = await response.json();
  neighbourhoods = collection.features.map(feature => feature.properties);
  renderCards();

  try {
    map = await createNeighbourhoodMap(collection, code => focusNeighbourhood(code, false));
    map.setFocus('all');
  } catch (error) {
    console.error(error);
    showError('#mapStatus', 'Map unavailable. The neighbourhood figures remain available below.');
  }
}

start().catch(error => {
  console.error(error);
  showError('#dataStatus', 'Could not load the CBS figures. Refresh to retry.');
});
