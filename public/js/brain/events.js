// Event engine: conditions, probability, cooldowns, rarity, persistence, consequences, MAX reactions.
// Rare events use deterministic per-day rolls (seeded by this MAX + date): reloading never re-rolls them.
import * as storage from '../core/storage.js';
import { S, R, commit, emit } from '../core/state.js';
import { hashStr, mulberry, dayKey, DAY, HOUR, MIN, uid, rnd, clamp, hourFloat } from '../util.js';
import { world, addTrinket, get as getObj, respawn } from '../render/world.js';
import { MX, emote, sayText, setAct, hop } from './maxctl.js';
import { t, say } from '../i18n/index.js';
import * as memory from './memory.js';
import { impulse } from './mood.js';
import { lookAt, currentHour } from './time.js';
import { scene, snapshot, focusOn } from '../render/scene.js';
import * as audio from '../audio.js';
import * as notify from '../device/notify.js';
import { spawn, burst } from '../render/fx.js';

const apiBase = () => (window.MAX_CONFIG && window.MAX_CONFIG.apiBase) || '';
const trinketExists = (type) => S.room.trinkets.some((x) => x.type === type);
const broken = () => Object.entries(S.room.objects).filter(([, o]) => o.broken).map(([id, o]) => ({ id, ts: o.brokenTs || 0 }));

export const EVENTS = {
  stone: { kind: 'personal', rarity: 'rare', daily: 0.06, window: [10, 21], bg: true, once: true, shareable: true,
    cond: () => !trinketExists('stone'),
    run() { const x = clamp(MX.x + (MX.x < 200 ? 60 : -60), 40, 360); const tr = { id: 'stone', type: 'stone', x, ly: 0.62, surface: 'floor', ts: Date.now() }; commit('room', (r) => r.trinkets.push(tr), 'event'); addTrinket(tr); const o = getObj('stone'); if (o) { o.y = o.lane - 120; o.air = true; o.vy = 0; } return { look: { x, y: world.L.laneMin + 100 } }; },
    react: () => { emote('curious', 3, { tilt: 0.3 }); hop(200); } },
  scribble: { kind: 'personal', rarity: 'uncommon', daily: 0.12, window: [9, 20], bg: true, once: true, shareable: true,
    cond: () => !trinketExists('scribble') && (S.max.personality.traits.energy > 0.45 || S.max.relationship.plays >= 3),
    run() { commit('room', (r) => r.trinkets.push({ id: 'scribble', type: 'scribble', ts: Date.now() }), 'event'); return { look: { x: world.L.win.x + world.L.win.w + 40, y: world.L.wallH * 0.6 } }; },
    react: () => { emote('happy', 3); hop(180); } },
  seed: { kind: 'personal', rarity: 'rare', daily: 0.05, window: [10, 19], bg: true, once: true, shareable: true,
    cond: () => !trinketExists('sprout'),
    run() { commit('room', (r) => r.trinkets.push({ id: 'sprout', type: 'sprout', ts: Date.now() }), 'event'); const p = getObj('plant'); if (p) p.wob = 1; return { look: p ? { x: p.x, y: p.y - 40 } : null }; },
    react: () => { emote('shy', 3); } },
  visitor: { kind: 'personal', rarity: 'rare', daily: 0.07, window: [8, 17], needsPresence: true, shareable: true,
    cond: (c) => c.look.sunA > 0.5 && R.weather !== 'rain' && !S.max.sleep.asleep,
    run() {
      const L = world.L; MX.lookMode = 'window'; MX.lookHold = 14; focusOn({ x: L.win.x + L.win.w / 2, y: L.win.y + L.win.h * 0.55, z: 1.55 });
      const b = { phase: 'arrive', k: 0 }; R.bird = b; let t0 = performance.now();
      const step = () => { const el = (performance.now() - t0) / 1000; if (el < 2) { b.phase = 'arrive'; b.k = el / 2; } else if (el < 9) { b.phase = el % 3 < 0.6 ? 'hop' : 'sit'; } else if (el < 11) { b.phase = 'leave'; b.k = (el - 9) / 2; } else { R.bird = null; focusOn(null); leaveFeather(); return; } requestAnimationFrame(step); };
      requestAnimationFrame(step); return { delayCard: 9000 };
    },
    react: () => { emote('surprised', 2); } },
  midnight: { kind: 'personal', rarity: 'rare', daily: 0.1, window: [23, 27], needsPresence: true, shareable: true,
    cond: (c) => c.look.night > 0.8 && !S.max.sleep.asleep && !S.max.daily.midnight,
    run() { const L = world.L; MX.lookMode = 'window'; MX.lookHold = 25; focusOn({ x: L.win.x + L.win.w / 2, y: L.win.y + L.win.h * 0.5, z: 1.45 }); setTimeout(() => focusOn(null), 11000); return { delayCard: 5000 }; },
    react: () => { emote('calm', 6); } },
  button: { kind: 'personal', rarity: 'uncommon', once: false, manual: true, shareable: true,
    cond: () => !trinketExists('button'),
    run() { const tr = { id: 'button', type: 'button', x: 70, ly: 0.3, surface: 'floor', ts: Date.now() }; commit('room', (r) => r.trinkets.push(tr), 'event'); addTrinket(tr); return {}; },
    react: () => { emote('happy', 2.5); } },
  mugnew: { kind: 'consequence', rarity: 'uncommon', bg: true, shareable: false,
    cond: () => { const m = broken().find((b) => b.id === 'mug'); return m && Date.now() - m.ts > 3 * HOUR; },
    run() { commit('room', (r) => { r.objects.mug = { x: 316, surface: 'table', variant: 1 }; }, 'event'); respawn('mug'); memory.add({ cat: 'room', tk: 'memk.fixed', tp: { item: t('obj.mug') }, importance: 2, source: 'auto' }); return {}; },
    react: () => { emote('curious', 2); } },
  aurora: { kind: 'shared', rarity: 'shared', shareable: true, manual: true, cond: () => true, run() { return {}; }, react: () => { emote('surprised', 2.5); } },
};
function leaveFeather() {
  if (trinketExists('feather')) return; const tr = { id: 'feather', type: 'feather', x: 320, surface: 'shelf', ts: Date.now() }; commit('room', (r) => r.trinkets.push(tr), 'event'); addTrinket(tr);
}

// ---------------------------------------------------------------- engine
const rollFor = (id, day) => mulberry(hashStr(S.max.seed + ':' + day + ':' + id))();
function scheduledHour(def, id, day) { const [a, b] = def.window || [9, 21]; return a + mulberry(hashStr(S.max.seed + ':h:' + day + ':' + id))() * (b - a); }

export function tick(present) {
  const ev = S.events; const day = dayKey(); const d = new Date(); const h = hourFloat(d); const hAlt = h < 6 ? h + 24 : h;
  if (ev.dayCount.key !== day) commit('events', (e) => { e.dayCount = { key: day, n: 0 }; }, 'event');
  if (Date.now() - ev.lastAny < 6 * MIN) return; if (ev.dayCount.n >= 2) return;
  const look = lookAt(currentHour()); const ctx = { look, present, h };
  for (const [id, def] of Object.entries(EVENTS)) {
    if (def.manual) continue; if (def.needsPresence && !present) continue; if (!def.bg && !present) continue;
    if (def.kind === 'personal' && rollFor(id, day) >= def.daily) continue;
    if (def.kind === 'personal' && ev.completed[id]?.day === day) continue;
    if (def.once && ev.completed[id]) continue;
    if (def.kind === 'personal' && (hAlt < scheduledHour(def, id, day))) continue;
    if (def.kind === 'personal' && hAlt > (def.window ? def.window[1] : 24) + 2) continue;
    if (ev.cooldowns[id] && Date.now() < ev.cooldowns[id]) continue;
    if (def.kind === 'consequence' && Math.random() > 0.25) continue;
    let ok = false; try { ok = def.cond(ctx); } catch {} if (!ok) continue;
    fire(id, { present }); return; // at most one per tick
  }
}
export function fire(id, { present = true, key } = {}) {
  const def = EVENTS[id]; if (!def) return; const first = !S.events.discovered[id];
  const out = def.run() || {};
  const rar = def.rarity; const ts = Date.now();
  commit('events', (e) => { e.discovered[id] = { ts: e.discovered[id]?.ts || ts, n: (e.discovered[id]?.n || 0) + 1 }; e.completed[id] = { day: dayKey(), ts }; e.lastAny = ts; e.dayCount.n++; e.cooldowns[id] = ts + (def.cooldownDays || 3) * DAY; if (def.rarity === 'rare' || def.rarity === 'shared') e.rare[id] = true; }, 'event');
  if (id === 'midnight') commit('max', (m) => { m.daily.midnight = true; }, 'event');
  memory.add({ cat: 'event', tk: 'ev.' + id + '.title', importance: rar === 'uncommon' ? 2 : 4, source: 'auto', dedupeKey: 'ev:' + id + ':' + dayKey() });
  impulse(0.25, 0.25);
  if (present) {
    def.react(); MX.lookHold = 3; if (out.look) { MX.lookPt = out.look; }
    if (rar !== 'uncommon') { audio.sfx.rare(); scene.flash = 0.35; } else audio.sfx.chime();
    setTimeout(() => sayText(t('ev.' + id + '.line'), { emotion: 'curious' }), 900);
  }
  const momentId = uid();
  const cardDelay = out.delayCard || 1600;
  setTimeout(async () => {
    const snap = present ? snapshot() : null; const m = { id: momentId, ev: id, ts, rarity: rar, snap, shareable: !!def.shareable, key };
    await storage.put('moments', m); const all = await storage.all('moments'); if (all.length > 40) { for (const o of all.sort((a, b) => a.ts - b.ts).slice(0, all.length - 40)) await storage.del('moments', o.id); }
    emit('event:fired', { id, moment: m, present });
  }, cardDelay);
  if (document.hidden || !present) notify.send({ title: t('app.name'), body: t('ev.' + id + '.notif'), tag: 'ev-' + id });
  return momentId;
}
export const getMoments = async () => (await storage.all('moments')).sort((a, b) => b.ts - a.ts);
export async function deleteMoment(id) { await storage.del('moments', id); }

// ---------------------------------------------------------------- shared rare event (backend coordinated)
let sharedTimer = 0;
export async function pollShared() {
  if (!navigator.onLine) return;
  try {
    const c = new AbortController(); const to = setTimeout(() => c.abort(), 6000);
    const r = await fetch(apiBase() + '/api/shared', { signal: c.signal, cache: 'no-store' }); clearTimeout(to); if (!r.ok) return; const { active } = await r.json();
    if (active && active.id === 'aurora' && Date.now() < active.endsAt) {
      R.aurora = 1; R.sharedEnd = active.endsAt; R.currentEvent = 'aurora';
      const key = 'aurora:' + active.key;
      if (!S.events.shared[key]) { commit('events', (e) => { e.shared[key] = Date.now(); }, 'event'); fire('aurora', { key }); addPin(); focusOn({ x: world.L.win.x + world.L.win.w / 2, y: world.L.win.y + world.L.win.h / 2, z: 1.5 }); MX.lookMode = 'window'; MX.lookHold = 30; setTimeout(() => focusOn(null), 9000); }
    } else if (R.aurora) { R.aurora = 0; R.currentEvent = null; }
  } catch {}
}
function addPin() { if (!trinketExists('pin')) commit('room', (r) => r.trinkets.push({ id: 'pin', type: 'pin', ts: Date.now() }), 'event'); }
export function startSharedPolling() { pollShared(); clearInterval(sharedTimer); sharedTimer = setInterval(() => { if (!document.hidden) pollShared(); }, 4 * MIN); window.addEventListener('online', pollShared); }
export function checkSharedEnd() { if (R.aurora && R.sharedEnd && Date.now() > R.sharedEnd) { R.aurora = 0; R.currentEvent = null; R.sharedEnd = 0; } }
