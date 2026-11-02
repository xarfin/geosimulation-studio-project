import { Credit, OpenStreetMapImageryProvider, WebMapTileServiceImageryProvider } from 'cesium';
import { netherlandsBounds } from './study-area.js';
import { addStudyAreaImagery } from './imagery.js';

const basemaps = {
  map: {
    name: 'Street map',
    createProvider: () => new OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
      maximumLevel: 19,
      credit: new Credit('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>', true),
    }),
  },
  satellite: {
    name: 'Satellite imagery',
    createProvider: () => new WebMapTileServiceImageryProvider({
      url: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0',
      layer: 'Actueel_orthoHR',
      style: 'default',
      format: 'image/jpeg',
      tileMatrixSetID: 'OGC:1.0:GoogleMapsCompatible',
      tileMatrixLabels: Array.from({ length: 22 }, (_, level) => String(level).padStart(2, '0')),
      maximumLevel: 21,
      rectangle: netherlandsBounds,
      credit: new Credit('<a href="https://www.beeldmateriaal.nl/" target="_blank" rel="noopener">Beeldmateriaal Nederland</a> · PDOK · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>', true),
    }),
  },
};

export function createBasemapControls(viewer, onStatus) {
  const layers = new Map();
  const failed = new Set();
  let selected = 'map';
  let studyImagery;
  let studyImageryRequest;
  let studyImageryFailed = false;

  function updateStatus() {
    const satellite = layers.get('satellite');
    if (satellite) satellite.show = selected === 'satellite' && navigator.onLine;
    if (selected === 'satellite' && studyImagery && !studyImageryFailed) {
      onStatus(!navigator.onLine || failed.has('satellite')
        ? 'Saved study-area imagery is available. Imagery outside the study boundary needs an internet connection.'
        : 'Aerial imagery - PDOK / Beeldmateriaal Nederland');
    } else if (selected === 'satellite' && studyImageryFailed) {
      onStatus('Some saved aerial tiles could not load. Refresh to try again.', true);
    } else if (!navigator.onLine) {
      onStatus('You are offline. Connect to the internet to load the map background.', true);
    } else if (failed.has(selected)) {
      onStatus(`${basemaps[selected].name} could not fully load. Check your connection or try the other background.`, true);
    } else {
      onStatus(selected === 'map' ? 'Street map · OpenStreetMap' : 'Aerial imagery · PDOK / Beeldmateriaal Nederland');
    }
    viewer.scene.requestRender();
  }

  async function loadStudyImagery() {
    if (!studyImageryRequest) {
      studyImageryRequest = addStudyAreaImagery(viewer, {
        onError: () => {
          studyImageryFailed = true;
          if (selected === 'satellite') updateStatus();
        },
      }).then(layer => {
        studyImagery = layer;
        layer.show = selected === 'satellite';
        viewer.imageryLayers.raiseToTop(layer);
        return layer;
      }).catch(error => {
        studyImageryRequest = undefined;
        throw error;
      });
    }
    return studyImageryRequest;
  }

  async function select(name) {
    if (failed.has(name)) {
      viewer.imageryLayers.remove(layers.get(name));
      layers.delete(name);
      failed.delete(name);
    }
    if (!layers.has(name)) {
      const provider = basemaps[name].createProvider();
      provider.errorEvent.addEventListener(() => {
        failed.add(name);
        if (selected === name) updateStatus();
      });
      layers.set(name, viewer.imageryLayers.addImageryProvider(provider));
    }
    selected = name;
    for (const [id, layer] of layers) layer.show = id === name && (id !== 'satellite' || navigator.onLine);
    if (studyImagery) studyImagery.show = name === 'satellite';
    if (name === 'satellite') {
      try {
        await loadStudyImagery();
        viewer.imageryLayers.raiseToTop(studyImagery);
      } catch (error) {
        console.error(error);
        if (selected === name) onStatus('The saved study-area imagery could not load. Refresh to try again.', true);
        return;
      }
    }
    updateStatus();
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  return { select };
}
