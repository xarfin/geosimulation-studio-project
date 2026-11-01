export function sampleWind(values, layer, longitude, latitude) {
  const [west, south, east, north] = layer.bounds;
  if (longitude < west || longitude >= east || latitude <= south || latitude > north) return null;
  const column = Math.floor((longitude - west) / (east - west) * layer.width);
  const row = Math.floor((north - latitude) / (north - south) * layer.height);
  const speed = values[row * layer.width + column];
  return Number.isFinite(speed) ? speed : null;
}

export function readWindValues(buffer, layer) {
  if (buffer.byteLength !== layer.width * layer.height * 4) {
    throw new Error('The wind sample grid does not match its metadata.');
  }
  const source = new DataView(buffer);
  const values = new Float32Array(layer.width * layer.height);
  for (let index = 0; index < values.length; index++) values[index] = source.getFloat32(index * 4, true);
  return values;
}
