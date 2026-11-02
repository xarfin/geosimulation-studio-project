import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext, runInContext } from 'node:vm';
import { indicators, metrics, formatIndicator, scenarioBuildings } from '../src/morphology/indicators.js';

const base = new URL('../public/data/morphology/', import.meta.url);
const readJson = async name => JSON.parse(await readFile(new URL(name, base), 'utf8'));
const summary = await readJson('summary.json');

test('all nine original overlays use valid geographic registration and PNG images', async () => {
  const rectangles = await readJson('overlays_rectangles.json');
  assert.equal(summary.numericRasterAvailable, false);
  assert.equal(summary.observerHeightMetres, 1.5);
  const images = new Set();
  for (const scenario of summary.scenarios) {
    for (const metric of ['svf', 'svfb', 'hw']) {
      const layer = scenario.layers[metric];
      const rectangle = rectangles[`${metric}_${scenario.id}`];
      assert.deepEqual(layer.bounds, [rectangle.west, rectangle.south, rectangle.east, rectangle.north]);
      const [west, south, east, north] = layer.bounds;
      assert.ok(west < 4.4516 && east > 4.4584 && south < 51.9022 && north > 51.9043);
      const png = await readFile(new URL(layer.image, base));
      assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
      assert.ok(png.readUInt32BE(16) > 500 && png.readUInt32BE(20) > 500);
      images.add(layer.image);
    }
  }
  assert.equal(images.size, 9);
});

test('designs replace cleared buildings and retain all other existing buildings with their heights', async () => {
  const existing = await readJson('buildings_existing.geojson');
  assert.equal(existing.features.length, 502);
  assert.equal(existing.features.filter(feature => feature.properties.cleared_in_designs).length, 3);
  const clearedIds = new Set(existing.features.filter(f => f.properties.cleared_in_designs).map(f => f.properties.gml_id));
  assert.equal(scenarioBuildings(existing, null, 'baseline').features.length, 502);
  for (const scenario of summary.scenarios.slice(1)) {
    const proposed = await readJson(scenario.buildings);
    const combined = scenarioBuildings(existing, proposed, scenario.id);
    assert.equal(combined.features.length, 505);
    assert.ok(combined.features.every(f => !clearedIds.has(f.properties.gml_id)));
    assert.ok(combined.features.every(f => Number.isFinite(f.properties.height) && f.properties.height > 0));
    assert.equal(combined.features.filter(f => f.properties.use === 'residential').length, 5);
    assert.equal(combined.features.filter(f => f.properties.use === 'indoor_sports').length, 1);
  }
});

test('all area summaries preserve the supplied CSV values and every indicator is represented', async () => {
  const csv = (await readFile(new URL('indicators.csv', base), 'utf8')).trim().split(/\r?\n/).map(row => row.split(','));
  const [headings, ...records] = csv;
  assert.equal(records.length, 6);
  assert.deepEqual(new Set(indicators.map(item => item.key)), new Set(headings.slice(2)));
  for (const values of records) {
    const record = summary.indicators.find(row => row.scenario === values[0] && row.zone === values[1]);
    for (let index = 2; index < headings.length; index++) {
      assert.equal(record[headings[index]], Number(values[index]));
    }
    assert.ok(Math.abs(record.GSI - record.footprint_m2 / record.land_area_m2) < .001);
    assert.ok(Math.abs(record.OSR - (1 - record.GSI) / record.FSI) < .003);
  }
  const green = indicators.find(item => item.key === 'green_share');
  assert.equal(formatIndicator(.564, green), '56.4%');
  const height = indicators.find(item => item.key === 'height_mean_m');
  assert.equal(formatIndicator(26.9, height), '26.9 m');
});

test('supplied PDF comparisons and original source archive remain available', async () => {
  assert.equal(summary.figures.length, 6);
  for (const figure of summary.figures) {
    const pdf = await readFile(new URL(figure.file, base));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  }
  const zip = await readFile(new URL('task43-source.zip', base));
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
});

test('the simplified morphology page loads and changes results with development-site indicators', async () => {
  const html = await readFile(new URL('../morphology.html', import.meta.url), 'utf8');
  function element() {
    return {
      value: '', style: {}, children: [], disabled: true,
      classList: { add() {}, remove() {} },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      add(option) { if (!this.value) this.value = option.value; },
      addEventListener(event, handler) { this[event] = handler; },
    };
  }
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => ['#' + id, element()]));
  elements.get('#metricSelect').value = 'svf';
  const displayed = [];
  const map = {
    async show(scenario, metric) { displayed.push([scenario.id, metric]); },
    resetView() {}, setAppearance() {}, setBuildings() {}, set3d() {}, setBoundaries() {},
  };
  const sandbox = {
    indicators, metrics, formatIndicator,
    document: {
      querySelector(selector) { assert.ok(elements.has(selector), `Missing control: ${selector}`); return elements.get(selector); },
      querySelectorAll: () => [...elements.values()], createElement: element,
    },
    Option: function (text, value) { return { text, value }; },
    fetch: async () => ({ ok: true, json: async () => summary }),
    renderNavigation() {}, createMorphologyMap: async () => map,
    console: { error(error) { throw error; } },
  };
  const source = await readFile(new URL('../src/morphology.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf("renderNavigation('morphology');"), source.lastIndexOf('start().catch('));
  runInNewContext(body, sandbox);
  await runInContext('start()', sandbox);
  assert.deepEqual(displayed, [['baseline', 'svf']]);
  elements.get('#scenarioSelect').value = 'design_A';
  elements.get('#metricSelect').value = 'hw';
  await elements.get('#scenarioSelect').change();
  assert.deepEqual(displayed.at(-1), ['design_A', 'hw']);
  const cards = elements.get('#indicatorCards').children;
  assert.equal(cards.length, 6);
  assert.equal(cards[0].children[1].textContent, '14.6%');
});
