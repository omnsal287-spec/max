// Interaction engine: touch/mouse/keyboard -> tap, hold, drag, throw. Local reactions only (no network).
import { S, R, commit, emit, listen } from '../core/state.js';
import { clamp, rnd, pick, damp } from '../util.js';
import { scene, toWorld } from '../render/scene.js';
import { world, hit as hitObj, grab as grabObj, release as releaseObj, dragTo as dragObj, radius, sOf, saveRoom, get as getObj } from '../render/world.js';
import { scaleAt } from '../render/layout.js';
import { MX, sc as maxScale, emote, sayLine, sayText, grab as grabMax, dragTo as dragMax, release as releaseMax, wake, setAct, hop, persistMax } from './maxctl.js';
import { impulse } from './mood.js';
import { lookAt, currentHour } from './time.js';
import { lampOn } from '../render/light.js';
import { spawn, burst } from '../render/fx.js';
import * as audio from '../audio.js';
import { haptic } from '../device/capabilities.js';
import { stage } from './personality.js';

const G = { id: null, mode: 'none', target: null, t0: 0, x0: 0, y0: 0, samples: [], off: { x: 0, y: 0 }, hold: null, w: { x: 0, y: 0 }, last: 0, purr: false };
let taps = []; // recent tap timestamps on MAX
const HOLD_MS = 380, MOVE_PX = 9;

function maxHit(wx, wy) { const s = maxScale(); const cy = MX.y - 27 * s; return ((wx - MX.x) / (34 * s)) ** 2 + ((wy - cy) / (33 * s)) ** 2 <= 1.15; }
function pick_(wx, wy) {
  const o = hitObj(wx, wy); const m = maxHit(wx, wy);
  if (o && m) { const ko = o.def.flat ? -1 : (o.held ? 9999 : o.surface === 'floor' ? o.y : world.L.platforms.find((p) => p.id === o.surface).sortY); return ko > MX.y + 6 ? { kind: 'obj', o } : { kind: 'max' }; }
  if (m) return { kind: 'max' }; if (o) return { kind: 'obj', o };
  const L = world.L; const w = L.win; if (wx > w.x - 14 && wx < w.x + w.w + 14 && wy > w.y - 10 && wy < w.y + w.h + 14) return { kind: 'window' };
  const f = L.frame; if (Math.abs(wx - f.x) < f.w / 2 + 6 && Math.abs(wy - f.y) < f.h / 2 + 6) return { kind: 'frame' };
  return { kind: 'none' };
}

export function initInput(el) {
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault()); el.addEventListener('keydown', key);
  window.addEventListener('blur', () => up({ pointerId: G.id, forceCancel: true }));
  listen('world:throw', onThrow); listen('world:break', onBreak); listen('world:land', onLand);
}
function touch() { R.lastInput = performance.now(); R.userPresent = true; }

function down(e) {
  if (G.id !== null) return; touch(); audio.unlock(); e.currentTarget.setPointerCapture?.(e.pointerId); G.id = e.pointerId;
  const w = toWorld(e.clientX, e.clientY); G.t0 = performance.now(); G.x0 = e.clientX; G.y0 = e.clientY; G.w = w; G.samples = [{ t: G.t0, x: w.x, y: w.y }]; G.mode = 'pending'; G.target = pick_(w.x, w.y);
  MX.pointer = { x: w.x, y: w.y, t: performance.now() };
  if (G.target.kind === 'max' || G.target.kind === 'obj') G.hold = setTimeout(beginHold, HOLD_MS);
}
function beginHold() {
  if (G.mode !== 'pending') return; const tg = G.target;
  if (tg.kind === 'max') { startMaxGrab(true); } else if (tg.kind === 'obj' && tg.o.def.kind) { startObjGrab(); }
}
function startMaxGrab(hold) {
  const w = G.w; G.off = { x: MX.x - w.x, y: MX.y - w.y }; G.mode = 'max'; grabMax(); R.session.holds++; S.max.relationship.holds++; haptic(14);
  emit('ui:hold', {}); if (hold) { MX.holding = true; const calm = S.max.mood.valence > 0 && S.max.relationship.trust > 0.3; MX.heldExpr = null; emote(calm ? 'cuddle' : 'annoyed', 3, { force: true }); MX.holdStart = performance.now(); MX.holdCalm = calm; }
}
function startObjGrab() { const o = G.target.o; const w = G.w; G.off = { x: o.x - w.x, y: o.y - w.y }; G.mode = 'obj'; grabObj(o); R.objectsMoved = true; haptic(8); emit('ui:objectInteract', { id: o.id }); audio.sfx.pop(); MX.lookPt = { x: o.x, y: o.y }; MX.lookHold = 1.5; }

function move(e) {
  if (e.pointerId !== G.id) { if (G.id === null) { const w = toWorld(e.clientX, e.clientY); MX.pointer = { x: w.x, y: w.y, t: performance.now() }; } return; }
  touch(); const w = toWorld(e.clientX, e.clientY); G.w = w; const now = performance.now(); G.samples.push({ t: now, x: w.x, y: w.y }); while (G.samples.length > 2 && now - G.samples[0].t > 110) G.samples.shift();
  MX.pointer = { x: w.x, y: w.y, t: now };
  if (G.mode === 'pending' && Math.hypot(e.clientX - G.x0, e.clientY - G.y0) > MOVE_PX) {
    clearTimeout(G.hold);
    if (G.target.kind === 'max') startMaxGrab(false); else if (G.target.kind === 'obj') startObjGrab(); else G.mode = 'none';
  }
}
function velocity() { const s = G.samples; if (s.length < 2) return { x: 0, y: 0 }; const a = s[0], b = s[s.length - 1]; const dt = Math.max(0.016, (b.t - a.t) / 1000); return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt }; }
function up(e) {
  if (e.pointerId !== G.id) return; clearTimeout(G.hold); const tg = G.target; const v = velocity(); const dur = performance.now() - G.t0;
  if (G.mode === 'pending' && !e.forceCancel) onTap(tg, G.w);
  else if (G.mode === 'obj') { const o = tg.o; const speed = Math.hypot(v.x, v.y); if (dur < 120 || speed < 40) { v.x = v.y = 0; } releaseObj(o, v.x, v.y); onObjRelease(o, speed); }
  else if (G.mode === 'max') { MX.holding = false; audio.purrStop(); const speed = Math.hypot(v.x, v.y); releaseMax(speed < 60 ? 0 : v.x, speed < 60 ? 0 : v.y); if (speed > 480) { R.session.throws++; S.max.relationship.throws++; R.session.rough++; S.max.relationship.rough++; } else if (MX.holdStart && performance.now() - MX.holdStart > 1500 && MX.holdCalm) { gentle(2); impulse(0.12, -0.05); commit('max', (m) => { m.relationship.bond = clamp(m.relationship.bond + 0.012, 0, 1); }, 'hold'); if (stage() >= 1 && Math.random() < 0.5) sayLine('hold_calm', null, { emotion: 'happy' }); } else if (!MX.holdCalm && MX.holdStart) { sayLine('hold_annoyed'); impulse(-0.08, 0.1); } MX.holdStart = 0; }
  G.id = null; G.mode = 'none'; G.target = null; scene.canvas?.releasePointerCapture?.(e.pointerId);
}
export function updateInput(dt) {
  if (G.id === null) { if (MX.holding) { MX.holding = false; } return; }
  if (G.mode === 'max') {
    G.off.x = damp(G.off.x, 0, 7, dt); G.off.y = damp(G.off.y, 40, 6, dt); dragMax(G.w.x + G.off.x, G.w.y + G.off.y, dt);
    if (MX.holding && !MX.purr && MX.holdCalm) { MX.purr = true; audio.purrStart(); } if (!MX.holdCalm) MX.purr = false;
    const moving = Math.hypot(MX.vx, MX.vy) > 200; if (MX.holdStart && moving && MX.holdCalm && Math.random() < dt * 2) { /* being carried around */ }
    if (MX.holdCalm && performance.now() - MX.holdStart > 2200 && (performance.now() - (G.lastHeart || 0) > 1600)) { G.lastHeart = performance.now(); spawn('heart', MX.x + rnd(-10, 10), MX.y - 70, { size: 7 + Math.random() * 3, vy: -22, life: 1.8, color: '#ff8a8a' }); haptic(6); }
  } else if (G.mode === 'obj') { const o = G.target.o; G.off.x = damp(G.off.x, 0, 10, dt); G.off.y = damp(G.off.y, 10, 8, dt); dragObj(o, G.w.x + G.off.x, G.w.y + G.off.y, dt); }
}
const gentle = (n = 1) => { R.session.gentle += n; commit('max', (m) => { m.relationship.gentle += n; }, 'gentle'); };

// ------------------------------------------------------------------ reactions
function onTap(tg, w) {
  if (tg.kind === 'max') return tapMax();
  if (tg.kind === 'obj') return tapObj(tg.o);
  if (tg.kind === 'window') return toggleWindow();
  if (tg.kind === 'frame') { commit('room', (r) => { if (Math.abs(r.frame.tilt) > 0.02) r.frame.tilt = 0; }, 'frame'); world.frameSwing = 1; audio.sfx.thud(120, 'paper'); MX.lookPt = { x: world.L.frame.x, y: world.L.frame.y }; MX.lookHold = 1.6; emit('ui:objectInteract', { id: 'frame' }); return; }
  // tapping empty floor: MAX glances toward it, curious
  if (w && MX.act !== 'sleep' && !S.max.sleep.asleep) { MX.lookPt = { x: w.x, y: w.y }; MX.lookHold = 1.4; if (Math.random() < 0.25 && w.y > world.L.laneMin - 20) { spawn('puff', w.x, w.y, { size: 2, grow: 10, life: 0.5, color: '#fff', alpha: 0.35 }); } }
}
export function tapMax() {
  touch(); const now = performance.now(); taps = taps.filter((t) => now - t < 5000); taps.push(now); const n = taps.length;
  R.session.taps++; S.max.relationship.taps++; S.max.lastInteraction = Date.now(); haptic(10); emit('ui:firstTap', {}); MX.lookMode = 'user'; MX.lookHold = 2;
  MX.sq.vy -= 2.2; hop(120);
  if (S.max.sleep.asleep) {
    if (MX.sleepTaps && now - MX.sleepTaps < 6000) { wake('user'); MX.sleepTaps = 0; sayLine('tap_wake', null, { emotion: 'sleepy' }); } else { MX.sleepTaps = now; sayLine('tap_sleepy', null, { silent: false }); MX.emote = { name: 'sleepy', t: 0, dur: 1.2 }; spawn('text', MX.x + 14, MX.y - 62, { glyph: 'z', size: 14, vy: -16, life: 1.6, color: 'rgba(235,235,255,.9)' }); }
    return;
  }
  const v = S.max.mood.valence; const pat = 0.3 + S.max.personality.traits.patience;
  if (n >= 6 + Math.round(pat * 2) || (n >= 4 && v < -0.05)) { emote('annoyed', 2, { squash: 1 }); impulse(-0.07, 0.12); if (n % 3 === 0 || n === 6) sayLine('tap_annoyed'); R.session.rough += 0; if (n > 8) { commit('max', (m) => { m.relationship.trust = clamp(m.relationship.trust - 0.004, 0, 1); }, 'poke'); } return; }
  gentle(n <= 3 ? 1 : 0); impulse(0.05, 0.08); commit('max', (m) => { m.relationship.bond = clamp(m.relationship.bond + 0.004, 0, 1); }, 'tap');
  if (v > 0.12 || stage() >= 1) { emote('happy', 1.6, { hop: 160 }); if (Math.random() < 0.6) sayLine('tap_happy'); if (stage() >= 2 && Math.random() < 0.5) spawn('heart', MX.x + rnd(-8, 8), MX.y - 64, { size: 7, vy: -24, life: 1.6, color: '#ff8a8a' }); }
  else { emote('curious', 1.4, { tilt: 0.25 }); if (Math.random() < 0.5) sayLine('tap_neutral'); }
  audio.sfx.tap();
}
export const pokeMax = tapMax;
function nudge(o, dir) { o.vx = dir * rnd(70, 140); o.vy = -rnd(140, 260); o.air = true; o.surface = 'floor'; }
function tapObj(o) {
  touch(); emit('ui:objectInteract', { id: o.id }); R.objectsMoved = true; MX.lookPt = { x: o.x, y: o.y - 10 }; MX.lookHold = 1.8; haptic(8);
  const dir = Math.sign(o.x - (scene.cam.x)) || 1;
  switch (o.type) {
    case 'lamp': return toggleLamp();
    case 'radio': return toggleRadio();
    case 'plant': o.wob = 1.2; audio.sfx.leaf(); burst('spark', o.x, o.y - 50, 3, () => ({ vx: rnd(-20, 20), vy: rnd(-30, -5), g: 60, size: 1.3, life: 0.8, color: '#9ed08a', add: false })); if (Math.random() < 0.35) sayLine('plant'); return;
    case 'cushion': o.wob = 0.6; burst('puff', o.x, o.y - 14, 4, () => ({ vx: rnd(-30, 30), vy: rnd(-20, -5), size: 3, grow: 8, life: 0.6, color: '#fff', alpha: 0.4 })); return;
    case 'rug': return;
    case 'ball': { nudge(o, dir * (Math.random() < 0.5 ? 1 : -1)); audio.sfx.bounce(300); wantPlay(o); return; }
    case 'shards': o.vx = dir * 40; o.air = false; return;
    default: if (o.def.kind === 'dyn') { if (o.def.r > 8) nudge(o, dir); else { o.vx = dir * 60; } } return;
  }
}
export function toggleLamp() {
  emit('ui:objectInteract', { id: 'lamp' });
  const look = lookAt(currentHour()); const was = lampOn(look); audio.sfx.click(!was); scene.lightDirty = true;
  commit('room', (r) => { r.lamp.on = !was; r.lamp.nightAtSet = look.night > 0.5; }, 'lamp'); world.dirty = true;
  if (!was) { if (look.night > 0.5) { impulse(0.08, -0.03); if (cd('lampsay')) sayLine('lamp_on', null, { emotion: 'calm' }); } } else if (cd('lampsay')) sayLine('lamp_off', null, { emotion: look.night > 0.5 ? 'calm' : 'neutral' });
}
const cdm = {}; const cd = (k, s = 20) => { const n = performance.now() / 1000; if ((cdm[k] || 0) > n) return false; cdm[k] = n + s; return true; };
export function toggleWindow() {
  const open = !S.room.window.open; commit('room', (r) => { r.window.open = open; }, 'window'); audio.sfx.creak(open); world.dirty = true; emit('ui:objectInteract', { id: 'window' });
  MX.lookMode = 'window'; MX.lookHold = 3; emote(open ? 'curious' : 'calm', 1.6); if (cd('winsay', 25)) sayLine(open ? 'window_open' : 'window_close');
}
export function toggleRadio() {
  const on = !S.room.radio.on; commit('room', (r) => { r.radio.on = on; }, 'radio'); audio.sfx.click(on); audio.radioSet(on); impulse(on ? 0.06 : 0, on ? 0.12 : 0);
  if (cd('radiosay', 25)) sayLine(on ? 'radio_on' : 'radio_off', null, { emotion: on ? 'happy' : 'calm' });
}
function wantPlay(ball) {
  if (S.max.sleep.asleep || MX.held || MX.air || MX.surface !== 'floor') return; const v = S.max.mood.valence; if (v < -0.2 && Math.random() < 0.7) return;
  if (Math.random() < 0.45 + S.max.mood.arousal * 0.5) { MX.chaseCount = 0; setAct('play', 12); R.session.plays++; commit('max', (m) => { m.relationship.plays++; }, 'play'); impulse(0.05, 0.1); }
}
function onObjRelease(o, speed) {
  if (o.type === 'ball' && speed > 160) wantPlay(o);
  if (speed < 160) { R.session.moves++; if (o.def.kind === 'furn') { gentle(0); } }
  MX.lookPt = { x: o.x, y: o.y }; MX.lookHold = 1.6; saveSoon();
}
function onThrow({ o, speed }) { R.session.throws++; if (speed > 500 && o.type !== 'ball') { /* flung */ } }
function onBreak({ id, x, y }) {
  R.session.breaks++; haptic([30, 40, 30]); const cols = ['#e8f0f4', '#cfe0e8', '#f7fbff']; for (let i = 0; i < 12; i++) spawn('shard', x, y - 6, { vx: rnd(-110, 110), vy: -rnd(60, 230), g: 900, size: 1.6 + Math.random() * 2.2, life: 1.8, color: pick(cols), rot: rnd(0, 6), vr: rnd(-12, 12), floorY: y + rnd(-2, 4) });
  impulse(-0.2, 0.35); emote('surprised', 1.6, { hop: 200 }); MX.lookPt = { x, y: y - 8 }; MX.lookHold = 3; S.max.relationship.trust = clamp(S.max.relationship.trust - 0.01, 0, 1);
  setTimeout(() => { if (!S.max.sleep.asleep) { sayLine('break', null, { emotion: 'confused' }); } }, 500);
  emit('room:broke', { id });
}
function onLand({ o, speed, x, y, wall }) {
  if (speed > 160 && !wall) burst('puff', x, y - 2, 3, () => ({ vx: rnd(-25, 25), vy: rnd(-16, 0), size: 1.6, grow: 7, life: 0.45, color: '#e8dcc8', alpha: 0.45 }));
  if (speed > 420) haptic(12);
  // objects landing close to MAX startle it
  if (!MX.held && Math.hypot(x - MX.x, y - MX.y) < 70 && speed > 300 && !S.max.sleep.asleep && performance.now() - MX.lastHit > 1200) { emote('surprised', 0.9, { hop: 140 }); impulse(-0.03, 0.12); }
  if (o.type === 'ball' && !wall) { /* ball bounce sparkle off */ }
  saveSoon();
}
let saveT = 0; function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => { saveRoom(); persistMax(); }, 1200); }

// keyboard: desktop and assistive access to the room
function key(e) {
  touch(); audio.unlock();
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapMax(); }
  else if (e.key === 'l' || e.key === 'L') toggleLamp(); else if (e.key === 'w' || e.key === 'W') toggleWindow(); else if (e.key === 'r' || e.key === 'R') toggleRadio();
  else if (e.key === 'b' || e.key === 'B') throwBall();
}
export function throwBall() {
  touch(); const b = getObj('ball'); if (!b || b.type !== 'ball') return; if (S.max.sleep.asleep) wake('toy');
  b.held = false; b.vx = rnd(-240, 240); b.vy = -rnd(300, 500); b.air = true; b.surface = 'floor'; emit('ui:objectInteract', { id: 'ball' }); wantPlay(b);
}
