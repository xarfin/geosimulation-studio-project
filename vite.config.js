import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { weatherPlugin } from './server/weather-vite.mjs';

export default defineConfig({
  plugins: [weatherPlugin()],
  cacheDir: '.vite-cache',
  define: { CESIUM_BASE_URL: JSON.stringify('/cesiumStatic') },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), task47: resolve(import.meta.dirname, 'task47.html'), weather: resolve(import.meta.dirname, 'weather.html') },
    },
  },
});
