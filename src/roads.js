import 'cesium/Build/Cesium/Widgets/widgets.css';
import { renderNavigation } from './ui/navigation.js';
import { createRoadsMap } from './roads/map.js';
import { networkColors, walkingMean, walkingChange, siteColors } from './roads/results.js';
import './styles/roads.css';

renderNavigation('roads');

const $ = selector => document.querySelector(selector);
let results;
let map;
let selection = 0;

function showError(message = '') {
  $('#roadsStatus').textContent = message;
  $('#roadsStatus').hidden = !message;
}

function swatch(color, kind = '') {
  const mark = document.createElement('i');
  mark.className = `road-swatch ${kind}`;
  mark.style.setProperty('--swatch-color', color);
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

function renderLegend(isAccessibility, scenario) {
  const legend = $('#mapLegend');
  legend.replaceChildren();
  const entries = [
    ['Housing', siteColors.residential, 'building'],
    ['Outdoor sports', siteColors.outdoor_sports, 'building'],
    ['Indoor sports', siteColors.indoor_sports, 'building'],
    ['Site boundary', '#e9c257', ''],
  ];
  if (isAccessibility) {
    if (scenario.id === 'proposed') entries.push(['Exits / crossing', '#42c58d', 'point']);
  } else {
    entries.push(['Added vehicles/hour · line width', networkColors[scenario.id], '']);
    entries.push(['Exits', '#365362', 'point']);
    if (scenario.id === 'proposed') entries.push(['Conceptual access links', networkColors.proposed, 'dashed']);
  }
  for (const [text, color, kind] of entries) {
    const item = document.createElement('span');
    item.append(swatch(color, kind), text);
    legend.append(item);
  }
}

function renderCards(items) {
  $('#resultCards').replaceChildren();
  for (const [title, value] of items) {
    const card = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = title;
    const number = document.createElement('strong');
    number.textContent = value;
    card.append(label, number);
    $('#resultCards').append(card);
  }
}

function renderTable(isAccessibility, scenario) {
  const [current, proposed] = results.scenarios;
  $('#comparisonCaption').textContent = isAccessibility
    ? 'Mean walking distance by destination (m)' : 'Added vehicles per exit (vehicles/hour)';
  $('#comparisonLabel').textContent = isAccessibility ? 'Destination' : 'Exit';
  const rows = isAccessibility
    ? results.destinations.map(destination => ({
      label: destination.label, color: destination.color,
      values: [current, proposed].map(network => Math.round(network.walkingByDestination[destination.id])),
    }))
    : [['E1', 'Existing 1'], ['E2', 'Existing 2'], ['P1', 'Proposed NW'], ['P2', 'Proposed NE']].map(([id, label]) => ({
      label, values: [current, proposed].map(network => network.exitDemand[id] ?? '—'),
    }));
  $('#comparisonRows').replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    if (row.color) heading.append(swatch(row.color));
    heading.append(row.label);
    if (isAccessibility) heading.title = results.destinations.find(destination => destination.label === row.label).name;
    tr.append(heading);
    row.values.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (results.scenarios[index].id === scenario.id) cell.className = 'selected-network';
      tr.append(cell);
    });
    $('#comparisonRows').append(tr);
  }
}

async function showResult() {
  const version = ++selection;
  const analysis = $('#analysisSelect').value;
  const isAccessibility = analysis === 'accessibility';
  const scenario = results.scenarios.find(item => item.id === $('#networkSelect').value);
  const destination = $('#destinationSelect').value;
  $('#destinationControl').hidden = !isAccessibility;
  $('#destinationSelect').disabled = !isAccessibility;
  $('#resultsHeading').textContent = isAccessibility ? 'Walking distances' : `Traffic flow · ${scenario.exitCount} exits`;
  if (isAccessibility) {
    const change = scenario.id === 'current' ? 0 : walkingChange(...results.scenarios, destination);
    renderCards([
      ['Mean walking distance', `${Math.round(walkingMean(scenario, destination))} m`],
      ['Change vs current', `${change > 0 ? '+' : ''}${change.toFixed(1)}%`],
    ]);
    $('#resultContext').textContent = 'Mean shortest routes from the six building entrances.';
  } else {
    renderCards([
      ['Highest added road flow', `${scenario.maxAddedVehiclesPerHour} veh/h`],
      ['Mean modelled trip', `${(scenario.meanTripDistanceM / 1000).toFixed(2)} km`],
    ]);
    $('#resultContext').textContent = 'Modelled additional traffic · both directions combined.';
  }
  renderLegend(isAccessibility, scenario);
  renderTable(isAccessibility, scenario);
  showError();
  try {
    await map.show(analysis, scenario, destination);
  } catch (error) {
    console.error(error);
    if (version !== selection) return;
    showError('Could not load this network. Select it again to retry.');
  }
}

async function start() {
  const response = await fetch('/data/roads/summary.json');
  if (!response.ok) throw new Error(`Road-network results: HTTP ${response.status}`);
  results = await response.json();
  for (const destination of results.destinations) {
    $('#destinationSelect').add(new Option(destination.label, destination.id));
  }
  map = await createRoadsMap(results, message => {
    $('#mapReading').textContent = message;
    $('#mapReading').hidden = !message;
  }, showError);
  for (const control of document.querySelectorAll('.roads-controls select')) {
    control.disabled = false;
    control.addEventListener('change', showResult);
  }
  await showResult();
}

start().catch(error => {
  console.error(error);
  showError('Could not initialise the road-network map. Refresh to try again.');
});
