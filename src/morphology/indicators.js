export const indicators = [
  { key: 'GSI', label: 'Building coverage (GSI)', type: 'percent', description: 'Building footprint divided by land area, excluding water.' },
  { key: 'FSI', label: 'Floor space index (FSI)', digits: 3, description: 'Estimated floor area divided by land area; floors are estimated using 3 m per floor.' },
  { key: 'OSR', label: 'Open space ratio (OSR)', digits: 3, description: 'Unbuilt land area divided by estimated floor area: (1 - GSI) / FSI.' },
  { key: 'SVF_mean', label: 'Mean SVF, buildings + trees', digits: 3, description: 'Mean open-ground SVF with buildings and tree crowns, observed at 1.5 m.' },
  { key: 'green_share', label: 'Ground green + canopy', type: 'percent', description: 'Union of green ground and tree canopy, excluding buildings, divided by land area. Green roofs are separate.' },
  { key: 'height_mean_m', label: 'Mean building height', unit: 'm', digits: 1, description: 'Building height weighted by footprint area inside the selected zone.' },
  { key: 'land_area_m2', label: 'Land area', unit: 'm²', digits: 0, description: 'Selected zone area excluding water.' },
  { key: 'n_buildings', label: 'Buildings', digits: 0, description: 'Buildings with more than 1 m² of footprint inside the selected zone.' },
  { key: 'footprint_m2', label: 'Building footprint', unit: 'm²', digits: 0, description: 'Combined building footprint inside land in the selected zone.' },
  { key: 'L_avg_floors', label: 'Average floors', digits: 1, description: 'Floor space index divided by building coverage (FSI / GSI).' },
  { key: 'height_std_m', label: 'Height standard deviation', unit: 'm', digits: 1, description: 'Footprint-weighted standard deviation of building heights.' },
  { key: 'height_max_m', label: 'Maximum height', unit: 'm', digits: 1, description: 'Tallest building intersecting land in the selected zone.' },
  { key: 'height_cv', label: 'Height variation', digits: 2, description: 'Height standard deviation divided by mean height.' },
  { key: 'SVF_mean_buildings', label: 'Mean SVF, buildings only', digits: 3, description: 'Mean open-ground sky-view factor without tree crowns.' },
  { key: 'SVF_p10', label: 'SVF, 10th percentile', digits: 3, description: '10th percentile of open-ground SVF with buildings and trees.' },
  { key: 'share_open_SVF_below_0_5', label: 'Open area with SVF < 0.5', type: 'percent', description: 'Share of sampled open-ground cells with SVF below 0.5, including buildings and trees.' },
  { key: 'HW_median', label: 'Median H/W proxy', digits: 2, description: 'Nearest building height / (2 × distance to building), for open cells within 30 m of a building.' },
  { key: 'green_roof_m2', label: 'Green roofs', unit: 'm²', digits: 0, description: 'Mapped green-roof area, reported by the source for the development site only.' },
  { key: 'landuse_mix_entropy', label: 'Land-use mix', digits: 3, description: 'Floor-area-weighted use entropy, normalised over 11 use classes (0–1).' },
  { key: 'landuse_mix_with_retail_plinth', label: 'Mix with retail ground floor', digits: 3, description: 'Alternative mix assuming one residential ground floor is used for retail.' },
];

export const metrics = {
  svf: {
    label: 'Sky-view factor · buildings + trees', maximum: 1,
    colors: ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#deebf7', '#f7fbff'],
    description: '0 = enclosed sky; 1 = open sky. Includes buildings and tree crowns at an observer height of 1.5 m.',
  },
  svfb: {
    label: 'Sky-view factor · buildings only', maximum: 1,
    colors: ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#deebf7', '#f7fbff'],
    description: 'Sky visibility at 1.5 m with buildings only. Compare with the trees layer to see canopy obstruction.',
  },
  hw: {
    label: 'Height-to-width proxy (H/W)', maximum: 3,
    colors: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
    description: 'Nearest building height / (2 × distance to building), within 30 m of buildings. Values of 3 or more share the darkest colour.',
  },
};

export function formatIndicator(value, indicator) {
  if (!Number.isFinite(value)) return '—';
  if (indicator.type === 'percent') return `${(value * 100).toFixed(1)}%`;
  const text = value.toLocaleString('en-GB', {
    minimumFractionDigits: indicator.digits, maximumFractionDigits: indicator.digits,
  });
  return indicator.unit ? `${text} ${indicator.unit}` : text;
}

export function scenarioBuildings(existing, proposed, scenario) {
  return {
    type: 'FeatureCollection',
    features: scenario === 'baseline' ? existing.features : [
      ...existing.features.filter(feature => !feature.properties.cleared_in_designs),
      ...proposed.features,
    ],
  };
}
