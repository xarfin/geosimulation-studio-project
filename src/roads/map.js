import {
  Viewer, Color, GeoJsonDataSource, LabelStyle, Cartesian2, HeightReference,
  PolylineOutlineMaterialProperty, PolylineDashMaterialProperty,
  ScreenSpaceEventHandler, ScreenSpaceEventType,
} from 'cesium';
import { createBasemapControls } from '../map/basemaps.js';
import { boundsOfGeoJson, focusOnBounds, focusOnStudyArea } from '../map/study-area.js';
import { setStudyAreaFocus } from '../ui/navigation.js';
import { flowWidth, networkColors, routeVisible, siteColors } from './results.js';

const base = '/data/roads/';
const markerColor = '#365362';
const interventionColor = '#42c58d';

async function readJson(path) {
  const response = await fetch(base + path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function label(text, color) {
  return {
    text, font: '600 12px system-ui', fillColor: Color.fromCssColorString(color),
    style: LabelStyle.FILL_AND_OUTLINE, outlineColor: Color.WHITE, outlineWidth: 3,
    pixelOffset: new Cartesian2(0, -19), heightReference: HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function point(entity, color, size = 10) {
  entity.billboard = undefined;
  entity.point = {
    pixelSize: size, color: Color.fromCssColorString(color), outlineColor: Color.WHITE,
    outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

export async function createRoadsMap(summary, onRead, onBackgroundStatus) {
  const viewer = new Viewer('roadsMap', {
    baseLayer: false, baseLayerPicker: false, geocoder: false,
    animation: false, timeline: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false,
    infoBox: false, selectionIndicator: false, requestRenderMode: true,
  });
  viewer.scene.globe.baseColor = Color.fromCssColorString('#dfe6dd');
  viewer.scene.backgroundColor = Color.fromCssColorString('#dfe6dd');
  viewer.scene.screenSpaceCameraController.enableTilt = false;
  viewer.scene.screenSpaceCameraController.enableLook = false;
  setStudyAreaFocus(() => focusOnStudyArea(viewer));
  const basemap = createBasemapControls(viewer, onBackgroundStatus);
  await basemap.select('satellite');
  const cache = new Map();
  const destinations = new Map(summary.destinations.map(item => [item.id, item]));
  let selection = 0;
  let activeSources = [];
  let lastAnalysis;

  async function load(path, style) {
    const geojson = await readJson(path);
    const source = await GeoJsonDataSource.load(geojson, { clampToGround: true });
    source.show = false;
    for (const entity of source.entities.values) {
      const properties = entity.properties.getValue(viewer.clock.currentTime);
      style(entity, properties);
    }
    await viewer.dataSources.add(source);
    return { source, geojson };
  }

  function cached(path, style) {
    if (!cache.has(path)) {
      cache.set(path, load(path, style).catch(error => {
        cache.delete(path);
        throw error;
      }));
    }
    return cache.get(path);
  }

  const site = await cached('site-context.geojson', (entity, properties) => {
    entity.polygon.outline = false;
    if (properties.type === 'site') {
      entity.polygon.fill = true;
      entity.polygon.material = Color.fromCssColorString('#83bd69');
      entity.polygon.zIndex = 0;
      const ring = entity.polygon.hierarchy.getValue(viewer.clock.currentTime).positions;
      entity.polyline = {
        positions: [...ring, ring[0]], width: 2,
        material: Color.fromCssColorString('#e9c257'), clampToGround: true,
      };
    } else {
      entity.polygon.material = Color.fromCssColorString(siteColors[properties.use]).withAlpha(.9);
      entity.polygon.zIndex = 1;
    }
  });
  site.source.show = true;

  function styleRoute(entity, properties) {
    entity.polyline.width = 4;
    entity.polyline.material = new PolylineOutlineMaterialProperty({
      color: Color.fromCssColorString(destinations.get(properties.destination_id).color),
      outlineColor: Color.WHITE.withAlpha(.75), outlineWidth: 1,
    });
  }

  function styleDestination(entity, properties) {
    const destination = destinations.get(properties.id);
    point(entity, destination.color, 12);
    entity.label = label(destination.label, '#233833');
  }

  function styleEntrance(entity) {
    point(entity, markerColor, 7);
  }

  function styleTrafficDestination(entity, properties) {
    point(entity, markerColor, 10);
    entity.label = label(properties.name, markerColor);
  }

  function styleIntervention(entity, properties) {
    if (entity.polyline) {
      entity.polyline.width = 6;
      entity.polyline.material = new PolylineDashMaterialProperty({
        color: Color.fromCssColorString(interventionColor), dashLength: 10,
      });
    } else {
      point(entity, interventionColor, 11);
      entity.label = label('Crossing', '#196d61');
    }
  }

  function styleFlow(entity, properties) {
    const color = Color.fromCssColorString(networkColors[properties.scenario.toLowerCase()]);
    entity.polyline.width = flowWidth(properties.vehicles_per_hour);
    entity.polyline.material = properties.link_type
      ? new PolylineDashMaterialProperty({ color, dashLength: 12 })
      : new PolylineOutlineMaterialProperty({ color, outlineColor: Color.WHITE.withAlpha(.65), outlineWidth: 1 });
  }

  function styleExit(entity, properties) {
    const color = properties.status === 'Proposed' ? networkColors.proposed : markerColor;
    point(entity, color, 12);
    entity.label = label(properties.name, color);
  }

  async function show(analysis, scenario, destination) {
    const version = ++selection;
    activeSources.forEach(source => { source.show = false; });
    activeSources = [];
    onRead('');
    viewer.scene.requestRender();
    const isAccessibility = analysis === 'accessibility';
    const paths = isAccessibility
      ? [[scenario.routes, styleRoute], ['accessibility/destinations.geojson', styleDestination],
        ['accessibility/entrances.geojson', styleEntrance]]
      : [[scenario.flow, styleFlow], [scenario.exits, styleExit],
        [summary.trafficDestinations, styleTrafficDestination]];
    if (isAccessibility && scenario.id === 'proposed') {
      paths.push(['accessibility/interventions.geojson', styleIntervention]);
    }
    const layers = await Promise.all(paths.map(([path, style]) => cached(path, style)));
    if (version !== selection) return;
    if (isAccessibility) {
      for (const entity of layers[0].source.entities.values) {
        entity.show = routeVisible(entity.properties.getValue(viewer.clock.currentTime), destination);
      }
      for (const entity of layers[1].source.entities.values) {
        entity.show = destination === 'all' || entity.properties.id.getValue() === destination;
      }
    }
    activeSources = layers.map(layer => layer.source);
    activeSources.forEach(source => { source.show = true; });
    if (lastAnalysis !== analysis) {
      const collection = { type: 'FeatureCollection', features: [...site.geojson.features, ...layers[0].geojson.features] };
      focusOnBounds(viewer, boundsOfGeoJson(collection), { animate: false });
      lastAnalysis = analysis;
    }
    viewer.scene.requestRender();
  }

  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(event => {
    const entity = viewer.scene.pick(event.position)?.id;
    if (!entity?.properties) return onRead('');
    const properties = entity.properties.getValue(viewer.clock.currentTime);
    if (properties.destination_id) {
      onRead(`Building ${properties.building} → ${destinations.get(properties.destination_id).label}: ${Math.round(properties.distance_m)} m`);
    } else if (Number.isFinite(properties.vehicles_per_hour)) {
      const name = properties.link_type ? 'Conceptual access link' : 'Modelled added flow';
      onRead(`${name}: ${properties.vehicles_per_hour} vehicles/hour · both directions`);
    } else if (properties.status) {
      onRead(`${properties.name} · ${properties.status.toLowerCase()} exit`);
    } else if (properties.type === 'destination' || properties.type === 'traffic_destination') {
      onRead(properties.name);
    } else if (properties.use === 'indoor_sports' || properties.use === 'outdoor_sports') {
      const area = Math.round(properties.area_m2).toLocaleString('en-GB');
      onRead(`${properties.use === 'indoor_sports' ? 'Indoor sports' : 'Outdoor sports reserve'} · ${area} m²`);
    } else if (properties.building) {
      onRead(`Design B · Building ${properties.building}${properties.type === 'assumed_entrance' ? ' · assumed entrance' : ''}`);
    } else if (properties.type?.startsWith('conceptual_')) {
      onRead(properties.type === 'conceptual_crossing'
        ? 'Crossing'
        : 'Proposed conceptual pedestrian exit');
    } else {
      onRead('');
    }
  }, ScreenSpaceEventType.LEFT_CLICK);

  return { show };
}
