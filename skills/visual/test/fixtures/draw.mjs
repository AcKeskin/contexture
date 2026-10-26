// Stub capture command for tests: draws a 40x30 PNG with a background and an
// optional box, the way a project's shot tool would write a screenshot.
// Usage: node draw.mjs <out.png> <bg hex> [box hex] [x,y,w,h]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require(process.env.PNGJS_PATH);
const [out, bg, box, rect] = process.argv.slice(2);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const png = new PNG({ width: 40, height: 30 });
const [bx, by, bw, bh] = (rect || '0,0,0,0').split(',').map(Number);
for (let y = 0; y < 30; y += 1) {
  for (let x = 0; x < 40; x += 1) {
    const inBox = box && x >= bx && x < bx + bw && y >= by && y < by + bh;
    const [r, g, b] = hex(inBox ? box : bg);
    const i = (y * 40 + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, PNG.sync.write(png));
