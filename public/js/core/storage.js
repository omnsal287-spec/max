// Local-first persistence. IndexedDB for structured data, localStorage for tiny boot-time prefs.
// Both fall back to memory if the browser blocks them (private mode, sandboxed iframes), so MAX always runs.
const DB = 'max-db', VER = 1;
const STORES = { kv: 'key', memories: 'id', chat: 'id', moments: 'id' };
let db = null; const mem = {}; export let mode = 'idb';

function open() {
  return new Promise((res, rej) => {
    let rq; try { rq = indexedDB.open(DB, VER); } catch (e) { return rej(e); }
    rq.onupgradeneeded = () => { const d = rq.result; for (const [s, kp] of Object.entries(STORES)) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: kp }); };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); rq.onblocked = () => rej(new Error('blocked'));
  });
}
export async function init() {
  for (const s of Object.keys(STORES)) mem[s] = new Map();
  try { db = await Promise.race([open(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2500))]); } catch { db = null; mode = 'memory'; }
  return mode;
}
function tx(store, rw, fn) {
  return new Promise((res, rej) => {
    try {
      const t = db.transaction(store, rw ? 'readwrite' : 'readonly'); const s = t.objectStore(store);
      const r = fn(s); t.oncomplete = () => res(r && r.result !== undefined ? r.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    } catch (e) { rej(e); }
  });
}
const kpOf = (store) => STORES[store];
export async function get(store, key) {
  if (!db) return mem[store].get(key);
  try { const r = await tx(store, false, (s) => s.get(key)); return r; } catch { return mem[store].get(key); }
}
export async function put(store, val) {
  mem[store].set(val[kpOf(store)], val);
  if (!db) return; try { await tx(store, true, (s) => s.put(val)); } catch {}
}
export async function del(store, key) { mem[store].delete(key); if (!db) return; try { await tx(store, true, (s) => s.delete(key)); } catch {} }
export async function all(store) {
  if (!db) return [...mem[store].values()];
  try { return await tx(store, false, (s) => s.getAll()); } catch { return [...mem[store].values()]; }
}
export async function clear(store) { mem[store].clear(); if (!db) return; try { await tx(store, true, (s) => s.clear()); } catch {} }
export async function clearAll() { for (const s of Object.keys(STORES)) await clear(s); }
export const kvGet = async (k) => (await get('kv', k))?.v;
export const kvSet = (k, v) => put('kv', { key: k, v });

// ---- localStorage (small prefs only) ----
const lsMem = {};
export const ls = {
  get(k, d = null) { try { const v = localStorage.getItem('max.' + k); return v === null ? (k in lsMem ? lsMem[k] : d) : JSON.parse(v); } catch { return k in lsMem ? lsMem[k] : d; } },
  set(k, v) { lsMem[k] = v; try { localStorage.setItem('max.' + k, JSON.stringify(v)); } catch {} },
  del(k) { delete lsMem[k]; try { localStorage.removeItem('max.' + k); } catch {} },
};
export async function wipeEverything() {
  await clearAll();
  try { const keys = Object.keys(localStorage).filter((k) => k.startsWith('max.')); keys.forEach((k) => localStorage.removeItem(k)); } catch {}
  for (const k of Object.keys(lsMem)) delete lsMem[k];
}
