#!/usr/bin/env node
// OPTIONAL advanced layer for MAX. Runs in Termux with the Termux:API app + package installed:
//   pkg install nodejs termux-api && node bridge/max-bridge.js
// MAX works fully without this. It only listens on 127.0.0.1, requires a pairing code (Bearer token),
// exposes a fixed allow-list of three actions, and never runs anything supplied by the AI or the page.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = Number(process.env.MAX_BRIDGE_PORT || 8765);
const HOST = '127.0.0.1';
const TOKEN_FILE = path.join(os.homedir(), '.max-bridge-token');
let TOKEN = process.env.MAX_BRIDGE_TOKEN || '';
if (!TOKEN) { try { TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch {} }
if (!TOKEN) { TOKEN = crypto.randomBytes(4).toString('hex'); try { fs.writeFileSync(TOKEN_FILE, TOKEN, { mode: 0o600 }); } catch {} }

const ALLOWED_ORIGINS = (process.env.MAX_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean); // empty = any origin, still token-gated
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { timeout: 4000 }, (e) => (e ? rej(e) : res())));
const clampInt = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

// Fixed allow-list. Arguments are validated and never passed through a shell.
const ACTIONS = {
  vibrate: (b) => run('termux-vibrate', ['-d', String(clampInt(b.ms, 20, 400, 80))]),
  toast: (b) => run('termux-toast', [String(b.text || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 80) || 'MAX']),
  torch: async () => { await run('termux-torch', ['on']); await new Promise((r) => setTimeout(r, 350)); await run('termux-torch', ['off']); },
};

const send = (res, code, obj, origin) => {
  res.writeHead(code, {
    'content-type': 'application/json', 'cache-control': 'no-store',
    'access-control-allow-origin': origin || '*', 'vary': 'Origin',
    'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-private-network': 'true',
  });
  res.end(JSON.stringify(obj));
};

let last = 0;
http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) return send(res, 403, { ok: false, error: 'origin' });
  if (req.method === 'OPTIONS') return send(res, 204, {}, origin);
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 401, { ok: false, error: 'pairing' }, origin);
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/ping') return send(res, 200, { ok: true, actions: Object.keys(ACTIONS) }, origin);
  const m = url.pathname.match(/^\/action\/(\w+)$/);
  if (req.method === 'POST' && m && ACTIONS[m[1]]) {
    if (Date.now() - last < 800) return send(res, 429, { ok: false, error: 'slow down' }, origin);
    last = Date.now();
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on('end', async () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
      try { await ACTIONS[m[1]](j); send(res, 200, { ok: true }, origin); } catch (e) { send(res, 502, { ok: false, error: 'termux-api' }, origin); }
    });
    return;
  }
  send(res, 404, { ok: false }, origin);
}).listen(PORT, HOST, () => {
  console.log(`MAX device bridge ready.\n  Address:       http://${HOST}:${PORT}\n  Pairing code:  ${TOKEN}\nEnter both under MAX > Settings > Advanced.`);
});
