import { Cartesian3, ClippingPolygon, ClippingPolygonCollection, Rectangle } from 'cesium';

export const studyAreaUrl = '/data/landUse/study-area/doc.geojson';
export const netherlandsBounds = Rectangle.fromDegrees(3.2, 50.7, 7.25, 53.6);

let studyAreaRequest;

export function boundsOfGeoJson(collection) {
  const longitudes = [];
  const latitudes = [];
  function collect(coordinates) {
    if (typeof coordinates[0] === 'number') {
      longitudes.push(coordinates[0]);
      latitudes.push(coordinates[1]);
    } else {
      coordinates.forEach(collect);
    }
  }
  collection.features.forEach(feature => collect(feature.geometry.coordinates));
  return Rectangle.fromDegrees(
    Math.min(...longitudes), Math.min(...latitudes),
    Math.max(...longitudes), Math.max(...latitudes),
  );
}

export function readStudyArea() {
  if (!studyAreaRequest) {
    studyAreaRequest = (async () => {
      const response = await fetch(studyAreaUrl);
      if (!response.ok) throw new Error(`Could not load study area: HTTP ${response.status}`);
      const geojson = await response.json();
      return { geojson, bounds: boundsOfGeoJson(geojson) };
    })().catch(error => {
      studyAreaRequest = undefined;
      throw error;
    });
  }
  return studyAreaRequest;
}

export function createStudyAreaClip(geojson) {
  function positionsOf(ring) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    const coordinates = first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
    return coordinates.map(([longitude, latitude]) => Cartesian3.fromDegrees(longitude, latitude));
  }
  const polygons = geojson.features.flatMap(({ geometry }) => {
    const parts = geometry.type === 'Polygon' ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    return parts.map(([outer, ...holes]) => new ClippingPolygon({
      positions: positionsOf(outer),
      holes: holes.map(positionsOf),
    }));
  });
  if (!polygons.length) throw new Error('The study boundary contains no polygons.');
  return new ClippingPolygonCollection({ polygons, inverse: true });
}

export function focusOnBounds(viewer, bounds, { animate = true } = {}) {
  const longitudeMargin = Rectangle.computeWidth(bounds) * 0.12;
  const latitudeMargin = Rectangle.computeHeight(bounds) * 0.12;
  const destination = new Rectangle(
    bounds.west - longitudeMargin, bounds.south - latitudeMargin,
    bounds.east + longitudeMargin, bounds.north + latitudeMargin,
  );
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  viewer.camera.flyTo({
    destination,
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: animate && !reducedMotion ? 1.2 : 0,
  });
  viewer.scene.requestRender();
}

export async function focusOnStudyArea(viewer) {
  const study = await readStudyArea();
  focusOnBounds(viewer, study.bounds);
}
