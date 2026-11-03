export const networkColors = { current: '#d38832', proposed: '#258d79' };
export const siteColors = { residential: '#d66a44', outdoor_sports: '#4793ab', indoor_sports: '#8b7761' };

export function walkingMean(scenario, destination) {
  return destination === 'all' ? scenario.meanWalkDistanceM : scenario.walkingByDestination[destination];
}

export function walkingChange(current, proposed, destination) {
  const baseline = walkingMean(current, destination);
  return (walkingMean(proposed, destination) - baseline) / baseline * 100;
}

export function flowWidth(vehiclesPerHour) {
  return 1.25 + vehiclesPerHour / 8;
}

export function routeVisible(properties, destination) {
  return destination === 'all' || properties.destination_id === destination;
}
