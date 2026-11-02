import {createServer} from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {resolve, relative, extname, sep} from 'node:path';
import {createWeatherApi} from '../server/weather-api.mjs';

const root = resolve(import.meta.dirname, '..');
for (const name of ['.env', '.env.local']) {
  const file = resolve(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}
const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'weather.html'))) throw new Error('Run npm.cmd run build first.');
const api = createWeatherApi({apiKey: process.env.KNMI_EDR_API_KEY || ''});
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.geojson':'application/geo+json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.wasm':'application/wasm', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json'};
const server = createServer((req, res) => api(req, res, () => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405); return res.end();}
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(dist, `.${path}`);
    const rel = relative(dist, file);
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep).some(part => part.startsWith('.')) || !statSync(file).isFile()) {res.writeHead(404); return res.end('Not found');}
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'});
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch {res.writeHead(404); res.end('Not found');}
}));
const port = Number(process.env.PORT || 4173);
server.listen(port, '0.0.0.0', () => console.log(`Rotterdam application listening on port ${port}`));
