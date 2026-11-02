import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layers } from '../src/layers.js';
import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const readJson = async path => JSON.parse(await readFile(resolve(publicDirectory, path), 'utf8'));
const study = await readJson('data/landUse/study-area/doc.geojson');

function coordinatesOf(geometry) {
  const points = [];
  function collect(value) {
    if (typeof value[0] === 'number') points.push(value);
    else value.forEach(collect);
  }
  collect(geometry.coordinates);
  return points;
}

function boundsOf(collection) {
  const points = collection.features.flatMap(feature => coordinatesOf(feature.geometry));
  return [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1])),
    Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1]))];
}

test('the refreshed polygons cover the eastern extension and contain no duplicate or demolished buildings', async () => {
  const studyBounds = boundsOf(study);
  for (const id of ['footprints', 'green', 'water']) {
    const layer = layers.find(layer => layer.id === id);
    const data = await readJson(layer.url.slice(1));
    assert.ok(data.features.length > 0);
    assert.equal(new Set(data.features.map(feature => feature.id)).size, data.features.length);
    assert.ok(data.features.every(feature => ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)));
    const bounds = boundsOf(data);
    assert.ok(bounds[0] >= studyBounds[0] - 1e-7 && bounds[1] >= studyBounds[1] - 1e-7);
    assert.ok(bounds[2] <= studyBounds[2] + 1e-7 && bounds[3] <= studyBounds[3] + 1e-7);
    assert.ok(bounds[2] > 4.4625, `${id} still stops at the old aerial extent`);
    if (id === 'footprints') {
      assert.ok(data.features.every(feature => !['Pand gesloopt', 'Niet gerealiseerd pand', 'Bouwvergunning verleend'].includes(feature.properties.status)));
    }
  }
});

test('the AHN image covers the full study area at the recorded source resolution', async () => {
  const layer = layers.find(layer => layer.id === 'ahn');
  const metadata = await readJson(layer.metadataUrl.slice(1));
  const studyBounds = boundsOf(study);
  assert.equal(metadata.nativeResolutionMetres, 0.5);
  assert.equal(metadata.units, 'm NAP');
  assert.ok(metadata.bounds[0] <= studyBounds[0] && metadata.bounds[1] <= studyBounds[1]);
  assert.ok(metadata.bounds[2] >= studyBounds[2] && metadata.bounds[3] >= studyBounds[3]);
  const image = await readFile(resolve(publicDirectory, layer.url.slice(1)));
  assert.ok(image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  assert.equal(image.readUInt32BE(16), metadata.width);
  assert.equal(image.readUInt32BE(20), metadata.height);
  const tiff = await readFile(resolve(publicDirectory, 'data/elevation/study-area/ground-elevation.tif'));
  assert.equal(tiff.subarray(0, 4).toString('hex'), '49492a00');
});

test('the LoD2 tileset is self-contained and its hierarchy references only existing local models', async () => {
  const layer = layers.find(layer => layer.id === 'buildings-3d');
  const base = resolve(publicDirectory, 'data/buildings/study-area');
  const visited = new Set();
  let models = 0;
  async function inspect(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const location = relative(base, file);
    assert.ok(location !== '..' && !location.startsWith(`..${sep}`));
    const data = JSON.parse(await readFile(file, 'utf8'));
    async function inspectTile(tile) {
      const uri = tile.content?.uri || tile.content?.url;
      if (uri) {
        assert.ok(!/^(https?:|data:|\/)/.test(uri), `Non-local reference: ${uri}`);
        const target = resolve(dirname(file), uri);
        if (uri.endsWith('.json')) await inspect(target);
        else {
          const model = await readFile(target);
          assert.equal(model.subarray(0, 4).toString(), 'b3dm');
          assert.equal(model.readUInt32LE(8), model.length);
          models++;
        }
      }
      for (const child of tile.children || []) await inspectTile(child);
    }
    await inspectTile(data.root);
  }
  await inspect(resolve(publicDirectory, layer.url.slice(1)));
  const source = await readJson('data/buildings/study-area/source.json');
  const combined = await readJson('data/buildings/study-area/combined-source.json');
  assert.equal(source.lod, 2);
  assert.equal(combined.municipalTileCount, source.tileCount);
  assert.equal(models, combined.tileCount);
  assert.ok(source.geographicBounds[2] > 4.4625);
});

test('the downloadable GeoJSON uses the same geographic study boundary as the map', async () => {
  const download = await readJson('downloads/study_area.geojson');
  assert.equal(download.type, 'FeatureCollection');
  assert.deepEqual(boundsOf(download), boundsOf(study));
});

test('the 3DBAG supplement contains local triangulated models at their recorded geographic positions', async () => {
  const source = await readJson('data/buildings/study-area/gaps/source.json');
  const tileset = await readJson('data/buildings/study-area/gaps/tileset.json');
  const tile = await readFile(resolve(publicDirectory, 'data/buildings/study-area/gaps/buildings.b3dm'));
  const featureLength = tile.readUInt32LE(12);
  const batchLength = tile.readUInt32LE(20);
  const feature = JSON.parse(tile.subarray(28, 28 + featureLength));
  const batch = JSON.parse(tile.subarray(28 + featureLength, 28 + featureLength + batchLength));
  assert.equal(feature.BATCH_LENGTH, source.buildingCount);
  assert.equal(new Set(batch.id).size, source.buildingCount);
  assert.deepEqual(batch.id, source.identifiers.map(id => 'BAG_' + id));
  assert.ok(source.identifiers.includes('0599100100020632'), 'The large missing waterfront block was omitted');

  const glb = tile.subarray(28 + featureLength + batchLength);
  assert.equal(glb.subarray(0, 4).toString(), 'glTF');
  assert.equal(glb.readUInt32LE(8), glb.length);
  const jsonLength = glb.readUInt32LE(12);
  const model = JSON.parse(glb.subarray(20, 20 + jsonLength));
  const binary = glb.subarray(28 + jsonLength);
  assert.equal(model.buffers[0].byteLength, binary.length);
  assert.ok(model.buffers.every(buffer => !buffer.uri));
  const [west, south, east, north, low, high] = tileset.root.boundingVolume.region;
  const seen = new Set();
  function accessor(index) {
    const definition = model.accessors[index];
    const view = model.bufferViews[definition.bufferView];
    return { ...definition, offset: (view.byteOffset || 0) + (definition.byteOffset || 0) };
  }
  for (const primitive of model.meshes[0].primitives) {
    const positions = accessor(primitive.attributes.POSITION);
    const batches = accessor(primitive.attributes._BATCHID);
    const indices = accessor(primitive.indices);
    assert.equal(indices.count % 3, 0);
    for (let index = 0; index < indices.count; index++) {
      assert.ok(binary.readUInt32LE(indices.offset + index * 4) < positions.count);
    }
    for (let index = 0; index < positions.count; index++) {
      const offset = positions.offset + index * 12;
      const x = binary.readFloatLE(offset), y = binary.readFloatLE(offset + 4), z = binary.readFloatLE(offset + 8);
      // Undo glTF Y-up before restoring the ECEF tile centre.
      const location = Cartographic.fromCartesian(new Cartesian3(
        feature.RTC_CENTER[0] + x, feature.RTC_CENTER[1] - z, feature.RTC_CENTER[2] + y,
      ));
      assert.ok(location.longitude >= west - 1e-8 && location.longitude <= east + 1e-8);
      assert.ok(location.latitude >= south - 1e-8 && location.latitude <= north + 1e-8);
      assert.ok(location.height >= low - 0.02 && location.height <= high + 0.02);
      assert.ok(CesiumMath.toDegrees(location.longitude) > 4.44);
      const id = binary.readUInt16LE(batches.offset + index * 2);
      assert.ok(id < source.buildingCount);
      seen.add(id);
    }
  }
  assert.equal(seen.size, source.buildingCount);
});
