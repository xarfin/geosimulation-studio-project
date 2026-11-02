import { Credit, Rectangle, UrlTemplateImageryProvider } from 'cesium';

export const studyImageryUrl = '/data/background/study-area';

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

export async function createLocalImageryProvider(url, { credit, onError } = {}) {
  const [metadata, paths] = await Promise.all([
    readJson(`${url}/tiles.json`),
    readJson(`${url}/available-tiles.json`),
  ]);
  const provider = new UrlTemplateImageryProvider({
    url: `${url}/{z}/{x}/{reverseY}.png`,
    rectangle: Rectangle.fromDegrees(...metadata.bounds),
    minimumLevel: metadata.minzoom,
    maximumLevel: metadata.maxzoom,
    credit: new Credit(credit || metadata.attribution || 'Supplied imagery', true),
  });
  const available = new Set(paths);
  const blank = document.createElement('canvas');
  blank.width = blank.height = 256;
  const requestImage = provider.requestImage.bind(provider);
  // Local exports use TMS rows, counted from the south, and omit transparent tiles.
  provider.requestImage = (x, y, level, request) => {
    const path = `${level}/${x}/${2 ** level - y - 1}.png`;
    return available.has(path) ? requestImage(x, y, level, request) : Promise.resolve(blank);
  };
  if (onError) provider.errorEvent.addEventListener(onError);
  return provider;
}

export async function addStudyAreaImagery(viewer, options) {
  const provider = await createLocalImageryProvider(studyImageryUrl, options);
  return viewer.imageryLayers.addImageryProvider(provider, 0);
}
