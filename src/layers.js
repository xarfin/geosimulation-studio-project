// Edit paths here if you rename or replace a dataset. URLs start inside public/.
export const layers = [
  {
    id: 'aerial', title: 'Luchtfoto', type: 'imagery',
    url: '/data/background/luchtfoto', credit: 'Supplied Luchtfoto_clipped export',
    description: 'Aerial imagery of the study area.',
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
    url: '/data/landUse/buildings/doc.geojson', color: '#ff8800',
    description: 'Building footprints are shown in orange. Click a feature to inspect its attributes.',
  },
  {
    id: 'green', title: 'Green space', type: 'geojson',
    url: '/data/landUse/green/doc.geojson', color: '#36d451',
    description: 'Green-space polygons are shown in green. Click a feature to inspect its attributes.',
  },
  {
    id: 'water', title: 'Water', type: 'geojson',
    url: '/data/landUse/water/doc.geojson', color: '#168cfa',
    description: 'Water polygons are shown in blue. Click a feature to inspect its attributes.',
  },
  {
    id: 'ahn', title: 'AHN elevation image', type: 'imagery',
    url: '/data/elevation/ahn', credit: 'Supplied AHN_DTM_0,5m export',
    description: 'The supplied AHN as a flat image layer. TODO: add elevation scale/make it 3d terrain.',
  },
  {
    id: 'buildings-3d', title: 'Existing 3D buildings', type: 'tileset',
    url: '/data/buildings/rotterdam/tileset.json',
    description: 'The existing Rotterdam buildings, using the location and heights stored in the export.',
  },
  {
    id: 'proposal', title: 'Proposed complex', type: 'tileset',
    url: '/models/proposed-complex/tileset.json',
    description: 'The proposed complex shown over the aerial image.',
  },
];
