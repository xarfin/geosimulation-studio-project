import {
  Viewer, Color, Cartesian3, Rectangle, HeadingPitchRange, Matrix4,
  GeoJsonDataSource, SingleTileImageryProvider,
} from 'cesium';
import { scenarioBuildings } from './indicators.js';
import { setStudyAreaFocus } from '../ui/navigation.js';
import { createStudyAreaClip } from '../map/study-area.js';
import { addStudyAreaImagery } from '../map/imagery.js';
import { useFlatTerrainFill } from '../map/flat-terrain-fill.js';

const base = '/data/morphology/';

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function addBoundary(viewer, url, color) {
  const source = await GeoJsonDataSource.load(url, { clampToGround: true });
  const positions = [];
  for (const entity of source.entities.values) {
    if (!entity.polygon) continue;
    const ring = entity.polygon.hierarchy.getValue(viewer.clock.currentTime).positions;
    positions.push(...ring);
    entity.polygon.fill = false;
    entity.polygon.outline = false;
    entity.polyline = {
      positions: [...ring, ring[0]], width: 2,
      material: Color.fromCssColorString(color), clampToGround: true,
    };
  }
  await viewer.dataSources.add(source);
  return { source, bounds: Rectangle.fromCartesianArray(positions) };
}

export async function createMorphologyMap() {
  const viewer = new Viewer('morphologyMap', {
    baseLayer: false, baseLayerPicker: false, geocoder: false,
    animation: false, timeline: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false,
    infoBox: false, selectionIndicator: false, requestRenderMode: true,
  });
  useFlatTerrainFill(viewer.scene.globe);
  viewer.scene.globe.baseColor = Color.fromCssColorString('#dfe6dd');
  viewer.scene.backgroundColor = Color.fromCssColorString('#dfe6dd');
  viewer.scene.skyBox.show = false;
  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;
  viewer.scene.screenSpaceCameraController.enableTilt = false;
  viewer.scene.screenSpaceCameraController.enableLook = false;
  const coverage = await json(base + 'study-area.geojson');
  viewer.scene.globe.clippingPolygons = createStudyAreaClip(coverage);
  const [study, site, existing] = await Promise.all([
    addBoundary(viewer, coverage, '#e9c257'),
    addBoundary(viewer, '/task47/development_site.geojson', '#ff60dd'),
    json(base + 'clipped/buildings_existing.geojson'),
    addStudyAreaImagery(viewer),
  ]);
  const overlays = new Map();
  const buildings = new Map();
  let active;
  let selection = 0;
  let opacity = .75;
  let overlayVisible = true;
  let buildingsVisible = true;
  let threeDimensional = false;

  function resetView() {
    const bounds = study.bounds;
    const centre = Rectangle.center(bounds);
    const diagonal = Cartesian3.distance(
      Cartesian3.fromRadians(bounds.west, bounds.south),
      Cartesian3.fromRadians(bounds.east, bounds.north),
    );
    const aspect = viewer.scene.canvas.clientWidth / viewer.scene.canvas.clientHeight;
    viewer.camera.lookAt(Cartesian3.fromRadians(centre.longitude, centre.latitude),
      new HeadingPitchRange(0, threeDimensional ? -Math.PI / 3 : -Math.PI / 2,
        diagonal * 1.2 / Math.min(1, aspect)));
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.scene.requestRender();
  }

  function cached(cache, key, load) {
    if (!cache.has(key)) {
      cache.set(key, load().catch(error => { cache.delete(key); throw error; }));
    }
    return cache.get(key);
  }

  async function loadOverlay(layer) {
    const provider = await SingleTileImageryProvider.fromUrl(base + layer.image, {
      rectangle: Rectangle.fromDegrees(...layer.bounds), credit: 'Supplied task 4.3 urban morphology results',
    });
    const imagery = viewer.imageryLayers.addImageryProvider(provider);
    imagery.show = false;
    return imagery;
  }

  async function loadBuildings(scenario) {
    const proposed = scenario.id === 'baseline' ? null : await json(base + 'clipped/' + scenario.buildings);
    const source = await GeoJsonDataSource.load(scenarioBuildings(existing, proposed, scenario.id));
    source.show = false;
    for (const entity of source.entities.values) {
      if (!entity.polygon) continue;
      const properties = entity.properties.getValue(viewer.clock.currentTime);
      const color = !properties.design ? '#58655f' : properties.use === 'residential' ? '#196d61' : '#cd722e';
      entity.polygon.material = Color.fromCssColorString(color);
      entity.polygon.height = 0;
      entity.polygon.outline = false;
    }
    await viewer.dataSources.add(source);
    return source;
  }

  function updateBuildings() {
    if (!active) return;
    active.buildings.show = buildingsVisible;
    for (const entity of active.buildings.entities.values) {
      if (!entity.polygon) continue;
      entity.polygon.extrudedHeight = threeDimensional
        ? entity.properties.height.getValue(viewer.clock.currentTime) : undefined;
    }
    viewer.scene.requestRender();
  }

  async function show(scenario, metric) {
    const version = ++selection;
    if (active) {
      active.imagery.show = false;
      active.buildings.show = false;
    }
    active = undefined;
    viewer.scene.requestRender();
    const layer = scenario.layers[metric];
    const [imagery, source] = await Promise.all([
      cached(overlays, layer.image, () => loadOverlay(layer)),
      cached(buildings, scenario.id, () => loadBuildings(scenario)),
    ]);
    if (version !== selection) return;
    active = { imagery, buildings: source };
    imagery.alpha = opacity;
    imagery.show = overlayVisible;
    updateBuildings();
  }

  setStudyAreaFocus(resetView);
  resetView();
  return {
    show, resetView,
    setAppearance(alpha, visible) {
      opacity = alpha;
      overlayVisible = visible;
      if (active) { active.imagery.alpha = alpha; active.imagery.show = visible; }
      viewer.scene.requestRender();
    },
    setBuildings(visible) { buildingsVisible = visible; updateBuildings(); },
    set3d(enabled) {
      threeDimensional = enabled;
      viewer.scene.screenSpaceCameraController.enableTilt = enabled;
      updateBuildings();
      resetView();
    },
    setBoundaries(visible) {
      study.source.show = site.source.show = visible;
      viewer.scene.requestRender();
    },
  };
}
