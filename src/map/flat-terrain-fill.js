import { EllipsoidTerrainProvider } from 'cesium';

export function useFlatTerrainFill(globe) {
  const provider = globe._surface._tileProvider;
  const endUpdate = provider.endUpdate;
  provider.endUpdate = function (frameState) {
    // Cesium 1.146 can stitch a missing neighbour mesh at clipped edges. Flat terrain needs no height stitching.
    if (globe.terrainProvider instanceof EllipsoidTerrainProvider) {
      this._hasFillTilesThisFrame = false;
    }
    return endUpdate.call(this, frameState);
  };
}
