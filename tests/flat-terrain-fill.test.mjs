// These tests were AI-generated and human-checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EllipsoidTerrainProvider, GlobeSurfaceTileProvider, SceneMode, TerrainFillMesh } from 'cesium';
import { useFlatTerrainFill } from '../src/map/flat-terrain-fill.js';

function frameFixture(terrainProvider) {
  const updates = [];
  const tile = { data: {
    updateExaggeration: () => updates.push('exaggeration'),
    updateSceneMode: () => updates.push('scene'),
  } };
  const provider = Object.assign(Object.create(GlobeSurfaceTileProvider.prototype), {
    _renderState: {},
    _hasFillTilesThisFrame: true,
    _hasLoadedTilesThisFrame: true,
    _vertexArraysToDestroy: [],
    _tilesToRenderByTextureCount: [],
    _clippingPolygonsDirty: false,
    _quadtree: { _tilesToRender: [], forEachLoadedTile: visit => visit(tile) },
  });
  const globe = { terrainProvider, _surface: { _tileProvider: provider } };
  const frame = { verticalExaggeration: 1, verticalExaggerationRelativeHeight: 0, mode: SceneMode.SCENE3D };
  return { provider, globe, frame, updates };
}

test('flat clipped terrain skips failing edge stitching and continues the real Cesium frame update', t => {
  const stitching = t.mock.method(TerrainFillMesh, 'updateFillTiles', () => {
    throw new TypeError("Cannot read properties of undefined (reading 'northIndicesWestToEast')");
  });
  const { provider, globe, frame, updates } = frameFixture(new EllipsoidTerrainProvider());
  assert.throws(() => provider.endUpdate(frame), /northIndicesWestToEast/);
  useFlatTerrainFill(globe);
  for (let index = 0; index < 1000; index++) {
    provider._hasFillTilesThisFrame = true;
    provider._hasLoadedTilesThisFrame = true;
    provider.endUpdate(frame);
  }
  assert.equal(stitching.mock.callCount(), 1);
  assert.deepEqual(updates, ['exaggeration', 'scene']);
  assert.equal(provider._oldSceneMode, SceneMode.SCENE3D);
});

test('the workaround leaves height stitching enabled for non-flat terrain', t => {
  const stitching = t.mock.method(TerrainFillMesh, 'updateFillTiles', () => {});
  const { provider, globe, frame } = frameFixture({});
  useFlatTerrainFill(globe);
  provider.endUpdate(frame);
  assert.equal(stitching.mock.callCount(), 1);
});
