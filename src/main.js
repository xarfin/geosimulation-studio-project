import {
  Viewer, Color, Cartesian3, HeadingPitchRange, Matrix4, Math as CesiumMath,
  Rectangle, GeoJsonDataSource, Cesium3DTileset, SingleTileImageryProvider, Resource, Credit,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { renderNavigation, setStudyAreaFocus } from './ui/navigation.js';
import { focusOnStudyArea, readStudyArea, createStudyAreaClip } from './map/study-area.js';
import './styles/layers.css';
import { layers } from './layers.js';
import { createLocalImageryProvider } from './map/imagery.js';

renderNavigation('layers');

const viewer = new Viewer('cesiumContainer', {
  baseLayer: false, baseLayerPicker: false, geocoder: false,
  animation: false, timeline: false, homeButton: false,
  sceneModePicker: false, navigationHelpButton: false, requestRenderMode: true,
});
viewer.scene.globe.baseColor = Color.fromCssColorString('#deded8');
viewer.scene.globe.depthTestAgainstTerrain = false;
setStudyAreaFocus(() => focusOnStudyArea(viewer));
const select = document.querySelector('#layerSelect');
const status = document.querySelector('#status');
const objects = new Map();
const pending = new Map();
let selectedIndex = 0;
let selectionVersion = 0;
let studyCentre;
let studyRange = 1800;

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
  return response.json();
}

async function loadImagery(layer) {
  const provider = await createLocalImageryProvider(layer.url, {
    credit: layer.credit,
    onError: () => { status.textContent = `Some ${layer.title} tiles could not load. Check the data folder.`; },
  });
  const imagery = viewer.imageryLayers.addImageryProvider(provider, layer.id === 'aerial' ? 0 : undefined);
  imagery.show = false;
  return imagery;
}

async function loadImage(layer) {
  const metadata = await readJson(layer.metadataUrl);
  const provider = await SingleTileImageryProvider.fromUrl(layer.url, {
    rectangle: Rectangle.fromDegrees(...metadata.bounds),
    credit: new Credit(layer.credit, true),
  });
  const imagery = viewer.imageryLayers.addImageryProvider(provider);
  imagery.show = false;
  return imagery;
}

async function loadGeoJson(layer) {
  const data = await GeoJsonDataSource.load(layer.url, { clampToGround: true });
  data.show = false;
  for (const entity of data.entities.values) {
    if (!entity.polygon) continue;
    entity.polygon.material = Color.fromCssColorString(layer.color).withAlpha(0.7);
    entity.polygon.outline = false;
    if (layer.outlineOnly) {
      entity.polygon.fill = false;
      const ring = entity.polygon.hierarchy.getValue(viewer.clock.currentTime).positions;
      entity.polyline = {
        positions: [...ring, ring[0]], width: 3,
        material: Color.fromCssColorString(layer.color), clampToGround: true,
      };
    }
  }
  await viewer.dataSources.add(data);
  return data;
}

async function loadLayer(layer) {
  if (pending.has(layer.id)) return pending.get(layer.id);
  const task = (async () => {
    let object;
    if (layer.type === 'imagery') object = await loadImagery(layer);
    else if (layer.type === 'image') object = await loadImage(layer);
    else if (layer.type === 'geojson') object = await loadGeoJson(layer);
    else {
      const resource = new Resource({ url: layer.url, credits: layer.credit ? [new Credit(layer.credit, true)] : [] });
      const options = { show: false, showCreditsOnScreen: true };
      if (layer.clipToStudyArea) {
        const study = await readStudyArea();
        options.clippingPolygons = createStudyAreaClip(study.geojson);
      }
      object = await Cesium3DTileset.fromUrl(resource, options);
      viewer.scene.primitives.add(object);
      object.tileFailed.addEventListener(() => {
        status.textContent = 'Part of ' + layer.title + ' could not load. Check its tileset files.';
      });
    }
    objects.set(layer.id, object);
    return object;
  })();
  pending.set(layer.id, task);
  try { return await task; }
  catch (error) { pending.delete(layer.id); throw error; }
}

function resetView() {
  if (!studyCentre) return;
  const angle = layers[selectedIndex].type === 'tileset' ? -40 : -90;
  viewer.camera.lookAt(studyCentre, new HeadingPitchRange(0, CesiumMath.toRadians(angle), studyRange));
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

async function showLayer(index) {
  selectedIndex = index;
  const version = ++selectionVersion;
  const layer = layers[index];
  select.value = layer.id;
  document.querySelector('#counter').textContent = (index + 1) + ' / ' + layers.length;
  document.querySelector('#description').textContent = layer.description;
  const legend = document.querySelector('#layerLegend');
  legend.hidden = !layer.legend;
  if (layer.legend) {
    document.querySelector('#legendTitle').textContent = layer.legend.title;
    document.querySelector('#legendGradient').style.background = `linear-gradient(to right, ${layer.legend.colours.join(', ')})`;
    document.querySelector('#legendMinimum').textContent = layer.legend.minimum;
    document.querySelector('#legendMaximum').textContent = layer.legend.maximum;
  }
  document.querySelector('#previous').disabled = index === 0;
  document.querySelector('#next').disabled = index === layers.length - 1;
  status.textContent = 'Loading ' + layer.title + '…';
  viewer.selectedEntity = undefined;
  for (const object of objects.values()) object.show = false;
  viewer.scene.requestRender();
  try {
    const visible = [layer];
    if (layer.id !== 'aerial') visible.unshift(layers[0]);
    await Promise.all(visible.map(loadLayer));
    if (version !== selectionVersion) return; // A newer selection takes priority.
    for (const [id, object] of objects) object.show = visible.some((item) => item.id === id);
    resetView();
    viewer.scene.requestRender();
    status.textContent = layer.type === 'tileset' ? 'Ready. 3D tiles load as you zoom.' : 'Ready';
  } catch (error) {
    console.error(error);
    if (version === selectionVersion) status.textContent = 'Could not load ' + layer.title + '. Check its files and refresh to retry.';
  }
}

async function start() {
  for (const layer of layers) select.add(new Option(layer.title, layer.id));
  // Derive the camera from the supplied boundary
  const study = await readJson(layers.find((layer) => layer.id === 'study-area').url);
  const coordinates = [];
  function collect(value) {
    if (typeof value[0] === 'number') coordinates.push(value);
    else value.forEach(collect);
  }
  study.features.forEach((feature) => collect(feature.geometry.coordinates));
  const rectangle = Rectangle.fromCartographicArray(coordinates.map(([lon, lat]) => ({
    longitude: CesiumMath.toRadians(lon), latitude: CesiumMath.toRadians(lat),
  })));
  const centre = Rectangle.center(rectangle);
  studyCentre = Cartesian3.fromRadians(centre.longitude, centre.latitude);
  studyRange = Cartesian3.distance(
    Cartesian3.fromRadians(rectangle.west, rectangle.south),
    Cartesian3.fromRadians(rectangle.east, rectangle.north),
  ) * 1.7;
  select.disabled = false;
  select.addEventListener('change', () => showLayer(layers.findIndex((layer) => layer.id === select.value)));
  document.querySelector('#previous').addEventListener('click', () => showLayer(Math.max(0, selectedIndex - 1)));
  document.querySelector('#next').addEventListener('click', () => showLayer(Math.min(layers.length - 1, selectedIndex + 1)));
  document.querySelector('#resetView').addEventListener('click', resetView);
  await showLayer(0);
}
start().catch((error) => {
  console.error(error);
  status.textContent = 'Could not initialise the map. Check that the study-area GeoJSON is present.';
});
