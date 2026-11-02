import {
  Viewer, Color, GeoJsonDataSource, Cartesian2, Cartesian3, Rectangle,
  LabelStyle, DistanceDisplayCondition,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { renderNavigation, setStudyAreaFocus } from './ui/navigation.js';
import { readStudyArea, focusOnBounds, netherlandsBounds } from './map/study-area.js';
import { createBasemapControls } from './map/basemaps.js';
import './styles/introduction.css';

renderNavigation('introduction');

const status = document.querySelector('#mapStatus');
const focusButton = document.querySelector('#focusNeighbourhood');
const mapButton = document.querySelector('#streetMap');
const satelliteButton = document.querySelector('#satelliteMap');

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

async function addBoundary(viewer, geojson, color) {
  const source = await GeoJsonDataSource.load(geojson, { clampToGround: true });
  for (const entity of source.entities.values) {
    if (!entity.polygon) continue;
    entity.polygon.fill = false;
    entity.polygon.outline = false;
    const positions = entity.polygon.hierarchy.getValue(viewer.clock.currentTime).positions;
    entity.polyline = {
      positions: [...positions, positions[0]],
      width: 3,
      material: Color.fromCssColorString(color),
      clampToGround: true,
    };
  }
  await viewer.dataSources.add(source);
}

async function start() {
  const viewer = new Viewer('introductionMap', {
    baseLayer: false, baseLayerPicker: false, geocoder: false,
    animation: false, timeline: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false,
    infoBox: false, selectionIndicator: false, requestRenderMode: true,
  });
  viewer.scene.globe.baseColor = Color.fromCssColorString('#e5e9e3');
  viewer.scene.screenSpaceCameraController.enableTilt = false;
  viewer.scene.screenSpaceCameraController.enableLook = false;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 2_000_000;
  focusOnBounds(viewer, netherlandsBounds, { animate: false });

  const backgrounds = createBasemapControls(viewer, setStatus);
  function selectBackground(name) {
    backgrounds.select(name);
    mapButton.setAttribute('aria-pressed', String(name === 'map'));
    satelliteButton.setAttribute('aria-pressed', String(name === 'satellite'));
  }
  mapButton.addEventListener('click', () => selectBackground('map'));
  satelliteButton.addEventListener('click', () => selectBackground('satellite'));
  document.querySelector('#countryView').addEventListener('click', () => focusOnBounds(viewer, netherlandsBounds));
  selectBackground('map');

  const study = await readStudyArea();
  await addBoundary(viewer, study.geojson, '#c38c24');
  const centre = Rectangle.center(study.bounds);
  viewer.entities.add({
    position: Cartesian3.fromRadians(centre.longitude, centre.latitude),
    point: {
      pixelSize: 10,
      color: Color.fromCssColorString('#c38c24'),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      distanceDisplayCondition: new DistanceDisplayCondition(15_000, Number.POSITIVE_INFINITY),
    },
    label: {
      text: 'Schiehaven Noord',
      font: '14px system-ui, sans-serif',
      fillColor: Color.fromCssColorString('#173f36'),
      outlineColor: Color.WHITE,
      outlineWidth: 4,
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -24),
      distanceDisplayCondition: new DistanceDisplayCondition(15_000, Number.POSITIVE_INFINITY),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const focusStudyArea = () => focusOnBounds(viewer, study.bounds);
  focusButton.disabled = false;
  focusButton.addEventListener('click', focusStudyArea);
  setStudyAreaFocus(focusStudyArea);
  if (new URLSearchParams(window.location.search).get('view') === 'study-area') {
    focusOnBounds(viewer, study.bounds, { animate: false });
  }
  viewer.scene.requestRender();

  try {
    await addBoundary(viewer, '/data/landUse/development-site/doc.geojson', '#c95788');
    viewer.scene.requestRender();
  } catch (error) {
    console.error(error);
    setStatus('Study area ready. The development-site boundary could not load.', true);
  }
}

start().catch(error => {
  console.error(error);
  setStatus('The map could not be prepared. Check the study-area files and WebGL support, then refresh.', true);
});
