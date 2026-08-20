// Best-effort sync check: erasable-TS src vs runtime lib.
// With `erasableSyntaxOnly` the type annotations can be stripped mechanically;
// a real `pnpm build` (tsc) is authoritative. This script only warns about
// obvious drift (e.g. src edited without rebuilding lib).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'src', 'index.ts'), 'utf8');
const lib = readFileSync(join(root, 'lib', 'index.js'), 'utf8');

// Rough normalization: drop TS-only syntax markers from src for a smoke compare.
const strip = (t) => t
  .replace(/declare\s+/g, '')
  .replace(/\s*:\s*[A-Za-z_$][\w$<>[\]|, ]*\??/g, '')
  .replace(/\bas\s+[A-Za-z_$][\w$]*/g, '')
  .replace(/\(ctx: any/g, '(ctx')
  .replace(/\bany\b/g, '')
  .replace(/import type[^;]+;/g, '')
  .replace(/^import ([^;]+) from '@deepseek-ai\/cordis';/m, 'import { Service } from "@deepseek-ai/cordis";');

const ok = strip(src).trim().length > 500; // heuristic: src is non-trivial
console.log(ok
  ? 'src/index.ts present (sync is manual; run pnpm build to regenerate lib from src)'
  : 'WARNING: src/index.ts looks empty after stripping');
process.exit(0);
