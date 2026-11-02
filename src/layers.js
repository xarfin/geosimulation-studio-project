import { studyImageryUrl } from './map/imagery.js';
import { studyBuildingsUrl, studyBuildingsCredit } from './map/buildings.js';

// Edit paths here if you rename or replace a dataset. URLs start inside public/.
export const layers = [
  {
    id: 'aerial', title: 'Satellite', type: 'imagery',
    url: studyImageryUrl,
  },
  {
    id: 'study-area', title: 'Study area', type: 'geojson',
    url: '/data/landUse/study-area/doc.geojson', color: '#ffff00', outlineOnly: true,
  },
  {
    id: 'development-site', title: 'Development site', type: 'geojson',
    url: '/data/landUse/development-site/doc.geojson', color: '#ff60dd', outlineOnly: true,
  },
  {
    id: 'footprints', title: 'Building footprints', type: 'geojson',
    url: '/data/landUse/study-area-layers/buildings.geojson', color: '#ff8800',
  },
  {
    id: 'green', title: 'Green space', type: 'geojson',
    url: '/data/landUse/study-area-layers/green.geojson', color: '#36d451',
  },
  {
    id: 'water', title: 'Water', type: 'geojson',
    url: '/data/landUse/study-area-layers/water.geojson', color: '#168cfa',
  },
  {
    id: 'ahn', title: 'Elevation (DTM)', type: 'image',
    url: '/data/elevation/study-area/ground-elevation.png',
    metadataUrl: '/data/elevation/study-area/metadata.json',
    credit: 'AHN / Rijkswaterstaat via PDOK',
  },
  {
    id: 'buildings-3d', title: 'Existing 3D buildings', type: 'tileset',
    url: studyBuildingsUrl,
    credit: studyBuildingsCredit,
    clipToStudyArea: true,
  },
];
