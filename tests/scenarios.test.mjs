// These tests were AI-generated and human-checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext, runInContext } from 'node:vm';
import * as Cesium from 'cesium';
import { createStudyAreaClip } from '../src/map/study-area.js';
import { studyBuildingsUrl, studyBuildingsCredit } from '../src/map/buildings.js';

const root = new URL('../', import.meta.url);
const readJson = async url => JSON.parse(await readFile(new URL('public' + url, root), 'utf8'));
const html = await readFile(new URL('task47.html', root), 'utf8');
const source = await readFile(new URL('src/task47.js', root), 'utf8');
const body = source.slice(source.indexOf('renderNavigation("scenarios");'), source.lastIndexOf('start().catch('));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Run the real event handlers with local GeoJSON and a small stand-in for the renderer.
async function openPage({ scenarioGate, buildingGate } = {}) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    value: '', checked: id === 'trees', hidden: false, disabled: false,
    addEventListener(event, handler) { this[event] = handler; },
  }]));
  elements.get('scenario').value = html.match(/<option value="([^"]+)"/)[1];
  const sources = [];
  const primitives = [];
  const requestedLayers = [];
  const requestedBuildings = [];
  const viewer = {
    clock: { currentTime: Cesium.JulianDate.now() },
    scene: { globe: {}, requestRender() {}, primitives: { add(model) { primitives.push(model); } } },
    camera: { lookAt() {}, lookAtTransform() {} },
    dataSources: { async add(data) { sources.push(data); } },
  };
  const sandbox = {
    ...Cesium, Math, console: { ...console, error(error) { throw error; } },
    createStudyAreaClip, studyBuildingsUrl, studyBuildingsCredit,
    document: { getElementById(id) { assert.ok(elements.has(id), `Missing control: ${id}`); return elements.get(id); } },
    Viewer: function () { return viewer; },
    CMath: Cesium.Math,
    GeoJsonDataSource: { async load(url) {
      requestedLayers.push(url);
      if (url === '/task47/green.geojson') await scenarioGate?.promise;
      const geojson = await readJson(url);
      return { name: url, show: false, entities: { values: geojson.features.map(feature => ({
        properties: Object.fromEntries(Object.entries(feature.properties).map(([name, value]) => [name, { getValue: () => value }])),
        polygon: feature.geometry.type.includes('Polygon') ? {} : undefined,
        position: feature.geometry.type === 'Point' ? { getValue: () => Cesium.Cartesian3.fromDegrees(...feature.geometry.coordinates) } : undefined,
      })) } };
    } },
    Cesium3DTileset: { async fromUrl(resource) {
      requestedBuildings.push(resource.url);
      await buildingGate?.promise;
      return { show: false, tileFailed: new Cesium.Event() };
    } },
    readStudyArea: async () => ({ geojson: await readJson('/data/landUse/study-area/doc.geojson') }),
    fetch: async url => ({ ok: true, json: () => readJson(url) }),
    renderNavigation() {}, setStudyAreaFocus() {}, focusOnStudyArea() {},
    addStudyAreaImagery: async () => {},
    clearInterval() {}, setInterval() { return 1; },
  };
  runInNewContext(body, sandbox);
  const run = code => runInContext(code, sandbox);
  await run('start()');
  const choose = async key => { elements.get('scenario').value = key; await run('select()'); };
  return { elements, sources, primitives, requestedLayers, requestedBuildings, viewer, run, choose };
}

test('green roofs follow 3D view and allocation rounds; satellite hides every overlay and restores context', async () => {
  const page = await openPage();
  const { elements, sources, primitives, run, choose } = page;
  assert.ok(sources.every(source => !source.show));
  await choose('current');
  assert.equal(sources.find(source => source.name.endsWith('/current.geojson')).show, true);
  elements.get('context').checked = true;
  await run('showContextBuildings()');
  assert.deepEqual(page.requestedBuildings, [studyBuildingsUrl]);
  const buildings = primitives[0];
  assert.equal(buildings.clippingPolygons.inverse, true);
  assert.equal(buildings.clippingPolygons.get(0).holes.length, 0);

  await choose('access');
  assert.equal(buildings.clippingPolygons.get(0).holes.length, 1);
  const roofs = sources.find(source => source.name.endsWith('/access_green_roofs.geojson'));
  assert.equal(roofs.show, false);
  elements.get('massing').onclick();
  assert.equal(roofs.show, true);
  assert.ok(roofs.entities.values.every(entity => entity.show));
  elements.get('iteration').value = 0;
  run('paint()');
  assert.ok(roofs.entities.values.some(entity => !entity.show));
  elements.get('plan').onclick();
  assert.equal(roofs.show, false);

  page.viewer.selectedEntity = roofs.entities.values[0];
  await choose('satellite');
  assert.ok(sources.every(source => !source.show));
  assert.equal(buildings.show, false);
  assert.equal(page.viewer.selectedEntity, undefined);
  assert.equal(elements.get('context').checked, true);
  assert.equal(elements.get('context').disabled, true);
  assert.equal(elements.get('legendPanel').hidden, true);
  assert.equal(elements.get('finalLayout').hidden, true);
  assert.ok(!page.requestedLayers.some(url => url.includes('satellite')));

  await choose('current');
  assert.equal(buildings.show, true);
  assert.equal(buildings.clippingPolygons.get(0).holes.length, 0);
  assert.equal(elements.get('context').disabled, false);
  assert.equal(elements.get('legendPanel').hidden, false);
});

test('late scenario and building loads stay hidden after switching to satellite', async () => {
  const scenarioGate = deferred();
  const buildingGate = deferred();
  const page = await openPage({ scenarioGate, buildingGate });
  page.elements.get('context').checked = true;
  const buildingsLoading = page.run('showContextBuildings()');
  const scenarioLoading = page.choose('green');
  await page.choose('satellite');
  scenarioGate.resolve();
  buildingGate.resolve();
  await Promise.all([buildingsLoading, scenarioLoading]);
  assert.ok(page.sources.every(source => !source.show));
  assert.ok(page.primitives.every(model => !model.show));
  assert.equal(page.elements.get('status').textContent, 'Satellite view.');
  await page.choose('green');
  page.elements.get('massing').onclick();
  assert.equal(page.sources.find(source => source.name.endsWith('/green_green_roofs.geojson')).show, true);
  assert.equal(page.primitives.length, 1);
});
