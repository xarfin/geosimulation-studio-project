import { cpSync, mkdirSync } from 'node:fs';

// Vite serves public/ during development and copies it into production builds.
for (const folder of ['ThirdParty', 'Workers', 'Assets', 'Widgets']) {
  const target = new URL(`../public/cesiumStatic/${folder}/`, import.meta.url);
  mkdirSync(target, { recursive: true });
  cpSync(
    new URL(`../node_modules/cesium/Build/Cesium/${folder}/`, import.meta.url),
    target,
    { recursive: true },
  );
}
console.log('Cesium assets ready.');
