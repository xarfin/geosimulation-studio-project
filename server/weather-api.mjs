import {STATION, parseCoverage, summariseHistory} from './weather-core.mjs';

const BASE = 'https://api.dataplatform.knmi.nl/edr/v1/collections/';
const LIVE_COLLECTION = '10-minute-in-situ-meteorological-observations';
const HISTORY_COLLECTION = 'daily-in-situ-meteorological-observations-validated';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createWeatherApi({apiKey = '', fetchImpl = fetch, now = () => Date.now()} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  async function query(collection, start, end, codes) {
    if (!apiKey.trim()) throw new ApiError(503, 'Add KNMI_EDR_API_KEY to .env.local, then restart the server.');
    const url = new URL(`${BASE}${collection}/locations/${STATION.id}`);
    url.searchParams.set('datetime', `${start}/${end}`);
    url.searchParams.set('parameter-name', codes.join(','));
    let response;
    try {
      response = await fetchImpl(url, {headers: {Authorization: apiKey.trim(), Accept: 'application/prs.coverage+json, application/json'}, signal: AbortSignal.timeout(30_000)});
    } catch { throw new ApiError(502, 'Could not reach KNMI. Check the connection and retry.'); }
    if ([401, 403].includes(response.status)) throw new ApiError(502, 'KNMI rejected the server API key. Check its EDR access.');
    if (response.status === 429) throw new ApiError(503, 'KNMI request limit reached. Please try again later.');
    if (!response.ok) throw new ApiError(502, `KNMI returned HTTP ${response.status}. Please try again later.`);
    try { return parseCoverage(await response.json(), codes); }
    catch { throw new ApiError(502, 'KNMI returned incomplete or unexpected data. No new summary was calculated.'); }
  }
  async function cached(key, ttl, load) {
    const existing = cache.get(key);
    if (existing && now() - existing.storedAt < ttl) return {...existing.value, upstreamError: false};
    if (!inFlight.has(key)) {
      inFlight.set(key, (async () => {
        try {
          const value = await load();
          cache.set(key, {storedAt: now(), value});
          return {...value, upstreamError: false};
        } catch (error) {
          if (existing) return {...existing.value, upstreamError: true, message: error.message};
          throw error;
        } finally { inFlight.delete(key); }
      })());
    }
    return inFlight.get(key);
  }
  return async function weatherApi(req, res, next = () => {res.statusCode = 404; res.end();}) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/weather/')) return next();
    const send = (status, value) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') {res.setHeader('Allow', 'GET'); return send(405, {error: 'Use GET.'});}
    try {
      if (url.pathname === '/api/weather/live') {
        return send(200, await cached('live', 600_000, async () => {
          const end = now();
          const start = end - 24 * 3600_000;
          const rows = (await query(LIVE_COLLECTION, new Date(start).toISOString(), new Date(end).toISOString(), ['ta', 'ff', 'dd']))
            .filter(row => Date.parse(row.time) >= start && Date.parse(row.time) <= end);
          if (!rows.some(row => ['ta', 'ff', 'dd'].some(code => Number.isFinite(row[code])))) throw new ApiError(502, 'No observations are available for the past 24 hours.');
          return {station: STATION, checkedAt: new Date(now()).toISOString(), start: new Date(start).toISOString(), end: new Date(end).toISOString(), rows,
            source: LIVE_COLLECTION, validated: false, refreshSeconds: 600};
        }));
      }
      if (url.pathname === '/api/weather/history') {
        const year = Number(url.searchParams.get('year') || 2025);
        if (!Number.isInteger(year) || year < 1992 || year >= new Date(now()).getUTCFullYear()) throw new ApiError(400, 'Choose a complete year from 1992 to the previous year.');
        return send(200, await cached(`history-${year}`, 24 * 3600_000, async () => {
          const rows = await query(HISTORY_COLLECTION, `${year}-01-02T00:00:00Z`, `${year + 1}-01-01T00:00:00Z`, ['TG', 'FG']);
          const months = summariseHistory(rows, year);
          if (!months.some(month => month.temperature.validDays || month.windSpeed.validDays)) throw new ApiError(502, 'No historical observations were returned for this year.');
          return {station: STATION, checkedAt: new Date(now()).toISOString(), year, months, minimumCoverage: 0.8,
            source: HISTORY_COLLECTION, validated: true};
        }));
      }
      send(404, {error: 'Weather endpoint not found.'});
    } catch (error) { send(error.status || 502, {error: error.status ? error.message : 'Weather data could not be processed.'}); }
  };
}
