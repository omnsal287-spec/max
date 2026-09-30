// Optional "advanced device features" bridge (Termux + Termux:API running a tiny local helper).
// MAX never depends on it. It is only contacted if the user turned on Advanced device features.
import { S } from '../core/state.js';

let cache = { t: 0, ok: false };
const url = () => (S.user.advanced.bridgeUrl || '').replace(/\/$/, '');
async function req(path, body, ms = 2500) {
  const c = new AbortController(); const tm = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url() + path, { method: body ? 'POST' : 'GET', signal: c.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (S.user.advanced.token || '') }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error('status'); return await r.json();
  } finally { clearTimeout(tm); }
}
export async function available(force = false) {
  if (!S.user.caps.advanced || !S.user.advanced.token) return false;
  if (!force && Date.now() - cache.t < 15000) return cache.ok;
  try { const j = await req('/ping'); cache = { t: Date.now(), ok: !!j.ok }; } catch { cache = { t: Date.now(), ok: false }; }
  return cache.ok;
}
export async function test() { cache.t = 0; try { const j = await req('/ping', null, 3500); cache = { t: Date.now(), ok: !!j.ok }; return !!j.ok; } catch { cache = { t: Date.now(), ok: false }; return false; } }
// Safe actions run directly. Potentially intrusive actions need an explicit, per-use confirmation callback: there is no silent path.
export const ACTIONS = { vibrate: { danger: false }, toast: { danger: false }, torch: { danger: true } };
export async function run(action, payload, confirmFn) {
  const def = ACTIONS[action]; if (!def) throw new Error('unknown');
  if (!(await available())) throw new Error('unavailable');
  if (def.danger) { const okc = confirmFn ? await confirmFn(action) : false; if (!okc) return { cancelled: true }; }
  return req('/action/' + action, payload || {});
}
