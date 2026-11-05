// These tests were AI-generated and human-checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sampleWind, readWindValues } from '../src/environment/values.js';

const base = new URL('../public/data/environment/', import.meta.url);
const summary = JSON.parse(await readFile(new URL('summary.json', base), 'utf8'));

test('map readings follow north-to-south rows and leave missing data empty', () => {
  const layer = { bounds: [4, 51, 6, 53], width: 2, height: 2 };
  const values = new Float32Array([1, NaN, 3, 4]);
  assert.equal(sampleWind(values, layer, 4.5, 52.5), 1);
  assert.equal(sampleWind(values, layer, 5.5, 52.5), null);
  assert.equal(sampleWind(values, layer, 4.5, 51.5), 3);
  assert.equal(sampleWind(values, layer, 5.5, 51.5), 4);
  for (const [lon, lat] of [[3, 52], [6, 52], [5, 51], [5, 54]]) {
    assert.equal(sampleWind(values, layer, lon, lat), null);
  }
  assert.equal(sampleWind(values, layer, 4, 53), 1);
});

test('truncated value downloads are rejected instead of producing wrong readings', () => {
  assert.throws(() => readWindValues(new ArrayBuffer(12), { width: 2, height: 2 }), /metadata/);
  const buffer = new ArrayBuffer(8);
  const bytes = new DataView(buffer);
  bytes.setFloat32(0, 1.25, true);
  bytes.setFloat32(4, NaN, true);
  const values = readWindValues(buffer, { width: 2, height: 1 });
  assert.equal(values[0], 1.25);
  assert.ok(Number.isNaN(values[1]));
});

test('all three final wind fields share registration, units and a complete colour scale', async () => {
  assert.equal(summary.sourceCrs, 'EPSG:28992');
  assert.deepEqual(summary.localOffset, [90980, 435560, 0]);
  assert.equal(summary.heightMetres, 1.5);
  assert.deepEqual(summary.scenarios.map(layer => layer.timestep), [741, 776, 774]);
  for (const layer of summary.scenarios) {
    assert.deepEqual(layer.bounds, summary.scenarios[0].bounds);
    const bytes = await readFile(new URL(layer.values, base));
    const values = readWindValues(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), layer);
    const valid = values.filter(Number.isFinite);
    assert.ok(valid.length > values.length / 4);
    assert.ok(valid.every(speed => speed >= 0 && speed <= summary.legend.maximum));
    const png = await readFile(new URL(layer.image, base));
    assert.equal(png.readUInt32BE(16), layer.width);
    assert.equal(png.readUInt32BE(20), layer.height);
    assert.ok((await readFile(new URL(layer.geotiff, base))).length > 1000);
    assert.ok((await readFile(new URL(layer.report, base))).subarray(0, 5).equals(Buffer.from('%PDF-')));
    assert.ok(layer.statistics.mean <= layer.statistics.p95);
    assert.ok(layer.statistics.p95 <= layer.statistics.max);
  }
});

test('known site and building locations catch flipped or shifted rasters', async () => {
  const layer = summary.scenarios[0];
  const bytes = await readFile(new URL(layer.values, base));
  const values = readWindValues(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), layer);
  // EPSG:28992 (90800, 435350), checked independently against the GeoTIFF.
  const speed = sampleWind(values, layer, 4.454324833550645, 51.902949116926855);
  assert.ok(Math.abs(speed - 2.213423) < .01);
  // Existing building north of the development site: no pedestrian wind field indoors.
  assert.equal(sampleWind(values, layer, 4.454084208141204, 51.90590517643106), null);
});

test('noise preserves the source scale and explicitly records approximate placement', async () => {
  assert.equal(summary.noise.numericValuesAvailable, false);
  assert.equal(summary.noise.legend.label, 'Lw (dB)');
  assert.equal(summary.noise.legend.minimum, 0);
  assert.equal(summary.noise.legend.maximum, 9);
  assert.match(summary.noise.alignment, /Approximate/);
  assert.equal(summary.noise.legend.stops[0].color, '#333399');
  const image = await readFile(new URL(summary.noise.source, base));
  assert.equal(image.readUInt32BE(16), 933);
  assert.equal(image.readUInt32BE(20), 665);
});
