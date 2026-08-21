// Best-effort sync check: src vs lib (server tsc build + client bundle copy).
// `pnpm build` is authoritative; this script only warns about obvious drift.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const checks = [
  ['src/index.ts', 'lib/index.js'],
  ['src/client.js', 'lib/client.js'],
];
let allOk = true;
for (const [srcRel, libRel] of checks) {
  const srcFile = join(root, srcRel);
  const libFile = join(root, libRel);
  if (!existsSync(srcFile)) { console.log('MISSING src:', srcRel); allOk = false; continue; }
  if (!existsSync(libFile)) { console.log('MISSING lib (run pnpm build):', libRel); allOk = false; continue; }
  const srcText = readFileSync(srcFile, 'utf8');
  const libText = readFileSync(libFile, 'utf8');
  if (srcRel.endsWith('.js') && srcText.trim() !== libText.trim()) {
    console.log('DRIFT: client bundle src/client.js differs from lib/client.js — run pnpm build:client');
    allOk = false;
  }
  if (srcRel.endsWith('.ts') && srcText.trim().length < 500) {
    console.log('WARNING: src/index.ts looks empty');
    allOk = false;
  }
}
console.log(allOk ? 'topic-guard src/lib in sync (build is authoritative).' : 'topic-guard: sync issues found.');
process.exit(allOk ? 0 : 1);
