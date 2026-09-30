// Lists every file in public/ (except the service worker and itself) so the service worker can precache the whole app shell.
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = new URL('../public/', import.meta.url).pathname; const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else { const u = '/' + relative(root, p).split('\\').join('/'); if (!['/sw.js', '/precache.json', '/_headers', '/index.html'].includes(u) && !u.endsWith('.map')) files.push(u); } } })(root);
files.sort(); const h = createHash('sha1'); for (const f of files) { h.update(f); h.update(readFileSync(join(root, f))); }
const version = h.digest('hex').slice(0, 10);
writeFileSync(join(root, 'precache.json'), JSON.stringify({ version, files: ['/', ...files] }, null, 1));
console.log(`precache: ${files.length} files, version ${version}`);
