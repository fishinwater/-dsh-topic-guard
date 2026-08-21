/** Build the hand-written client bundle: src/client.js -> lib/client.js. */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src', 'client.js');
const dst = join(root, 'lib', 'client.js');
await mkdir(dirname(dst), { recursive: true });
await copyFile(src, dst);
console.log('client bundle:', src, '->', dst);
