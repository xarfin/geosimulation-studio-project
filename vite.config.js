import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  define: { CESIUM_BASE_URL: JSON.stringify('/cesiumStatic') },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), task47: resolve(import.meta.dirname, 'task47.html') },
    },
  },
});
