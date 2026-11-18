// Worker thread for codemap.mjs: parses files with tree-sitter off the main thread.
// Message in: { id, abs, lang }. Message out: { id, result } or { id, error }.

import fs from 'node:fs';
import { parentPort } from 'node:worker_threads';

import { extractWithTreeSitter } from './treesitter.mjs';

parentPort.on('message', async ({ id, abs, lang }) => {
  try {
    const result = await extractWithTreeSitter(fs.readFileSync(abs, 'utf8'), lang);
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: String(err) });
  }
});
