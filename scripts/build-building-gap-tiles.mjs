import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Cartesian3, CoplanarPolygonGeometry, PolygonHierarchy, VertexFormat,
} from 'cesium';

const root = resolve(import.meta.dirname, '..');
const modelDirectory = resolve(root, 'public/data/buildings/study-area');
const output = resolve(modelDirectory, 'gaps');
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const points = input.buildings.flatMap(building => building.faces.flatMap(face => face.rings.flat()));
if (!points.length) throw new Error('No missing-building surfaces were supplied.');
const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
  Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1])),
  Math.min(...points.map(p => p[2])), Math.max(...points.map(p => p[2]))];
const centre = Cartesian3.fromDegrees((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2);
const groups = new Map(['RoofSurface', 'WallSurface'].map(kind => [kind, { positions: [], normals: [], batches: [], indices: [] }]));
let faceCount = 0;

function localPosition([longitude, latitude, height]) {
  return Cartesian3.subtract(Cartesian3.fromDegrees(longitude, latitude, height), centre, new Cartesian3());
}

for (const [buildingIndex, building] of input.buildings.entries()) {
  for (const face of building.faces) {
    const [outer, ...holes] = face.rings;
    const hierarchy = new PolygonHierarchy(outer.map(localPosition), holes.map(ring => new PolygonHierarchy(ring.map(localPosition))));
    const geometry = CoplanarPolygonGeometry.createGeometry(new CoplanarPolygonGeometry({
      polygonHierarchy: hierarchy, vertexFormat: VertexFormat.POSITION_AND_NORMAL,
    }));
    if (!geometry?.indices?.length) continue;
    const group = groups.get(face.kind === 'RoofSurface' ? 'RoofSurface' : 'WallSurface');
    const offset = group.positions.length / 3;
    const positions = geometry.attributes.position.values;
    const normals = geometry.attributes.normal.values;
    for (let index = 0; index < positions.length; index += 3) {
      // glTF is Y-up; 3D Tiles converts it back to the ECEF axes around RTC_CENTER.
      group.positions.push(positions[index], positions[index + 2], -positions[index + 1]);
      group.normals.push(normals[index], normals[index + 2], -normals[index + 1]);
      group.batches.push(buildingIndex);
    }
    for (const index of geometry.indices) group.indices.push(offset + index);
    faceCount++;
  }
}

const chunks = [];
const views = [];
const accessors = [];
let byteLength = 0;

function attribute(values, ArrayType, componentType, type, target, extrema = false) {
  const array = new ArrayType(values);
  const data = Buffer.from(array.buffer);
  const view = views.length;
  views.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, target });
  chunks.push(data);
  byteLength += data.length;
  const padding = (4 - byteLength % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  const size = type === 'VEC3' ? 3 : 1;
  const accessor = { bufferView: view, componentType, count: values.length / size, type };
  if (extrema) {
    accessor.min = [Infinity, Infinity, Infinity];
    accessor.max = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < array.length; index++) {
      const axis = index % 3;
      accessor.min[axis] = Math.min(accessor.min[axis], array[index]);
      accessor.max[axis] = Math.max(accessor.max[axis], array[index]);
    }
  }
  accessors.push(accessor);
  return accessors.length - 1;
}

const primitives = [];
for (const [material, group] of [...groups.values()].entries()) {
  if (!group.indices.length) continue;
  primitives.push({
    attributes: {
      POSITION: attribute(group.positions, Float32Array, 5126, 'VEC3', 34962, true),
      NORMAL: attribute(group.normals, Float32Array, 5126, 'VEC3', 34962),
      _BATCHID: attribute(group.batches, Uint16Array, 5123, 'SCALAR', 34962),
    },
    indices: attribute(group.indices, Uint32Array, 5125, 'SCALAR', 34963),
    mode: 4, material,
  });
}
if (!primitives.length) throw new Error('The supplied building faces could not be triangulated.');

const model = {
  asset: { version: '2.0', copyright: '3DBAG contributors - CC BY 4.0', generator: 'Schiehaven study-area import' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives }],
  materials: [[0.42, 0.31, 0.2, 1], [0.68, 0.67, 0.61, 1]].map(baseColorFactor => ({
    doubleSided: true, pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0, roughnessFactor: 1 },
  })),
  buffers: [{ byteLength }], bufferViews: views, accessors,
};

function paddedJson(value, offset = 0, alignment = 4) {
  const json = Buffer.from(JSON.stringify(value));
  return Buffer.concat([json, Buffer.alloc((alignment - (offset + json.length) % alignment) % alignment, 32)]);
}
const json = paddedJson(model);
const binary = Buffer.concat(chunks);
const glb = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
glb.write('glTF'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(json.length, 12); glb.write('JSON', 16); json.copy(glb, 20);
glb.writeUInt32LE(binary.length, 20 + json.length); glb.write('BIN\0', 24 + json.length); binary.copy(glb, 28 + json.length);

const feature = paddedJson({ BATCH_LENGTH: input.buildings.length, RTC_CENTER: [centre.x, centre.y, centre.z] }, 28, 8);
const batch = paddedJson({ id: input.buildings.map(building => 'BAG_' + building.id), source: input.buildings.map(() => '3DBAG LoD2.2') }, 28 + feature.length, 8);
const tile = Buffer.alloc(28 + feature.length + batch.length + glb.length);
tile.write('b3dm'); tile.writeUInt32LE(1, 4); tile.writeUInt32LE(tile.length, 8);
tile.writeUInt32LE(feature.length, 12); tile.writeUInt32LE(batch.length, 20);
feature.copy(tile, 28); batch.copy(tile, 28 + feature.length); glb.copy(tile, 28 + feature.length + batch.length);
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'buildings.b3dm'), tile);
const region = [...bounds.slice(0, 4).map(value => value * Math.PI / 180), ...bounds.slice(4)];
const gapTileset = { asset: { version: '1.0' }, geometricError: 0, root: { boundingVolume: { region }, geometricError: 0, content: { uri: 'buildings.b3dm' } } };
writeFileSync(resolve(output, 'tileset.json'), JSON.stringify(gapTileset));
writeFileSync(resolve(output, 'source.json'), JSON.stringify({
  provider: '3DBAG', source: 'https://api.3dbag.nl/', licence: 'https://creativecommons.org/licenses/by/4.0/',
  buildingCount: input.buildings.length, identifiers: input.buildings.map(building => building.id),
  unavailable: input.unavailable, requestErrors: input.requestErrors, faceCount, downloadedAt: new Date().toISOString(),
  coordinates: 'Horizontal coordinates transformed from EPSG:28992; original NAP heights retained for the app display.',
}, null, 2));

const municipal = JSON.parse(readFileSync(resolve(modelDirectory, 'tileset.json'), 'utf8'));
const source = JSON.parse(readFileSync(resolve(modelDirectory, 'source.json'), 'utf8'));
const combined = {
  asset: { version: '1.0' }, geometricError: municipal.geometricError,
  root: {
    boundingVolume: municipal.root.boundingVolume, geometricError: municipal.geometricError, refine: 'ADD',
    children: [
      { boundingVolume: municipal.root.boundingVolume, geometricError: municipal.geometricError, content: { uri: 'tileset.json' } },
      { boundingVolume: gapTileset.root.boundingVolume, geometricError: 0, content: { uri: 'gaps/tileset.json' } },
    ],
  },
};
writeFileSync(resolve(modelDirectory, 'combined-tileset.json'), JSON.stringify(combined));
writeFileSync(resolve(modelDirectory, 'combined-source.json'), JSON.stringify({
  municipalTileCount: source.tileCount, tileCount: source.tileCount + 1,
  gapBuildingCount: input.buildings.length, unavailable: input.unavailable, requestErrors: input.requestErrors,
}, null, 2));
console.log(`Built a local LoD2.2 supplement: ${input.buildings.length} buildings, ${faceCount} surfaces.`);
