export const STATION = Object.freeze({
  id: '0-20000-0-06344', number: 344, name: 'Rotterdam Airport',
  longitude: 4.4469, latitude: 51.9606,
});
const DAY = 86_400_000;

// A station PointSeries has one time axis and singleton spatial axes.
// Do not flatten a multi-station array into a single station's series.
export function parseCoverage(payload, codes) {
  const coverages = payload.type === 'Coverage' ? [payload] : payload.coverages;
  if (!Array.isArray(coverages)) throw new Error('Unexpected KNMI response format.');
  if (payload.links?.some(link => link.rel === 'next')) {
    throw new Error('KNMI returned a partial response; refusing to summarise it.');
  }
  const rows = new Map();
  for (const coverage of coverages) {
    if (coverage['eumetnet:locationId'] && coverage['eumetnet:locationId'] !== STATION.id) continue;
    const times = coverage.domain?.axes?.t?.values;
    if (!Array.isArray(times)) throw new Error('KNMI time axis is missing.');
    for (const code of codes) {
      const array = coverage.ranges?.[code];
      if (!array) continue;
      const shape = array.shape;
      const axes = array.axisNames;
      const ti = axes?.indexOf('t') ?? -1;
      if (!Array.isArray(shape) || ti < 0 || shape.length !== axes.length ||
          shape[ti] !== times.length || shape.some((n, i) => i !== ti && n !== 1) ||
          array.values?.length !== times.length) {
        throw new Error(`Unexpected KNMI array dimensions for ${code}.`);
      }
      times.forEach((time, i) => {
        const stamp = Date.parse(time);
        if (!Number.isFinite(stamp)) throw new Error('Invalid KNMI timestamp.');
        const key = new Date(stamp).toISOString();
        const row = rows.get(key) || Object.fromEntries([['time', key], ...codes.map(c => [c, null])]);
        const raw = array.values[i];
        let value = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '') ? null : Number(raw);
        if (!Number.isFinite(value)) value = null;
        if (['ff', 'FG'].includes(code) && value < 0) value = null;
        if (code === 'dd' && (value < 0 || value > 360)) value = null;
        if (value !== null) row[code] = value;
        rows.set(key, row);
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.time.localeCompare(b.time));
}

export function summariseHistory(rows, year, minimumCoverage = 0.8) {
  const days = new Map();
  for (const row of rows) {
    // Daily records are stamped at the end of the PRECEDING UTC day.
    const day = new Date(Date.parse(row.time) - DAY).toISOString().slice(0, 10);
    if (day.startsWith(`${year}-`)) days.set(day, row);
  }
  return Array.from({length: 12}, (_, month) => {
    const expectedDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const sample = [...days].filter(([date]) => date.startsWith(monthKey)).map(([, row]) => row);
    const metric = code => {
      const values = sample.map(row => row[code]).filter(Number.isFinite);
      const coverage = values.length / expectedDays;
      return {value: coverage >= minimumCoverage && values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
        validDays: values.length, expectedDays, coverage};
    };
    return {month: monthKey, temperature: metric('TG'), windSpeed: metric('FG')};
  });
}
