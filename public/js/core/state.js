// Predictable state architecture.
//   S        persistent state slices: max, room, user, events   (saved to IndexedDB, only via commit())
//   R        runtime state: never persisted (current frame info, connectivity, session stats)
//   memories / chat / moments live in their own object stores (see brain/memory.js, ui/chat.js, brain/events.js)
// All persistent writes go through commit(slice, mutator, source) so there is a single, traceable write path.
import * as storage from './storage.js';
import { deepMerge, debounce } from '../util.js';
import { makeMax, makeRoom, makeUser, makeEvents } from './defaults.js';

export const S = { max: null, room: null, user: null, events: null };
export const R = {
  online: navigator.onLine, aiStatus: 'unknown', // unknown | online | local
  fps: 60, quality: null, sessionStart: Date.now(), activeMs: 0, lastInput: Date.now(),
  battery: null, connection: null, hidden: false, lastAIRequest: null, phase: 'day', weather: 'clear',
  session: { taps: 0, gentle: 0, rough: 0, plays: 0, chats: 0, throws: 0, holds: 0, breaks: 0, moves: 0, topics: {} },
};
const subs = {};
const DEFS = { max: makeMax, room: makeRoom, user: makeUser, events: makeEvents };
const savers = {};
for (const k of Object.keys(S)) savers[k] = debounce(() => storage.kvSet(k, S[k]), 600);

export async function load(seedLang) {
  await storage.init();
  let fresh = false;
  for (const k of Object.keys(S)) {
    const saved = await storage.kvGet(k);
    const def = k === 'user' ? DEFS[k](seedLang) : DEFS[k]();
    if (saved) S[k] = deepMerge(def, saved); else { S[k] = def; if (k === 'max') fresh = true; }
  }
  return { fresh };
}
export function on(slice, fn) { (subs[slice] ||= new Set()).add(fn); return () => subs[slice].delete(fn); }
export function commit(slice, mutator, source = 'app') {
  mutator(S[slice]);
  savers[slice]();
  if (subs[slice]) for (const fn of subs[slice]) { try { fn(S[slice], source); } catch (e) { console.error(e); } }
}
export function saveNow() { for (const k of Object.keys(S)) savers[k].flush(); }
export async function resetSlice(slice, seedLang) { S[slice] = slice === 'user' ? DEFS[slice](seedLang) : DEFS[slice](); await storage.kvSet(slice, S[slice]); if (subs[slice]) subs[slice].forEach((f) => f(S[slice], 'reset')); }
export const events = new EventTarget(); // app-wide notifications of things that happened: emit('max:tap', {...})
export const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
export const listen = (type, fn) => { const f = (e) => fn(e.detail, e); events.addEventListener(type, f); return () => events.removeEventListener(type, f); };
