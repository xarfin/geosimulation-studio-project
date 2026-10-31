export const neighbourhoodStyles = {
  BU05990320: { color: '#397b5e', shortName: 'Delfshaven' },
  BU05990329: { color: '#368aa1', shortName: 'Schiemond' },
};

export const ageGroups = [
  { key: 'age_0_14', label: '0–14 years' },
  { key: 'age_15_24', label: '15–24 years' },
  { key: 'age_25_44', label: '25–44 years' },
  { key: 'age_45_64', label: '45–64 years' },
  { key: 'age_65_plus', label: '65+ years' },
];

export const householdGroups = [
  { key: 'households_single', label: 'Single-person' },
  { key: 'households_without_children', label: 'Without children' },
  { key: 'households_with_children', label: 'With children' },
];

export const serviceIndicators = [
  { key: 'distance_gp_km', label: 'General practitioner' },
  { key: 'distance_supermarket_km', label: 'Supermarket' },
  { key: 'distance_daycare_km', label: 'Daycare' },
  { key: 'distance_school_km', label: 'Primary school' },
];

export const allIndicators = [
  { key: 'population', label: 'Population', unit: 'residents' },
  { key: 'population_density_per_km2', label: 'Population density', unit: 'residents/km²' },
  ...ageGroups.map(group => ({ ...group, label: `Age: ${group.label}`, unit: 'residents' })),
  { key: 'households_total', label: 'Households', unit: 'households' },
  ...householdGroups.map(group => ({ ...group, label: `Households: ${group.label}`, unit: 'households' })),
  { key: 'average_household_size', label: 'Average household size', unit: 'people', decimals: 1 },
  { key: 'housing_units', label: 'Housing units', unit: 'homes' },
  { key: 'apartments_pct', label: 'Apartments', unit: '%' },
  { key: 'owner_occupied_pct', label: 'Owner-occupied housing', unit: '%' },
  { key: 'rental_pct', label: 'Rental housing', unit: '%' },
  { key: 'housing_corporation_pct', label: 'Housing corporation ownership', unit: '% of housing stock' },
  { key: 'avg_woz_value_thousand_eur', label: 'Average WOZ value', unit: '€ thousand' },
  { key: 'education_primary_pupils', label: 'Primary education pupils', unit: 'pupils' },
  { key: 'social_assistance_benefits', label: 'Social assistance benefits', unit: 'benefits' },
  ...serviceIndicators.map(indicator => ({ ...indicator, label: `Distance: ${indicator.label}`, unit: 'km', decimals: 1 })),
];

export function formatValue(value, decimals = 0) {
  return Number.isFinite(value)
    ? value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : 'Unavailable';
}

