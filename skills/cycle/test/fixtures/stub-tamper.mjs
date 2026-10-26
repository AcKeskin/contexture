// Like stub-claude, but stage 3 also edits .git/config, the way a stage could
// plant a hook or an fsmonitor. The loop must refuse to push afterwards.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const prompt = process.argv[process.argv.indexOf('-p') + 1];
if (prompt.split(' ')[3] === '3') appendFileSync(join(process.cwd(), '.git', 'config'), '[core]\n\tfsmonitor = evil\n');
await import('./stub-claude.mjs');
