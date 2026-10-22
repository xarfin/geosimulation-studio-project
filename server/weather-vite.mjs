import {loadEnv} from 'vite';
import {createWeatherApi} from './weather-api.mjs';

export function weatherPlugin() {
  let middleware;
  return {
    name: 'knmi-weather-api',
    configResolved(config) {
      // No VITE_ prefix: this secret must never enter browser JavaScript.
      const env = loadEnv(config.mode, config.root, 'KNMI_');
      middleware = createWeatherApi({apiKey: process.env.KNMI_EDR_API_KEY || env.KNMI_EDR_API_KEY || ''});
    },
    configureServer(server) { server.middlewares.use((...args) => middleware(...args)); },
    configurePreviewServer(server) { server.middlewares.use((...args) => middleware(...args)); },
  };
}
