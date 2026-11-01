import 'cesium/Build/Cesium/Widgets/widgets.css';
import { renderNavigation } from './ui/navigation.js';
import { createAnalysisMap } from './environment/map.js';
import './styles/environment.css';

renderNavigation('environment');

const $ = selector => document.querySelector(selector);
const base = '/data/environment/';
let results;
let map;
let selection = 0;

function renderLegend(legend) {
  $('#legendTitle').textContent = legend.label;
  const span = legend.maximum - legend.minimum;
  const stops = legend.stops.map(stop => `${stop.color} ${(stop.value - legend.minimum) / span * 100}%`);
  $('#legendGradient').style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  const ticks = $('#legendTicks');
  ticks.replaceChildren();
  for (let index = 0; index <= 4; index++) {
    const tick = document.createElement('span');
    tick.textContent = Number((legend.minimum + span * index / 4).toFixed(2)).toString();
    ticks.append(tick);
  }
}

function clearReading() {
  $('#mapReading').textContent = $('#showOverlay').checked && Number($('#overlayOpacity').value) > 0
    ? 'Click the map to read wind speed.' : 'Show the overlay to read wind speed.';
}

async function showResult() {
  const version = ++selection;
  const isWind = $('#analysisSelect').value === 'wind';
  const scenario = results.scenarios.find(item => item.id === $('#scenarioSelect').value);
  const layer = isWind ? scenario : results.noise;
  $('#scenarioControl').hidden = !isWind;
  $('#scenarioSelect').disabled = !isWind;
  $('#windResults').hidden = !isWind;
  $('#windDownloads').hidden = !isWind;
  $('#noiseResults').hidden = isWind;
  renderLegend(isWind ? results.legend : results.noise.legend);
  clearReading();
  if (isWind) {
    $('#resultContext').textContent = 'Study-area results, with the same colour scale for all three wind scenarios. Transparent gaps contain no wind sample.';
    for (const [id, key] of [['#windMean', 'mean'], ['#windP95', 'p95'], ['#windMax', 'max']]) {
      $(id).textContent = `${scenario.statistics[key].toFixed(2)} m/s`;
    }
    $('#downloadWind').href = base + scenario.geotiff;
    $('#windReport').href = base + scenario.report;
    $('#methodDescription').textContent = `${scenario.title}: final saved solver step ${scenario.timestep}. Wind values are sampled from the original OpenFOAM velocity field on a 2 m grid at 1.5 m above model ground. The case's documented coordinate offset is restored before mapping. Click readings use the resulting geographic grid.`;
  } else {
    $('#resultContext').textContent = 'Clipped to the study area. Colours and units are preserved from the supplied figure.';
    $('#methodDescription').textContent = 'The map portion was cropped from the original noise figure and placed using its axis coordinates, interpreted as Web Mercator. Alignment was checked against the supplied building footprints. This remains an approximate image overlay; numeric noise readings and the noise calculation method were not supplied.';
  }
  const status = $('#analysisStatus');
  status.classList.remove('error');
  status.textContent = `Loading ${isWind ? scenario.title + ' wind results' : 'noise result'}.`;
  try {
    await map.show(layer);
    if (version !== selection) return;
    status.textContent = isWind ? `${scenario.title} · Wind speed at 1.5 m.` : 'Noise · Single supplied result · Approximate alignment.';
  } catch (error) {
    console.error(error);
    if (version !== selection) return;
    status.textContent = 'Could not load this result. Choose it again to retry.';
    status.classList.add('error');
  }
}

async function start() {
  const response = await fetch(base + 'summary.json');
  if (!response.ok) throw new Error(`Simulation metadata: HTTP ${response.status}`);
  results = await response.json();
  results.scenarios.forEach(scenario => $('#scenarioSelect').add(new Option(scenario.title, scenario.id)));
  $('#noiseSource').href = base + results.noise.source;
  map = await createAnalysisMap((speed, longitude, latitude) => {
    $('#mapReading').textContent = speed === null
      ? 'No wind sample here: building interior or outside the sampled area.'
      : `${speed.toFixed(2)} m/s at ${latitude.toFixed(5)}° N, ${longitude.toFixed(5)}° E`;
  });
  for (const control of document.querySelectorAll('.environment-controls select, .environment-controls input, #resetView')) {
    control.disabled = false;
  }
  $('#analysisSelect').addEventListener('change', showResult);
  $('#scenarioSelect').addEventListener('change', showResult);
  function updateAppearance() {
    const opacity = Number($('#overlayOpacity').value);
    $('#opacityValue').textContent = `${opacity}%`;
    map.setAppearance(opacity / 100, $('#showOverlay').checked && opacity > 0);
    clearReading();
  }
  $('#overlayOpacity').addEventListener('input', updateAppearance);
  $('#showOverlay').addEventListener('change', updateAppearance);
  $('#showBoundaries').addEventListener('change', () => map.setBoundaries($('#showBoundaries').checked));
  $('#resetView').addEventListener('click', () => { map.resetView(); clearReading(); });
  await showResult();
}

start().catch(error => {
  console.error(error);
  $('#analysisStatus').textContent = 'Could not initialise the analysis map. Check the simulation data and aerial imagery files, then refresh.';
  $('#analysisStatus').classList.add('error');
});
