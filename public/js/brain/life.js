// Daily life: presence & absence, day rollovers, relationship bookkeeping, what happens while the user is away.
import { S, R, commit, emit } from '../core/state.js';
import { clamp, dayKey, DAY, HOUR, MIN, rnd, pick } from '../util.js';
import { world, get as getObj, saveRoom } from '../render/world.js';
import { laneToY } from '../render/layout.js';
import { MX, setAct, sayLine, persistMax, emote, fallAsleep, initMax } from './maxctl.js';
import { evolve, stage } from './personality.js';
import { tickMood, impulse } from './mood.js';
import { lookAt, currentHour } from './time.js';
import * as events from './events.js';
import * as memory from './memory.js';

/** Called once per app open / return from background. `elapsed` = ms since MAX last saw the user. */
export function onEnter(first) {
  const m = S.max; const last = m.lastSeen || 0; const elapsed = last ? Date.now() - last : 0; const today = dayKey();
  commit('max', (x) => {
    x.relationship.sessions++; if (x.relationship.lastDay !== today) { x.relationship.days++; x.relationship.lastDay = today; }
    if (!x.relationship.firstMet) x.relationship.firstMet = Date.now(); if (x.daily.key !== today) x.daily = { key: today, naps: 0, chats: 0, plays: 0 };
  }, 'session');
  if (first) { memory.add({ cat: 'relationship', tk: 'memk.met', importance: 4, source: 'auto', dedupeKey: 'met' }); return { elapsed: 0, line: null }; }
  evolve();
  const report = simulateAway(elapsed);
  R.awayMs = elapsed; return { elapsed, ...report };
}

/** Bounded, plausible catch-up. Never simulates impossible amounts of activity. */
function simulateAway(elapsed) {
  const out = { line: null }; if (elapsed < 2 * MIN) return out;
  const hrs = elapsed / HOUR; const night = lookAt(currentHour()).night > 0.6;
  commit('max', (m) => {
    m.energy = clamp(m.energy + Math.min(0.5, hrs * 0.08) * (m.sleep.asleep ? 1.5 : 1) - (hrs > 10 ? 0 : 0), 0.15, 1);
    m.mood.arousal = 0.3; m.mood.valence = clamp(m.mood.valence * Math.exp(-hrs / 6) + 0.05, -0.4, 0.5);
    if (hrs > 0.4) { m.sleep.asleep = night && m.energy < 0.85 && Math.random() < 0.8; m.sleep.since = m.sleep.asleep ? Date.now() : 0; }
  }, 'away');
  // a little moved around the room: only floor objects, small shifts, more when curious and away longer
  if (hrs > 1.5) {
    const cand = world.list.filter((o) => o.def.kind === 'dyn' && o.surface === 'floor' && !o.held && !o.def.noCollide);
    const n = Math.min(2, Math.floor(hrs / 3) + (Math.random() < S.max.personality.traits.curiosity ? 1 : 0));
    for (let i = 0; i < n && cand.length; i++) { const o = cand.splice(Math.floor(Math.random() * cand.length), 1)[0]; o.x = clamp(o.x + rnd(-70, 70), 30, 370); o.y = o.lane = clamp(o.lane + rnd(-40, 40), world.L.laneMin, world.L.laneMax); }
    if (n) saveRoom();
  }
  // relocate MAX plausibly
  const c = getObj('cushion');
  if (S.max.sleep.asleep && c) { MX.x = c.x; MX.y = MX.lane = c.y - 2; MX.onCushion = true; } else if (hrs > 0.3) { MX.x = rnd(60, 340); MX.y = MX.lane = laneToY(world.L, rnd(0.15, 0.9)); MX.onCushion = false; }
  if (S.max.sleep.asleep) setAct('sleep', 9999);
  // something found while away (uncommon, after a real absence)
  if (hrs >= 14 && Math.random() < 0.45 && !S.room.trinkets.some((x) => x.type === 'button')) { out.found = true; setTimeout(() => events.fire('button', { present: true }), 4500); }
  out.line = elapsed < 10 * MIN ? 'back_short' : elapsed < 20 * HOUR ? 'back_long' : 'back_days';
  if (elapsed < 10 * MIN && Math.random() < 0.5) out.line = null;
  return out;
}
export function onLeave() { commit('max', (m) => { m.lastSeen = Date.now(); }, 'leave'); persistMax(); saveRoom(); }

let lastBeat = 0, persistT = 0, evT = 0, lastDay = dayKey();
/** Runs while the app is visible: slow systems. dt in seconds. */
export function heartbeat(dt) {
  tickMood(dt);
  persistT += dt; if (persistT > 6) { persistT = 0; persistMax(); commit('max', (m) => { m.lastSeen = Date.now(); }, 'beat'); if (world.dirty) saveRoom(); }
  evT += dt; if (evT > 20) { evT = 0; events.tick(true); events.checkSharedEnd(); if (dayKey() !== lastDay) { lastDay = dayKey(); commit('max', (m) => { if (m.daily.key !== lastDay) m.daily = { key: lastDay, naps: 0, chats: 0, plays: 0 }; }, 'day'); evolve(); } }
}
/** Low-frequency work while the page is alive in the background (events that don't need the user present). */
export function backgroundBeat() { events.tick(false); }
export function relationshipWord() { return 'rel.' + stage(); }
