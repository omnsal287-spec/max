// Renders the brand SVGs to the PNG sizes used by the manifest / iOS / notifications.
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
import fs from 'fs';
const dir = new URL('../public/icons/', import.meta.url).pathname;
const jobs = [
  ['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-192.png', 192], ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon-maskable.svg', 'apple-touch-icon.png', 180], ['icon.svg', 'favicon-32.png', 32],
  ['badge.svg', 'badge-96.png', 96],
];
const b = await chromium.launch(); const p = await b.newPage();
for (const [src, out, size] of jobs) {
  await p.setViewportSize({ width: size, height: size });
  const svg = fs.readFileSync(dir + src, 'utf8');
  await p.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: dir + out, omitBackground: true });
}
await b.close();
