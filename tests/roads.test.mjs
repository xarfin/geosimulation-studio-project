// These tests were AI-generated and human-checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { walkingMean, walkingChange, flowWidth, routeVisible, networkColors, siteColors } from '../src/roads/results.js';

const base = new URL('../public/data/roads/', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, base), 'utf8'));
const summary = await readJson('summary.json');

test('walking results cover all six buildings and five destinations with means from the source routes', async () => {
  for (const scenario of summary.scenarios) {
    const routes = (await readJson(scenario.routes)).features.map(feature => feature.properties);
    assert.equal(routes.length, 30);
    assert.equal(new Set(routes.map(route => `${route.building}:${route.destination_id}`)).size, 30);
    assert.ok(Math.abs(scenario.meanWalkDistanceM - routes.reduce((sum, route) => sum + route.distance_m, 0) / 30) < 1e-9);
    for (const destination of summary.destinations) {
      const selected = routes.filter(route => route.destination_id === destination.id);
      assert.equal(selected.length, 6);
      assert.equal(new Set(selected.map(route => route.building)).size, 6);
      assert.ok(Math.abs(scenario.walkingByDestination[destination.id] - selected.reduce((sum, route) => sum + route.distance_m, 0) / 6) < 1e-9);
      assert.equal(routes.filter(route => routeVisible(route, destination.id)).length, 6);
    }
  }
  assert.equal(Math.round(walkingMean(summary.scenarios[0], 'all')), 415);
  assert.equal(Math.round(walkingMean(summary.scenarios[1], 'all')), 407);
  assert.equal(walkingChange(...summary.scenarios, 'all').toFixed(1), '-1.8');
});

test('traffic uses peak link flow rather than a sum over road segments, with a common width scale', async () => {
  assert.equal(summary.trafficIsObserved, false);
  const destinations = (await readJson(summary.trafficDestinations)).features;
  assert.deepEqual(destinations.map(feature => feature.properties.name),
    ['North destination', 'East destination', 'South destination', 'West destination']);
  for (const [index, scenario] of summary.scenarios.entries()) {
    const features = (await readJson(scenario.flow)).features;
    for (const destination of destinations) {
      assert.ok(features.some(feature => {
        const points = feature.geometry.coordinates;
        return [points[0], points.at(-1)].some(point => point.every((value, axis) =>
          Math.abs(value - destination.geometry.coordinates[axis]) < 1e-7));
      }));
    }
    const values = features.map(feature => feature.properties.vehicles_per_hour);
    assert.equal(scenario.maxAddedVehiclesPerHour, Math.max(...values));
    assert.equal(scenario.maxAddedVehiclesPerHour, index === 0 ? 48 : 30);
    assert.ok(features.every(feature => feature.properties.is_observed_traffic === false));
    assert.ok(flowWidth(Math.min(...values)) < flowWidth(Math.max(...values)));
    const exits = (await readJson(scenario.exits)).features;
    assert.equal(exits.length, scenario.exitCount);
    assert.equal(exits.length, index === 0 ? 2 : 4);
    assert.deepEqual(new Set(exits.map(feature => feature.properties.id)), new Set(Object.keys(scenario.exitDemand)));
    assert.equal(Object.values(scenario.exitDemand).reduce((sum, value) => sum + value, 0), 60);
  }
  const proposed = (await readJson(summary.scenarios[1].flow)).features;
  const connectors = proposed.filter(feature => feature.properties.link_type);
  assert.equal(connectors.length, 2);
  assert.ok(connectors.every(feature => feature.properties.presentation_style === 'dashed'));
});

test('layers have geographic coordinates and retain the conceptual intervention metadata', async () => {
  function check(coordinates) {
    if (typeof coordinates[0] === 'number') {
      assert.ok(coordinates[0] > 4.4 && coordinates[0] < 4.5);
      assert.ok(coordinates[1] > 51.8 && coordinates[1] < 52);
    } else coordinates.forEach(check);
  }
  for (const scenario of summary.scenarios) {
    for (const path of [scenario.routes, scenario.flow, scenario.exits]) {
      for (const feature of (await readJson(path)).features) check(feature.geometry.coordinates);
    }
  }
  const site = await readJson('accessibility/site-and-buildings.geojson');
  assert.equal(site.features.filter(feature => feature.properties.type === 'Design_B').length, 6);
  const interventions = await readJson('accessibility/interventions.geojson');
  assert.equal(interventions.features.filter(feature => feature.properties.type === 'conceptual_site_exit').length, 3);
  assert.equal(interventions.features.filter(feature => feature.properties.type === 'conceptual_crossing').length, 1);
  const entrances = await readJson('accessibility/entrances.geojson');
  assert.equal(entrances.features.length, 6);
  assert.ok(entrances.features.every(feature => feature.properties.type === 'assumed_entrance'));
});

test('figure-derived values retain their original sources and archive', async () => {
  assert.deepEqual(summary.scenarios.map(scenario => scenario.meanTripDistanceM), [2141, 2213]);
  for (const path of Object.values(summary.trafficFigureValues)) {
    const png = await readFile(new URL(path, base));
    assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  }
  const zip = await readFile(new URL('task48-source.zip', base));
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
});

test('site context adds the outdoor sports allocation and identifies the existing indoor footprint', async () => {
  const site = await readJson('site-context.geojson');
  const original = await readJson('accessibility/site-and-buildings.geojson');
  assert.equal(site.features.length, 8);
  assert.equal(site.features.filter(feature => feature.properties.use === 'residential').length, 5);
  const indoor = site.features.find(feature => feature.properties.use === 'indoor_sports');
  assert.equal(indoor.properties.building, 2);
  assert.ok(Math.abs(indoor.properties.area_m2 - 225) < .01);
  const outdoor = site.features.find(feature => feature.properties.use === 'outdoor_sports');
  assert.ok(Math.abs(outdoor.properties.area_m2 - 3675) < .01);
  assert.ok(['Polygon', 'MultiPolygon'].includes(outdoor.geometry.type));
  for (const feature of original.features) {
    const displayed = site.features.find(candidate => candidate.properties.type === feature.properties.type
      && candidate.properties.building === feature.properties.building);
    assert.deepEqual(displayed.geometry, feature.geometry);
  }
});

test('switching network and destination updates cards and tables, with an empty final method section', async () => {
  const html = await readFile(new URL('../roads.html', import.meta.url), 'utf8');
  const method = html.match(/<section class="method-section"[\s\S]*?<\/section>/)[0];
  assert.match(method, /<h2 id="methodHeading">Method and Sources<\/h2>\s*<\/section>/);
  function element() {
    return {
      value: '', children: [], style: { setProperty() {} },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      add(option) { this.children.push(option); },
      setAttribute() {},
      addEventListener(type, handler) { this[type] = handler; },
    };
  }
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => ['#' + id, element()]));
  elements.get('#analysisSelect').value = 'accessibility';
  elements.get('#networkSelect').value = 'current';
  elements.get('#destinationSelect').value = 'all';
  const shown = [];
  const sandbox = {
    walkingMean, walkingChange, networkColors, siteColors,
    renderNavigation() {},
    createRoadsMap: async () => ({ show: async (...args) => shown.push(args) }),
    fetch: async () => ({ ok: true, json: async () => summary }),
    Option: function(text, value) { this.text = text; this.value = value; },
    document: {
      querySelector(selector) { assert.ok(elements.has(selector), selector); return elements.get(selector); },
      querySelectorAll() { return ['analysisSelect', 'networkSelect', 'destinationSelect'].map(id => elements.get('#' + id)); },
      createElement: element,
    },
    console,
  };
  const code = (await readFile(new URL('../src/roads.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  runInNewContext(code, sandbox);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shown[0][1].id, 'current');
  elements.get('#networkSelect').value = 'proposed';
  elements.get('#destinationSelect').value = 'TRAM';
  await elements.get('#networkSelect').change();
  assert.equal(shown.at(-1)[1].id, 'proposed');
  assert.equal(shown.at(-1)[2], 'TRAM');
  assert.equal(elements.get('#resultCards').children[0].children[1].textContent, '169 m');
  assert.equal(elements.get('#comparisonRows').children.length, 5);
  elements.get('#analysisSelect').value = 'traffic';
  await elements.get('#analysisSelect').change();
  assert.equal(elements.get('#destinationControl').hidden, true);
  assert.equal(elements.get('#resultsHeading').textContent, 'Traffic flow · 4 exits');
  assert.equal(elements.get('#resultCards').children[0].children[1].textContent, '30 veh/h');
  assert.equal(elements.get('#comparisonRows').children.length, 4);
});

test('a slow earlier map request cannot reappear after switching to the proposed network', async () => {
  const sources = [];
  const cameraViews = [];
  let releaseCurrent;
  const delayedCurrent = new Promise(resolve => { releaseCurrent = resolve; });
  const color = { withAlpha() { return this; } };
  const code = (await readFile(new URL('../src/roads/map.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+';\r?\n/gm, '')
    .replace('export async function createRoadsMap', 'async function createRoadsMap');
  const sandbox = {
    networkColors, flowWidth, routeVisible, siteColors,
    Color: { fromCssColorString: () => color, WHITE: color },
    LabelStyle: { FILL_AND_OUTLINE: 1 }, HeightReference: { CLAMP_TO_GROUND: 1 },
    Cartesian2: class {}, Cartesian3: { fromDegrees: (...coordinates) => coordinates },
    PolylineOutlineMaterialProperty: class {}, PolylineDashMaterialProperty: class {},
    ScreenSpaceEventHandler: class { setInputAction() {} }, ScreenSpaceEventType: { LEFT_CLICK: 1 },
    createBasemapControls: () => ({ select: async () => {} }),
    setStudyAreaFocus() {}, focusOnStudyArea() {},
    boundsOfGeoJson: collection => collection,
    focusOnBounds: (_viewer, bounds) => cameraViews.push(bounds),
    Viewer: class {
      clock = { currentTime: 0 };
      scene = { globe: {}, screenSpaceCameraController: {}, requestRender() {} };
      dataSources = { add: async source => { sources.push(source); return source; } };
    },
    GeoJsonDataSource: {
      async load(geojson) {
        return { entities: { values: geojson.features.map(feature => {
          const properties = { getValue: () => feature.properties };
          for (const [key, value] of Object.entries(feature.properties)) properties[key] = { getValue: () => value };
          const entity = { properties, show: true };
          if (feature.geometry.type.includes('Polygon')) {
            entity.polygon = { hierarchy: { getValue: () => ({ positions: [[1, 2], [3, 4], [5, 6]] }) } };
          } else if (feature.geometry.type.includes('LineString')) entity.polyline = {};
          return entity;
        }) } };
      },
    },
    async fetch(url) {
      const path = url.replace('/data/roads/', '');
      if (path === summary.scenarios[0].routes) await delayedCurrent;
      return { ok: true, json: async () => readJson(path) };
    },
  };
  runInNewContext(code + '\nthis.makeMap = createRoadsMap;', sandbox);
  const map = await sandbox.makeMap(summary, () => {}, () => {});
  const first = map.show('accessibility', summary.scenarios[0], 'all');
  await map.show('accessibility', summary.scenarios[1], 'TRAM');
  releaseCurrent();
  await first;
  const currentRoutes = sources.find(source => source.entities.values[0]?.properties.getValue().scenario === 'Current');
  const proposedRoutes = sources.find(source => source.entities.values[0]?.properties.getValue().scenario === 'Proposed');
  assert.equal(currentRoutes.show, false);
  assert.equal(proposedRoutes.show, true);
  assert.equal(proposedRoutes.entities.values.filter(entity => entity.show).length, 6);
  assert.equal(cameraViews.length, 1);
  const context = sources.find(source => source.entities.values.some(entity => entity.properties.getValue().use === 'outdoor_sports'));
  assert.equal(context.show, true);
  const sports = context.entities.values.filter(entity => ['outdoor_sports', 'indoor_sports'].includes(entity.properties.getValue().use));
  assert.equal(sports.length, 2);
  assert.ok(sports.every(entity => !entity.label));
  const interventions = sources.find(source => source.entities.values.some(entity => entity.properties.getValue().type === 'conceptual_crossing'));
  const exits = interventions.entities.values.filter(entity => entity.properties.getValue().type === 'conceptual_site_exit');
  assert.equal(exits.length, 3);
  assert.ok(exits.every(entity => entity.polyline.width === 6 && !entity.point));
  assert.equal(interventions.entities.values.find(entity => entity.point).label.text, 'Crossing');
  await map.show('traffic', summary.scenarios[1], 'all');
  assert.equal(proposedRoutes.show, false);
  assert.equal(interventions.show, false);
  assert.equal(context.show, true);
  assert.equal(cameraViews.length, 2);
  assert.ok(sources.some(source => source.show && source.entities.values.length === 4));
  const trafficDestinations = sources.find(source => source.entities.values[0]?.properties.getValue().type === 'traffic_destination');
  assert.equal(trafficDestinations.show, true);
  assert.deepEqual(trafficDestinations.entities.values.map(entity => entity.label.text),
    ['North destination', 'East destination', 'South destination', 'West destination']);
  await map.show('traffic', summary.scenarios[0], 'all');
  assert.equal(trafficDestinations.show, true);
  await map.show('accessibility', summary.scenarios[0], 'all');
  assert.equal(trafficDestinations.show, false);
});
