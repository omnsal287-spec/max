// MAX service worker: offline app shell, notification clicks, optional periodic check for the rare shared moment.
const PREFIX = 'max-shell-';
let VERSION = 'dev';
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    let list = ['/'];
    try { const r = await fetch('/precache.json', { cache: 'no-store' }); const j = await r.json(); VERSION = j.version; list = j.files; } catch {}
    const c = await caches.open(PREFIX + VERSION);
    await Promise.all(list.map(async (u) => { try { const r = await fetch(new Request(u, { cache: 'reload' })); if (!r.ok) return; // hosts may redirect (e.g. /index.html -> /): store a clean copy, a redirected response cannot be served to a navigation
      await c.put(u, r.redirected ? new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers }) : r); } catch {} }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    let keep = PREFIX + VERSION; try { const r = await fetch('/precache.json', { cache: 'no-store' }); keep = PREFIX + (await r.json()).version; } catch { const ks = await caches.keys(); keep = ks.filter((k) => k.startsWith(PREFIX)).sort().pop(); }
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== keep) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return; const url = new URL(req.url); if (url.origin !== location.origin) return; if (url.pathname.startsWith('/api/')) return; // never cache the brain or events
  if (req.mode === 'navigate') {
    e.respondWith((async () => { try { const r = await fetch(req); return r; } catch { const c = await caches.match('/') || await caches.match('/index.html'); return c || Response.error(); } })()); return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true }); if (hit) { if (url.pathname.endsWith('precache.json')) return fetch(req).catch(() => hit); return hit; }
    try { const r = await fetch(req); if (r.ok) { const ks = (await caches.keys()).filter((k) => k.startsWith(PREFIX)).sort(); const c = await caches.open(ks.pop() || PREFIX + 'x'); c.put(req, r.clone()); } return r; } catch { return Response.error(); }
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) { const c = all[0]; await c.focus(); c.postMessage({ type: 'open-notebook' }); } else await self.clients.openWindow('/');
  })());
});
// ---- optional: check whether the rare shared moment is happening (Chrome periodic background sync, installed PWAs only) ----
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('max-db'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kv(key, val) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', val === undefined ? 'readonly' : 'readwrite'); const s = tx.objectStore('kv'); const q = val === undefined ? s.get(key) : s.put({ key, v: val }); tx.oncomplete = () => res(q.result && q.result.v); tx.onerror = () => rej(tx.error); }); }
function quiet(p) { if (!p.quietOn) return false; const m = (s) => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; }; const d = new Date(); const cur = d.getHours() * 60 + d.getMinutes(), a = m(p.quietStart), b = m(p.quietEnd); return a === b ? false : a < b ? cur >= a && cur < b : cur >= a || cur < b; }
self.addEventListener('periodicsync', (e) => {
  if (e.tag !== 'max-shared-check') return;
  e.waitUntil((async () => {
    const p = await kv('notifPrefs'); if (!p || !p.enabled || quiet(p)) return;
    const log = (p.sentLog || []).filter((x) => Date.now() - x < 86400000); if (log.length >= 2) return;
    const r = await fetch('/api/shared', { cache: 'no-store' }); const { active } = await r.json(); if (!active || Date.now() > active.endsAt || p.lastShared === active.key) return;
    const all = await self.clients.matchAll({ type: 'window' }); if (all.some((c) => c.visibilityState === 'visible')) return;
    await self.registration.showNotification(p.strings.title, { body: p.strings.body, tag: 'ev-aurora', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', lang: p.lang });
    p.lastShared = active.key; p.sentLog = [...log, Date.now()]; await kv('notifPrefs', p);
  })());
});
