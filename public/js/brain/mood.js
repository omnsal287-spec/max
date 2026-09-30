// Mood: hidden valence/arousal + energy. Never shown as numbers. Impulses from events decay toward a baseline
// that depends on personality, time of day, weather and room state.
import { S, R, commit } from '../core/state.js';
import { tr } from './personality.js';
import { clamp, damp } from '../util.js';
import { lookAt, currentHour } from './time.js';

let imp = { v: 0, a: 0 }; // short-lived impulses (not persisted; they fade in minutes anyway)
export const impulse = (v, a = 0) => { imp.v = clamp(imp.v + v, -1, 1); imp.a = clamp(imp.a + a, -0.6, 0.8); };

export function circadian(h) { // 0..1 target energy for the hour
  const night = S.max.personality.chronotype === 'night';
  const peak = night ? 20 : 12; let d = Math.abs(h - peak); if (d > 12) d = 24 - d;
  return clamp(1 - d / 11, 0.05, 1);
}
export function roomMess() { let n = 0; for (const o of Object.values(S.room.objects)) if (o.broken) n++; return n; }

export function baseline() {
  const lamp = S.room.lamp.on; const night = lookAt(currentHour()).night > 0.6;
  let v = 0.2 + (tr('temperament') - 0.5) * 0.3 - roomMess() * 0.08 + (R.weather === 'rain' ? (S.max.personality.dislike === 'rain' ? -0.15 : 0.03) : 0.04);
  if (night && lamp) v += 0.12; // cozy
  const bond = S.max.relationship.bond; v += bond * 0.15;
  if (S.max.relationship.ignoredDays > 3) v -= 0.05;
  return { v: clamp(v, -0.5, 0.7), a: clamp(0.25 + (tr('energy') - 0.5) * 0.4 + (S.max.energy - 0.5) * 0.3, 0.05, 0.7) };
}

export function tickMood(dt) {
  const m = S.max; const b = baseline();
  imp.v = damp(imp.v, 0, 1 / 180, dt); imp.a = damp(imp.a, 0, 1 / 90, dt);
  const tv = clamp(b.v + imp.v, -1, 1), ta = clamp(b.a + imp.a, 0, 1);
  m.mood.valence = damp(m.mood.valence, tv, 1 / 25, dt); m.mood.arousal = damp(m.mood.arousal, ta, 1 / 12, dt);
  // energy: drains slowly awake, recovers asleep, follows circadian rhythm
  const target = circadian(currentHour());
  if (m.sleep.asleep) m.energy = clamp(m.energy + dt * 0.004, 0, 1); else m.energy = clamp(m.energy + (target - m.energy) * dt * 0.004 - dt * 0.0006, 0, 1);
}
export function moodWord() {
  const { valence: v, arousal: a } = S.max.mood; const e = S.max.energy;
  if (S.max.sleep.asleep || e < 0.22) return 'sleepy';
  if (v < -0.12) return a > 0.4 ? 'grumpy' : 'uneasy';
  if (a > 0.62 && v > 0.25) return 'excited';
  if (a > 0.48 && v > 0.1) return tr('curiosity') > 0.5 ? 'curious' : 'playful';
  if (v > 0.28 && a < 0.4) return S.room.lamp.on && lookAt(currentHour()).night > 0.6 ? 'cozy' : 'content';
  return a < 0.3 ? 'calm' : v > 0.15 ? 'content' : 'curious';
}
/** Face/body bias derived from mood, used by the character renderer and behaviour picker. */
export const moodTone = () => ({ v: S.max.mood.valence, a: S.max.mood.arousal, e: S.max.energy });
