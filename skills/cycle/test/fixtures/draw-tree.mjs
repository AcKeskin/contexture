// Stub capture command that draws from the tree it runs in: a box when the tree
// has look.json (the run branch's change), plain otherwise (the base).
// Usage: node draw-tree.mjs <out.png> <bg hex>. STUB_CAPTURE_FAIL makes it fail.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.STUB_CAPTURE_FAIL) {
  console.error('capture broke');
  process.exit(1);
}
const [out, bg] = process.argv.slice(2);
const look = existsSync('look.json') ? JSON.parse(readFileSync('look.json', 'utf8')) : null;
const draw = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'visual', 'test', 'fixtures', 'draw.mjs');
const r = spawnSync(process.execPath, [draw, out, bg, ...(look ? [look.box, '10,10,10,10'] : [])], { stdio: 'inherit' });
process.exit(r.status ?? 1);
