import { studyImageryUrl } from './map/imagery.js';

// Edit paths here if you rename or replace a dataset. URLs start inside public/.
export const layers = [
  {
    id: 'aerial', title: 'Luchtfoto', type: 'imagery',
    url: studyImageryUrl,
    description: 'PDOK aerial imagery covering the full study area, saved locally.',
  },
  {
    id: 'study-area', title: 'Study area', type: 'geojson',
    url: '/data/landUse/study-area/doc.geojson', color: '#ffff00', outlineOnly: true,
    description: 'The study boundary is shown in yellow over the aerial image.',
  },
  {
    id: 'development-site', title: 'Development site', type: 'geojson',
    url: '/data/landUse/development-site/doc.geojson', color: '#ff60dd', outlineOnly: true,
    description: 'The development site is outlined in pink.',
  },
  {
    id: 'footprints', title: 'Building footprints', type: 'geojson',
    url: '/data/landUse/study-area-layers/buildings.geojson', color: '#ff8800',
    description: 'Current BAG building footprints across the full study area. Click a building to see its use, construction year and status.',
  },
  {
    id: 'green', title: 'Green space', type: 'geojson',
    url: '/data/landUse/study-area-layers/green.geojson', color: '#36d451',
    description: 'Current BGT vegetated ground across the full study area. Click a polygon to see its vegetation type.',
  },
  {
    id: 'water', title: 'Water', type: 'geojson',
    url: '/data/landUse/study-area-layers/water.geojson', color: '#168cfa',
    description: 'Current BGT water polygons clipped to the full study boundary. Click a polygon to inspect its attributes.',
  },
  {
    id: 'ahn', title: 'AHN ground elevation', type: 'image',
    url: '/data/elevation/study-area/ground-elevation.png',
    metadataUrl: '/data/elevation/study-area/metadata.json',
    credit: 'AHN / Rijkswaterstaat via PDOK',
    description: 'Ground elevation across the full study area, from the 0.5 m AHN DTM. Heights are in metres above NAP; areas without ground measurements remain transparent.',
    legend: {
      title: 'Ground elevation (m NAP)', minimum: -2, maximum: 10,
      colours: ['#245e7a', '#6ba6a7', '#bdd3b0', '#f1e8b1', '#d9ad74', '#b47c4d', '#794b35'],
    },
  },
  {
    id: 'buildings-3d', title: 'Existing 3D buildings', type: 'tileset',
    url: '/data/buildings/study-area/tileset.json',
    credit: 'Gemeente Rotterdam / Rotterdam in 3D',
    clipToStudyArea: true,
    description: 'LoD2 buildings from Rotterdam in 3D, shown only within the aerial image\'s study-area boundary.',
  },
  {
    id: 'proposal', title: 'Proposed complex', type: 'tileset',
    url: '/models/proposed-complex/tileset.json',
    description: 'The proposed complex shown over the aerial image.',
  },
];
