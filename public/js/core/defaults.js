import { mulberry, uid, pick } from '../util.js';

export const TRAITS = ['temperament', 'curiosity', 'sociability', 'humor', 'energy', 'patience'];
const OBJECTS_FAV = ['ball', 'book', 'lamp', 'window', 'plant', 'radio', 'cushion'];
const DISLIKES = ['loud', 'rough', 'rain', 'dark', 'mess'];

/** Each MAX gets a slightly different personality: traits live in 0.3..0.7 so differences stay subtle but real. */
export function makePersonality(seed) {
  const r = mulberry(seed);
  const tr = {}; for (const t of TRAITS) tr[t] = +(0.36 + r() * 0.3).toFixed(3);
  return {
    seed, traits: tr, base: { ...tr },
    chronotype: r() < 0.5 ? 'day' : 'night', // slight lean, changes when MAX sleeps/wakes
    favorite: OBJECTS_FAV[Math.floor(r() * OBJECTS_FAV.length)], favorite2: OBJECTS_FAV[Math.floor(r() * OBJECTS_FAV.length)],
    dislike: DISLIKES[Math.floor(r() * DISLIKES.length)],
    style: ['wry', 'gentle', 'bright', 'dry'][Math.floor(r() * 4)],
    topics: {}, journal: [], lastEval: 0,
  };
}

export function makeMax() {
  const seed = (Math.random() * 4294967295) >>> 0; const r = mulberry(seed ^ 0x9e3779b9);
  return {
    v: 1, born: Date.now(), seed,
    look: { hue: Math.round(24 + r() * 18), sat: Math.round(70 + r() * 14), eye: Math.round(r() * 360), ear: r() < 0.5 ? 0 : 1, tail: r() < 0.5 ? 0 : 1 },
    personality: makePersonality(seed),
    mood: { valence: 0.25, arousal: 0.35 }, energy: 0.8,
    relationship: { bond: 0.05, trust: 0.4, sessions: 0, days: 0, lastDay: '', taps: 0, gentle: 0, rough: 0, plays: 0, chats: 0, holds: 0, throws: 0, ignoredDays: 0, firstMet: 0 },
    activity: 'idle', location: { x: 200, ly: 0.5, surface: 'floor' }, sleep: { asleep: false, since: 0 },
    lastSeen: 0, lastInteraction: 0, lastActivity: { kind: 'idle', ts: 0 }, emotional: 'calm',
    daily: { key: '', naps: 0, chats: 0, plays: 0 },
    flags: {},
  };
}

export const OBJECT_IDS = ['ball', 'mug', 'book', 'block1', 'block2', 'vase', 'radio'];
export function makeRoom() {
  return {
    v: 1, created: Date.now(),
    objects: {}, // id -> {x, ly, surface, broken?, variant?}; positions absent until first layout => home positions
    lamp: { on: null }, window: { open: false }, frame: { tilt: 0.0 }, radio: { on: false },
    furniture: {}, // plant/lamp/cushion/rug: {x, ly}
    trinkets: [], // persistent room effects from events {id, kind, ts, x?, ly?, meta}
    changes: [],
  };
}
export function makeUser(lang = 'en') {
  return {
    v: 1, lang, langAuto: true, onboarded: false, clientId: uid() + uid(),
    caps: { memory: true, notifications: false, sound: true, device: false, location: false, voice: false, haptics: true, advanced: false },
    osState: {}, // last observed OS permission state per capability
    notif: { quietOn: true, quietStart: '22:00', quietEnd: '08:00', sentLog: [] },
    sound: { volume: 0.7, ambience: true, voice: true, music: true },
    appearance: { textScale: 1, contrast: false, motion: 'system', timeOverride: 'auto' },
    perf: { mode: 'auto' },
    location: null, // {lat, lon} rounded to 0.1 deg, stays on device
    advanced: { bridgeUrl: 'http://127.0.0.1:8765', token: '' },
    tutorial: { t: 0, done: {} },
    install: { dismissedAt: 0 },
    stats: { firstEnter: 0 },
  };
}
export function makeEvents() {
  return { v: 1, discovered: {}, active: [], completed: {}, rare: {}, cooldowns: {}, log: [], shared: {}, lastAny: 0, dayCount: { key: '', n: 0 } };
}
