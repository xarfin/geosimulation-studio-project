import {
  Viewer, Color, Cartesian3, Cartographic, Rectangle, HeadingPitchRange, Matrix4,
  GeoJsonDataSource, UrlTemplateImageryProvider, SingleTileImageryProvider,
  ScreenSpaceEventHandler, ScreenSpaceEventType, Math as CesiumMath,
} from 'cesium';
import { readWindValues, sampleWind } from './values.js';

const base = '/data/environment/';

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function addAerial(viewer) {
  const url = '/data/background/luchtfoto';
  const [metadata, paths] = await Promise.all([json(`${url}/tiles.json`), json(`${url}/available-tiles.json`)]);
  const provider = new UrlTemplateImageryProvider({
    url: `${url}/{z}/{x}/{reverseY}.png`,
    rectangle: Rectangle.fromDegrees(...metadata.bounds),
    minimumLevel: metadata.minzoom, maximumLevel: metadata.maxzoom,
    credit: 'Supplied study-area aerial imagery',
  });
  const available = new Set(paths);
  const blank = document.createElement('canvas');
  blank.width = blank.height = 256;
  const request = provider.requestImage.bind(provider);
  provider.requestImage = (x, y, level, pending) => {
    const path = `${level}/${x}/${2 ** level - y - 1}.png`;
    return available.has(path) ? request(x, y, level, pending) : Promise.resolve(blank);
  };
  viewer.imageryLayers.addImageryProvider(provider);
}

async function addBoundary(viewer, url, color) {
  const boundary = await GeoJsonDataSource.load(url, { clampToGround: true });
  for (const entity of boundary.entities.values) {
    if (!entity.polygon) continue;
    entity.polygon.fill = false;
    entity.polygon.outline = false;
    const ring = entity.polygon.hierarchy.getValue(viewer.clock.currentTime).positions;
    entity.polyline = {
      positions: [...ring, ring[0]], width: 2,
      material: Color.fromCssColorString(color), clampToGround: true,
    };
  }
  await viewer.dataSources.add(boundary);
  return boundary;
}

export async function createAnalysisMap(onRead) {
  const viewer = new Viewer('environmentMap', {
    baseLayer: false, baseLayerPicker: false, geocoder: false,
    animation: false, timeline: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false,
    infoBox: false, selectionIndicator: false, requestRenderMode: true,
  });
  viewer.scene.globe.baseColor = Color.fromCssColorString('#dfe6dd');
  viewer.scene.screenSpaceCameraController.enableTilt = false;
  viewer.scene.screenSpaceCameraController.enableLook = false;
  await addAerial(viewer);
  const boundaries = await Promise.all([
    addBoundary(viewer, '/task47/study_area.geojson', '#e9c257'),
    addBoundary(viewer, '/task47/development_site.geojson', '#ff60dd'),
  ]);
  const cache = new Map();
  let active;
  let selection = 0;
  let opacity = .65;
  let visible = true;
  let viewBounds;
  const marker = viewer.entities.add({
    show: false,
    point: { pixelSize: 10, color: Color.WHITE, outlineColor: Color.fromCssColorString('#173f36'), outlineWidth: 3 },
  });

  function resetView() {
    if (!viewBounds) return;
    marker.show = false;
    const rectangle = Rectangle.fromDegrees(...viewBounds);
    const centre = Rectangle.center(rectangle);
    const diagonal = Cartesian3.distance(
      Cartesian3.fromRadians(rectangle.west, rectangle.south),
      Cartesian3.fromRadians(rectangle.east, rectangle.north),
    );
    viewer.camera.lookAt(Cartesian3.fromRadians(centre.longitude, centre.latitude),
      new HeadingPitchRange(0, -Math.PI / 2, diagonal * 1.1));
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.scene.requestRender();
  }

  async function load(layer) {
    const provider = await SingleTileImageryProvider.fromUrl(base + layer.image, {
      rectangle: Rectangle.fromDegrees(...layer.bounds), credit: 'Supplied task 4.5 simulation results',
    });
    let values;
    if (layer.values) {
      const response = await fetch(base + layer.values);
      if (!response.ok) throw new Error(`Wind samples: HTTP ${response.status}`);
      values = readWindValues(await response.arrayBuffer(), layer);
    }
    const imagery = viewer.imageryLayers.addImageryProvider(provider);
    imagery.show = false;
    return { imagery, values, layer };
  }

  async function show(layer) {
    const version = ++selection;
    if (active) active.imagery.show = false;
    active = undefined;
    marker.show = false;
    viewer.scene.requestRender();
    if (!cache.has(layer.image)) {
      const pending = load(layer).catch(error => {
        cache.delete(layer.image);
        throw error;
      });
      cache.set(layer.image, pending);
    }
    const result = await cache.get(layer.image);
    if (version !== selection) return;
    active = result;
    active.imagery.alpha = opacity;
    active.imagery.show = visible;
    const firstView = !viewBounds;
    viewBounds = layer.bounds;
    if (firstView) resetView();
    viewer.scene.requestRender();
  }

  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(event => {
    if (!active?.values || !visible) return;
    const position = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
    if (!position) return;
    const location = Cartographic.fromCartesian(position);
    const longitude = CesiumMath.toDegrees(location.longitude);
    const latitude = CesiumMath.toDegrees(location.latitude);
    const speed = sampleWind(active.values, active.layer, longitude, latitude);
    marker.position = position;
    marker.show = speed !== null;
    onRead(speed, longitude, latitude);
    viewer.scene.requestRender();
  }, ScreenSpaceEventType.LEFT_CLICK);

  return {
    show,
    resetView,
    setAppearance(alpha, showOverlay) {
      opacity = alpha;
      visible = showOverlay;
      marker.show = false;
      if (active) {
        active.imagery.alpha = opacity;
        active.imagery.show = visible;
      }
      viewer.scene.requestRender();
    },
    setBoundaries(showBoundaries) {
      boundaries.forEach(boundary => { boundary.show = showBoundaries; });
      viewer.scene.requestRender();
    },
  };
}
