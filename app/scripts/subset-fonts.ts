// Shrinks the fonts in a built site (dist/fonts) to the characters the video can draw: every
// non-ASCII character in the scene sources and lyrics, plus printable ASCII. Dev and offline renders
// keep the full fonts in public/fonts; only the published site is subset (about 30 MB -> under 2 MB).
//   bun scripts/subset-fonts.ts [dist]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';

const APP = path.join(import.meta.dir, '..');
const dist = path.resolve(process.argv[2] ?? path.join(APP, 'dist'));

const sources = [path.join(APP, 'src'), path.join(APP, '..', 'data', 'lyrics.json')];
const chars = new Set<string>();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
const collect = (p: string) => {
  if (p.endsWith('.json') || p.endsWith('.ts')) for (const ch of readFileSync(p, 'utf8')) chars.add(ch);
  else for (const e of readdirSync(p, { withFileTypes: true })) collect(path.join(p, e.name));
};
sources.forEach(collect);
// vertical forms are mapped in scenes/_jp.ts, so their characters are already in the sources
const text = [...chars].join('');

const dir = path.join(dist, 'fonts');
for (const f of readdirSync(dir).filter((f) => f.endsWith('.ttf'))) {
  const file = path.join(dir, f);
  const full = readFileSync(file);
  const out = await subsetFont(full, text, { targetFormat: 'truetype' });
  writeFileSync(file, out);
  console.log(`${f}: ${(full.length / 1e6).toFixed(1)} MB -> ${(out.length / 1e6).toFixed(2)} MB`);
}
console.log(`${chars.size} characters kept`);
