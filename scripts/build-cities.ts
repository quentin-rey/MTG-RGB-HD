/**
 * Regenerates `public/data/cities.json`, the city labels' dataset.
 *
 * The source is Natural Earth's 1:10m populated places (public domain), which weighs 19.4 MB as
 * GeoJSON — raw.githubusercontent.com serves it uncompressed — while the app reads four values per
 * city: longitude, latitude, population and name. It used to be fetched in full on every visit,
 * whether or not the "Villes" overlay was on. The trimmed file keeps exactly those four values,
 * as `[lng, lat, population, name]` rows, and ships with the app.
 *
 * The source is pinned to a commit so a regeneration is reproducible and cannot pick up an
 * upstream change unnoticed.
 *
 * Usage: npm run data:cities
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const SOURCE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${SOURCE_COMMIT}/geojson/ne_10m_populated_places.geojson`;
const OUTPUT = path.resolve('public/data/cities.json');

/**
 * Below the smallest population any zoom level can show: `getVisibleCityFeatures` requires 25 000
 * at its most permissive zoom, divided by the density slider's maximum of 3. Anything under that
 * can never be drawn, so shipping it would only cost bytes.
 */
const MIN_POPULATION = Math.floor(25000 / 3);

type SourceFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { NAME?: string; NAMEASCII?: string; POP_MAX?: number };
};

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Natural Earth download failed: HTTP ${response.status}`);
const source = (await response.json()) as { features?: SourceFeature[] };

const rows: Array<[number, number, number, string]> = [];
for (const feature of source.features ?? []) {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const population = feature.properties?.POP_MAX ?? 0;
  const name = feature.properties?.NAME ?? feature.properties?.NAMEASCII;
  if (typeof lng !== 'number' || typeof lat !== 'number' || !name || population < MIN_POPULATION) continue;
  // Four decimals is about 11 m, far below what a label at zoom 11 can show.
  rows.push([Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, population, name]);
}
rows.sort((a, b) => b[2] - a[2]);

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({
  source: `Natural Earth 1:10m populated places (public domain), ${SOURCE_COMMIT}`,
  columns: ['lng', 'lat', 'population', 'name'],
  cities: rows,
})}\n`);
console.log(`${rows.length} cities written to ${path.relative(process.cwd(), OUTPUT)}`);
