import { readdirSync, writeFileSync } from 'node:fs';

// Rebuilt on start/build, so replacing an export refreshes the tile index.
for (const relative of ['data/background/luchtfoto', 'data/background/study-area', 'data/elevation/ahn']) {
  const directory = new URL('../public/' + relative + '/', import.meta.url);
  const tiles = readdirSync(directory, { recursive: true })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => /^\d+\/\d+\/\d+\.png$/.test(path));
  writeFileSync(new URL('available-tiles.json', directory), JSON.stringify(tiles));
  console.log(relative + ': ' + tiles.length + ' imagery tiles indexed.');
}
