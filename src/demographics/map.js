import {
  Viewer, Color, Cartesian2, Cartesian3, Rectangle, HeadingPitchRange,
  Matrix4, GeoJsonDataSource, UrlTemplateImageryProvider, LabelStyle,
} from 'cesium';
import { formatValue, neighbourhoodStyles } from './indicators.js';

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function boundsOf(collection) {
  const positions = [];
  function collect(coordinates) {
    if (typeof coordinates[0] === 'number') {
      positions.push(Cartesian3.fromDegrees(...coordinates));
    } else {
      coordinates.forEach(collect);
    }
  }
  collection.features.forEach(feature => collect(feature.geometry.coordinates));
  return Rectangle.fromCartesianArray(positions);
}

async function addAerial(viewer) {
  const base = '/data/background/luchtfoto';
  const [metadata, paths] = await Promise.all([
    readJson(`${base}/tiles.json`), readJson(`${base}/available-tiles.json`),
  ]);
  const provider = new UrlTemplateImageryProvider({
    url: `${base}/{z}/{x}/{reverseY}.png`,
    rectangle: Rectangle.fromDegrees(...metadata.bounds),
    minimumLevel: metadata.minzoom,
    maximumLevel: metadata.maxzoom,
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

export async function createNeighbourhoodMap(collection, onSelect) {
  const viewer = new Viewer('demographicsMap', {
    baseLayer: false, baseLayerPicker: false, geocoder: false,
    animation: false, timeline: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false,
    infoBox: false, selectionIndicator: false, requestRenderMode: true,
  });
  viewer.scene.globe.baseColor = Color.fromCssColorString('#dfe6dd');

  const areas = await GeoJsonDataSource.load(collection, { clampToGround: true });
  await viewer.dataSources.add(areas);
  const outlines = new Map();
  const labels = new Map();
  const fullBounds = boundsOf(collection);
  let studyBounds;

  for (const entity of areas.entities.values) {
    const code = entity.properties.buurtcode.getValue();
    const style = neighbourhoodStyles[code];
    entity.polygon.material = Color.fromCssColorString(style.color).withAlpha(0.35);
    entity.polygon.outline = false;
    const ring = entity.polygon.hierarchy.getValue(viewer.clock.currentTime).positions;
    entity.polyline = {
      positions: [...ring, ring[0]], width: 3,
      material: Color.fromCssColorString(style.color), clampToGround: true,
    };
    const entities = outlines.get(code) || [];
    entities.push(entity);
    outlines.set(code, entities);
  }

  for (const feature of collection.features) {
    const area = feature.properties;
    const bounds = boundsOf({ features: [feature] });
    const centre = Rectangle.center(bounds);
    const label = viewer.entities.add({
      name: area.buurtnaam,
      position: Cartesian3.fromRadians(centre.longitude, centre.latitude),
      properties: { buurtcode: area.buurtcode },
      label: {
        text: area.buurtnaam,
        font: '14px system-ui, sans-serif',
        style: LabelStyle.FILL_AND_OUTLINE,
        fillColor: Color.fromCssColorString('#173f36'),
        outlineColor: Color.WHITE, outlineWidth: 4,
        pixelOffset: new Cartesian2(0, -10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    labels.set(area.buurtcode, label);
  }

  function showBounds(bounds) {
    const centre = Rectangle.center(bounds);
    const diagonal = Cartesian3.distance(
      Cartesian3.fromRadians(bounds.west, bounds.south),
      Cartesian3.fromRadians(bounds.east, bounds.north),
    );
    viewer.camera.lookAt(
      Cartesian3.fromRadians(centre.longitude, centre.latitude),
      new HeadingPitchRange(0, -Math.PI / 2, Math.max(500, diagonal * 1.35)),
    );
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.scene.requestRender();
  }

  function setFocus(code, zoom = true) {
    for (const [areaCode, entities] of outlines) {
      const focused = code === 'all' || code === areaCode;
      const color = Color.fromCssColorString(neighbourhoodStyles[areaCode].color);
      for (const entity of entities) {
        entity.polygon.material = color.withAlpha(focused ? 0.35 : 0.12);
        entity.polyline.width = focused ? 4 : 2;
      }
    }
    if (zoom) {
      showBounds(code === 'all' ? fullBounds : boundsOf({
        features: collection.features.filter(feature => feature.properties.buurtcode === code),
      }));
    }
    viewer.scene.requestRender();
  }

  function setPopulationLabels() {
    const legend = document.querySelector('#mapLegend');
    const title = document.createElement('strong');
    title.textContent = 'Population · residents';
    legend.replaceChildren(title);
    for (const feature of collection.features) {
      const area = feature.properties;
      const amount = formatValue(area.population);
      labels.get(area.buurtcode).label.text = `${area.buurtnaam}\n${amount} residents`;
      const row = document.createElement('p');
      const swatch = document.createElement('i');
      swatch.style.backgroundColor = neighbourhoodStyles[area.buurtcode].color;
      row.append(swatch, `${area.buurtnaam}: ${amount}`);
      legend.append(row);
    }
    const site = document.createElement('p');
    site.className = 'study-outline-key';
    site.textContent = 'Gold outline: study area';
    legend.append(site);
    legend.hidden = false;
    viewer.scene.requestRender();
  }

  viewer.selectedEntityChanged.addEventListener(entity => {
    const code = entity?.properties?.buurtcode?.getValue();
    if (code && neighbourhoodStyles[code]) onSelect(code);
  });

  showBounds(fullBounds);
  const background = await Promise.allSettled([
    addAerial(viewer),
    (async () => {
      const study = await readJson('/data/landUse/study-area/doc.geojson');
      studyBounds = boundsOf(study);
      const boundary = await GeoJsonDataSource.load(study, { clampToGround: true });
      for (const entity of boundary.entities.values) {
        if (!entity.polygon) continue;
        entity.polygon.fill = false;
        const positions = entity.polygon.hierarchy.getValue(viewer.clock.currentTime).positions;
        entity.polyline = {
          positions: [...positions, positions[0]], width: 3,
          material: Color.fromCssColorString('#d8a942'), clampToGround: true,
        };
      }
      await viewer.dataSources.add(boundary);
      document.querySelector('#studyView').disabled = false;
    })(),
  ]);
  document.querySelector('#mapStatus').textContent = background.some(result => result.status === 'rejected')
    ? 'Neighbourhoods ready. Some background layers could not load.'
    : 'Click a neighbourhood to focus on it.';
  viewer.scene.requestRender();

  setPopulationLabels();

  return {
    setFocus,
    showStudyArea() { if (studyBounds) showBounds(studyBounds); },
  };
}
