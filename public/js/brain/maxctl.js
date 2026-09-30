// MAX controller: the creature's body, senses, daily-life behaviour and expressions. 100% local, no network.
import { S, R, commit, emit, listen } from '../core/state.js';
import { clamp, lerp, damp, rnd, pick, TAU, hourFloat } from '../util.js';
import { world, get as getObj, radius as objRadius, landingPlatform } from '../render/world.js';
import { laneToY, yToLane, scaleAt, platformById, WW } from '../render/layout.js';
import { spawn, burst } from '../render/fx.js';
import { tr, stage } from './personality.js';
import { impulse, moodWord } from './mood.js';
import { say as sayCat, t as tt } from '../i18n/index.js';
import { lookAt, currentHour } from './time.js';
import { beamSpot } from '../render/light.js';

const G = 1650;
export const MX = {
  x: 200, y: 500, vx: 0, vy: 0, lane: 500, surface: 'floor', air: false, held: false, onCushion: false, hop: 0, hopV: 0,
  face: 1, faceT: 1, act: 'idle', actT: 0, actDur: 4, target: null, tObj: null, dwell: 0,
  emote: null, fid: null, look: { x: 0, y: 0 }, lookT: { x: 0, y: 0 }, lookMode: 'wander', lookPt: null, nextGlance: 2, nextFid: 6, blinkT: 3, blinkP: -1,
  sq: { x: 0, y: 0, vx: 0, vy: 0 }, walkPh: 0, speed: 0, speech: null, lastSpeech: 0, lastUser: 0, zT: 0, pointer: null, carried: false,
  pose: { sx: 1, sy: 1, lean: 0, face: 1, look: { x: 0, y: 0 }, eyeOpen: 1, eyeH: 1, eyeShape: 'round', brow: 0, mouth: 'smile', mouthOpen: 0, pupil: 1, blush: 0.1, ear: 0.3, earL: 0, earR: 0, tail: 0.4, tailSpeed: 2, walk: 0, arms: 0, armSwing: 0, held: false, y: 0 },
  cool: {}, lastHit: 0, guard: 0, t: 0, nudges: 0, userThrown: 0, lastKick: 0, chaseCount: 0, lastActivityLog: 0,
};
const cd = (k, sec) => { const n = performance.now() / 1000; if ((MX.cool[k] || 0) > n) return false; MX.cool[k] = n + sec; return true; };
const L = () => world.L;
export const sc = () => scaleAt(L(), MX.surface === 'floor' ? MX.y : MX.lane);
export const phaseNow = () => lookAt(currentHour()).phase;
const isNight = () => lookAt(currentHour()).night > 0.6;

export function initMax() {
  const loc = S.max.location; const l = L();
  MX.surface = loc.surface === 'floor' || !platformById(l, loc.surface) ? 'floor' : loc.surface; MX.x = clamp(loc.x, 30, WW - 30);
  MX.y = MX.surface === 'floor' ? laneToY(l, loc.ly ?? 0.55) : platformById(l, MX.surface).y; MX.lane = MX.surface === 'floor' ? MX.y : l.laneMin + 30;
  MX.air = false; if (S.max.sleep.asleep) { setAct('sleep', 9999); snapToCushion(); } else setAct('idle', rnd(2, 4));
  MX.face = MX.faceT = 1; MX.lookMode = 'user'; MX.nextGlance = 3;
}
export function relayoutMax() { const l = L(); if (MX.surface === 'floor') { MX.y = clamp(MX.y, l.laneMin, l.laneMax); MX.lane = MX.y; } else { const p = platformById(l, MX.surface); if (p) MX.y = p.y; } }
export function persistMax() { commit('max', (m) => { m.location = { x: +MX.x.toFixed(1), ly: +yToLane(L(), MX.lane).toFixed(3), surface: MX.surface }; m.activity = MX.act; }, 'max'); }

// ---------------------------------------------------------------- speech
export function sayText(text, { emotion, dur, silent, fromChat } = {}) {
  if (!text) return; MX.speech = { text, t: 0, dur: dur || clamp(1.9 + text.length * 0.06, 2.4, 8) }; MX.lastSpeech = performance.now() / 1000;
  if (emotion) emote(emotion, 1.6); emit('max:speech', { text, emotion, silent, fromChat });
}
export const sayLine = (cat, vars, opts) => { const s = sayCat(cat, vars); if (s) sayText(s, opts); return s; };
export function unsolicited() { // idle chatter is rationed by sociability; quiet by default
  const now = performance.now() / 1000; const gap = lerp(170, 70, tr('sociability'));
  return now - MX.lastSpeech > gap && R.userPresent && !R.chatOpen && !S.max.sleep.asleep && performance.now() - R.lastInput < 150000;
}

// ---------------------------------------------------------------- emotes & expressions
export const EXPR = {
  neutral: { eyeOpen: 1, eyeShape: 'round', brow: 0, mouth: 'smile', pupil: 1, blush: 0.08, ear: 0.3, arms: 0, tail: 0.4, tailSpeed: 2 },
  happy: { eyeOpen: 1, eyeShape: 'happy', brow: 0, mouth: 'cat', pupil: 1, blush: 0.85, ear: 0.55, arms: 0.45, tail: 0.9, tailSpeed: 7 },
  excited: { eyeOpen: 1.05, eyeShape: 'spark', brow: 0, mouth: 'open', mouthOpen: 0.8, pupil: 1.3, blush: 0.7, ear: 0.9, arms: 1, tail: 1.2, tailSpeed: 10 },
  surprised: { eyeOpen: 1.1, eyeShape: 'wide', brow: 0, mouth: 'o', pupil: 0.7, blush: 0, ear: 1, arms: 0.7, tail: 0.1, tailSpeed: 1 },
  annoyed: { eyeOpen: 0.9, eyeShape: 'flat', brow: 0.7, mouth: 'frown', pupil: 0.9, blush: 0, ear: -0.4, arms: 0, tail: 0.25, tailSpeed: 5 },
  confused: { eyeOpen: 1, eyeShape: 'round', brow: -0.5, mouth: 'wavy', pupil: 0.9, blush: 0, ear: 0.15, arms: 0.2, tail: 0.3, tailSpeed: 3 },
  curious: { eyeOpen: 1.05, eyeShape: 'wide', brow: 0, mouth: 'flat', pupil: 1.15, blush: 0, ear: 0.85, arms: 0.1, tail: 0.6, tailSpeed: 3 },
  shy: { eyeOpen: 0.9, eyeShape: 'round', brow: -0.25, mouth: 'smile', pupil: 1, blush: 1, ear: 0.0, arms: 0.3, tail: 0.3, tailSpeed: 2 },
  sleepy: { eyeOpen: 0.85, eyeShape: 'sleepy', brow: 0, mouth: 'flat', pupil: 0.9, blush: 0.12, ear: -0.35, arms: 0, tail: 0.1, tailSpeed: 1 },
  calm: { eyeOpen: 0.95, eyeShape: 'round', brow: 0, mouth: 'smile', pupil: 1.05, blush: 0.1, ear: 0.2, arms: 0, tail: 0.3, tailSpeed: 1.6 },
  cuddle: { eyeOpen: 0, eyeShape: 'happy', brow: 0, mouth: 'cat', pupil: 1, blush: 1, ear: 0.0, arms: 0.9, tail: 0.6, tailSpeed: 4 },
  ouch: { eyeOpen: 0.05, eyeShape: 'closed', brow: 0, mouth: 'open', mouthOpen: 0.3, pupil: 1, blush: 0, ear: -0.2, arms: 0.6, tail: 0.05, tailSpeed: 1 },
  asleep: { eyeOpen: 0, eyeShape: 'closed', brow: 0, mouth: 'flat', pupil: 1, blush: 0.2, ear: -0.5, arms: 0, tail: 0.05, tailSpeed: 0.6 },
  yawn: { eyeOpen: 0, eyeShape: 'closed', brow: 0, mouth: 'yawn', mouthOpen: 1, pupil: 1, blush: 0.1, ear: -0.2, arms: 1, tail: 0.1, tailSpeed: 1 },
};
const MOODMAP = { sleepy: 'sleepy', calm: 'calm', content: 'neutral', playful: 'happy', excited: 'excited', grumpy: 'annoyed', curious: 'curious', cozy: 'sleepy', uneasy: 'confused' };
export function emote(name, dur = 1.5, opts = {}) {
  if (!EXPR[name]) name = 'neutral';
  if (S.max.sleep.asleep && name !== 'asleep' && !opts.force) return;
  MX.emote = { name, t: 0, dur, ...opts };
  if (opts.hop) hop(opts.hop); if (opts.squash) MX.sq.vy -= opts.squash;
}
export function hop(v = 200) { if (!MX.air && MX.hop <= 0.01) { MX.hopV = v; } }
function baseExpr() {
  if (S.max.sleep.asleep) return EXPR.asleep;
  if (MX.act === 'held') return MX.heldExpr || EXPR.surprised;
  if (MX.fid && MX.fid.name === 'yawn') return EXPR.yawn;
  let e = EXPR[MOODMAP[moodWord()] || 'neutral'];
  if (MX.act === 'sleepish') e = EXPR.sleepy;
  return e;
}

export function setAct(act, dur = 5, extra = {}) { MX.act = act; MX.actT = 0; MX.actDur = dur; Object.assign(MX, { tObj: null }, extra); S.max.lastActivity = { kind: act, ts: Date.now() }; }
export const activityLabel = () => ({ idle: 'resting quietly', walk: 'wandering', sit: 'sitting', sleep: 'sleeping', play: 'playing with the ball', inspect: 'looking at something', window: 'watching the window', beam: 'sitting in a patch of sunlight', dance: 'swaying to the radio', held: 'being held', fall: 'falling', perch: 'perched up high', user: 'coming to say hi' }[MX.act] || 'idle');

// ---------------------------------------------------------------- navigation & choices
function randomFloor() { const l = L(); return { x: rnd(50, 350), y: laneToY(l, rnd(0.08, 0.95)) }; }
function walkTo(x, y, purpose, extra) { MX.target = { x: clamp(x, 28, WW - 28), y: clamp(y, L().laneMin + 4, L().laneMax), purpose, ...extra }; setAct('walk', 30); }
const cushion = () => getObj('cushion');
function snapToCushion() { const c = cushion(); if (c) { MX.x = c.x; MX.y = c.y - 2; MX.lane = c.y - 2; MX.onCushion = true; MX.surface = 'floor'; } }

function shouldSleep() {
  const h = currentHour(); const e = S.max.energy; const late = h >= 23 || h < 5;
  if (performance.now() - R.lastInput < 25000 && e > 0.12) return false;
  return e < 0.2 || (isNight() && late && e < 0.72) || (isNight() && e < 0.4);
}
function shouldWake() { const e = S.max.energy; return e > 0.92 || (!isNight() && e > 0.6); }
export function fallAsleep() { S.max.sleep = { asleep: true, since: Date.now() }; setAct('sleep', 9999); persistMax(); }
export function wake(why = 'natural') {
  if (!S.max.sleep.asleep) return; S.max.sleep = { asleep: false, since: 0 }; MX.onCushion = MX.onCushion && !!cushion(); setAct('idle', 3); MX.fid = { name: 'yawn', t: 0, dur: 1.8 };
  if (why === 'user') { if (tr('patience') < 0.5) impulse(-0.12, 0.2); } else if (cd('wake', 60)) sayLine('wake', null, { emotion: 'calm' });
}

function decide() {
  const e = S.max.energy, m = S.max.mood, l = L();
  if (MX.surface !== 'floor') { setAct('perch', rnd(3, 8)); return; }
  if (S.max.sleep.asleep) { if (shouldWake()) wake(); return; }
  if (shouldSleep()) { const c = cushion(); sayLine('sleepy_go'); MX.sleepAfter = true; if (c && Math.abs(c.x - MX.x) < 400) { walkTo(c.x, c.y - 2, 'cushion-sleep'); return; } fallAsleep(); return; }
  const ball = getObj('ball'); const ballFree = ball && !ball.held && ball.type === 'ball' && ball.surface === 'floor';
  const rain = R.weather === 'rain'; const ph = phaseNow();
  const W = {
    still: 2.4 + (1 - m.arousal) * 3 + (1 - e) * 2.5,
    wander: (0.4 + e * 2.2) * (0.5 + tr('curiosity')),
    play: ballFree ? (m.arousal * 3 + tr('energy') * 2.5 + Math.max(0, m.valence) * 2) * (cd2('play') ? 1 : 0.1) : 0,
    window: (0.7 + tr('curiosity') * 1.6) * (rain || ph === 'dawn' || ph === 'evening' || isNight() ? 1.7 : 0.8),
    inspect: (0.4 + tr('curiosity') * 2.4) * (R.objectsMoved ? 1.5 : 1),
    cushion: cushion() ? (1 - e) * 4 + (isNight() ? 1.2 : 0.2) : 0,
    beam: beamSpot(lookAt(currentHour()), l) && !rain ? 2.2 + (1 - e) : 0,
    radio: S.room.radio.on ? 6 : 0,
    user: (R.userPresent && performance.now() - R.lastInput < 120000 ? 0.4 + tr('sociability') * 2.2 : 0.15) * (cd2('user') ? 1 : 0.05),
  };
  let tot = 0; for (const k in W) tot += W[k]; let r = Math.random() * tot, pickK = 'still';
  for (const k in W) { r -= W[k]; if (r <= 0) { pickK = k; break; } }
  switch (pickK) {
    case 'still': { if (Math.random() < 0.55) setAct('sit', rnd(7, 18)); else setAct('idle', rnd(5, 12)); break; }
    case 'wander': { const p = randomFloor(); walkTo(p.x, p.y, 'wander'); break; }
    case 'play': { walkTo(ball.x - Math.sign(ball.x - MX.x || 1) * 26, ball.y, 'ball'); MX.chaseCount = 0; break; }
    case 'window': { walkTo(l.win.x + l.win.w / 2 + rnd(-30, 30), l.laneMin + 8, 'window'); break; }
    case 'inspect': { const cand = world.list.filter((o) => o.def.kind === 'dyn' && o.surface === 'floor' && !o.held); if (!cand.length) { setAct('idle', 4); break; } const o = pick(cand); walkTo(o.x - Math.sign(o.x - MX.x || 1) * 30, o.y, 'inspect', { obj: o.id }); break; }
    case 'cushion': { const c = cushion(); walkTo(c.x, c.y - 2, 'cushion'); break; }
    case 'beam': { const b = beamSpot(lookAt(currentHour()), l); walkTo(b.x, b.y, 'beam'); break; }
    case 'radio': { setAct('dance', rnd(10, 22)); break; }
    case 'user': { walkTo(rnd(150, 250), laneToY(l, rnd(0.78, 0.95)), 'user'); break; }
  }
}
const cdMap = {}; function cd2(k) { const n = performance.now() / 1000; if ((cdMap[k] || 0) > n) return false; cdMap[k] = n + { play: 90, user: 60 }[k]; return true; }

function onArrive() {
  const tg0 = MX.target; const p = tg0?.purpose; MX.target = null;
  switch (p) {
    case 'cushion-sleep': snapToCushion(); fallAsleep(); break;
    case 'cushion': snapToCushion(); setAct('sit', rnd(14, 34)); break;
    case 'window': setAct('window', rnd(9, 22)); MX.lookMode = 'window'; break;
    case 'beam': setAct('beam', rnd(14, 34)); break;
    case 'ball': kick(); break;
    case 'inspect': setAct('inspect', rnd(3, 6), { tObj: tg0?.obj }); MX.inspected = false; break;
    case 'user': setAct('idle', rnd(4, 8)); MX.lookMode = 'user'; MX.lookHold = 4; if (Math.random() < 0.5) emote('happy', 1.2); break;
    default: setAct(Math.random() < 0.4 ? 'sit' : 'idle', rnd(3, 9));
  }
}
function kick() {
  const ball = getObj('ball'); if (!ball || ball.held || ball.type !== 'ball') { setAct('idle', 2); return; }
  const dir = Math.sign(ball.x - MX.x) || (Math.random() < 0.5 ? -1 : 1); MX.faceT = dir; const toward = clamp((200 - ball.x) / 200, -1, 1);
  ball.vx = dir * rnd(130, 260) + toward * 40; ball.vy = -rnd(150, 330); ball.air = true; ball.surface = 'floor'; ball.lane = ball.lane; ball.held = false;
  emote('excited', 0.9, { hop: 240 }); MX.lastKick = performance.now(); emit('max:kick', { obj: ball }); MX.chaseCount++;
  if (MX.chaseCount < 2 + Math.floor(tr('energy') * 4)) { setAct('play', 9, { chase: true }); } else { setAct('idle', 4); impulse(0.12, 0.05); if (cd('ballsay', 30)) sayLine('play_ball', null, { emotion: 'happy' }); }
}

// ---------------------------------------------------------------- held / dragged / falling
export function grab() { MX.held = true; MX.air = false; MX.onCushion = false; MX.carried = false; setAct('held', 9999); MX.surface = 'floor'; MX.heldT = 0; MX.heldExpr = EXPR.surprised; MX.vx = MX.vy = 0; if (S.max.sleep.asleep) wake('user'); }
export function dragTo(x, y, dt) {
  const l = L(); const nx = clamp(x, 26, WW - 26), ny = clamp(y, 70, l.laneMax + 30);
  MX.vx = (nx - MX.x) / Math.max(dt, 0.008); MX.vy = (ny - MX.y) / Math.max(dt, 0.008); MX.x = nx; MX.y = ny; if (ny >= l.laneMin) MX.lane = Math.min(ny, l.laneMax);
}
export function release(vx, vy) {
  MX.held = false; const l = L(); const v = Math.hypot(vx, vy); const k = v > 700 ? 700 / v : 1; MX.vx = vx * k * 0.8; MX.vy = vy * k * 0.8; MX.air = true; MX.surface = 'floor'; MX.lane = Math.max(MX.lane, l.laneMin);
  MX.fallFrom = MX.y; MX.thrownSpeed = Math.hypot(MX.vx, MX.vy); setAct('fall', 99); MX.heldExpr = null;
}
function updateAir(dt) {
  const l = L(); const prev = MX.y; MX.vy += G * dt; MX.x += MX.vx * dt; MX.y += MX.vy * dt; MX.vx *= Math.exp(-dt * 0.4);
  if (MX.x < 30) { MX.x = 30; MX.vx = Math.abs(MX.vx) * 0.4; } if (MX.x > WW - 30) { MX.x = WW - 30; MX.vx = -Math.abs(MX.vx) * 0.4; }
  if (MX.y < 50) { MX.y = 50; MX.vy = Math.abs(MX.vy) * 0.3; }
  if (MX.vy > 0) {
    const p = landingPlatform(MX.x, prev, MX.y); const c = cushion();
    if (p) landed(p); else if (MX.y >= MX.lane) {
      MX.y = MX.lane; landed(null);
    }
  }
}
function landed(p) {
  const v = MX.vy; MX.air = false; MX.vy = 0; const hard = v > 560 || (MX.thrownSpeed > 520); const medium = v > 300;
  if (p) { MX.surface = p.id; MX.y = p.y; MX.lane = p.id === 'shelf' ? L().laneMin + 14 : L().table.laneY + 26; } else { MX.surface = 'floor'; MX.y = MX.lane; }
  MX.vx *= 0.2; MX.sq.vy = -clamp(v / 900, 0.1, 0.7) * 3; emit('max:land', { v, hard });
  const c = cushion(); MX.onCushion = false;
  if (c && !p && Math.abs(c.x - MX.x) < 34 && Math.abs(c.y - MX.y) < 18) { snapToCushion(); }
  if (hard) { emote('ouch', 1.2); impulse(-0.22, 0.25); R.session.rough++; S.max.relationship.rough++; commit('max', (m) => { m.relationship.trust = clamp(m.relationship.trust - 0.04, 0, 1); }, 'rough'); if (cd('dropsay', 8)) sayLine('drop_rough', null, { emotion: 'surprised' }); }
  else if (medium) { emote('surprised', 0.9); impulse(-0.04, 0.1); if (cd('dropsay', 8)) sayLine('drop_rough'); }
  else { emote('calm', 1); if (cd('dropsoft', 10)) sayLine('drop_soft', null, { emotion: 'calm' }); }
  MX.thrownSpeed = 0; if (S.max.sleep.asleep && v > 350) wake('user');
  if (S.max.sleep.asleep) setAct('sleep', 9999); else setAct(p ? 'perch' : 'idle', p ? rnd(3, 7) : 2.5);
}

// ---------------------------------------------------------------- per-frame update
function lookTargetFor() {
  const l = L(); const m = MX;
  const toPt = (x, y) => ({ x: clamp((x - m.x) / 90, -1, 1), y: clamp((y - (m.y - 28)) / 90, -1, 1) });
  if (S.max.sleep.asleep) return { x: 0, y: 0.3 };
  if (m.pointer && performance.now() - m.pointer.t < 1800 && m.lookMode !== 'window') return toPt(m.pointer.x, m.pointer.y);
  if (m.lookMode === 'user') return { x: 0, y: 0.45 };
  if (m.lookMode === 'window') return toPt(l.win.x + l.win.w / 2, l.win.y + l.win.h * 0.4);
  if (m.lookPt) return toPt(m.lookPt.x, m.lookPt.y);
  return m.lookT;
}
function glance(dt) {
  MX.nextGlance -= dt; if (MX.lookHold > 0) { MX.lookHold -= dt; return; }
  if (MX.nextGlance > 0) return; MX.nextGlance = rnd(1.4, 5) * (1 + (1 - S.max.energy));
  const r = Math.random();
  if (MX.lookMode === 'user' && r < 0.6) { MX.lookMode = 'wander'; }
  if (r < 0.14) { MX.lookMode = 'user'; MX.lookHold = rnd(1.2, 2.6); return; }
  MX.lookMode = 'wander'; MX.lookPt = null;
  if (r < 0.45) { const o = pick(world.list.filter((x) => x.def.kind === 'dyn')); if (o) MX.lookPt = { x: o.x, y: o.y - 10 }; }
  else if (r < 0.6) MX.lookPt = { x: L().win.x + L().win.w / 2, y: L().win.y + 40 };
  else MX.lookT = { x: rnd(-1, 1), y: rnd(-0.6, 0.8) };
}

export function updateMax(dt) {
  const l = L(); MX.t += dt; const m = MX; const s = sc();
  // ---- locomotion / behaviours
  if (m.held) { m.actT += dt; m.heldT += dt; }
  else if (m.air) updateAir(dt);
  else {
    m.actT += dt; m.speed = 0;
    if (m.onCushion) { const c = cushion(); if (c) { m.x = c.x; m.y = c.y - 2; m.lane = m.y; } else m.onCushion = false; }
    switch (m.act) {
      case 'walk': {
        const tg = m.target; if (!tg) { setAct('idle', 2); break; }
        if (tg.purpose === 'ball') { const b = getObj('ball'); if (b && b.type === 'ball') { tg.x = b.x - Math.sign(b.x - m.x || 1) * 24; tg.y = clamp(b.y, l.laneMin + 4, l.laneMax); } }
        const dx = tg.x - m.x, dy = tg.y - m.y; const d = Math.hypot(dx, dy); const sp = (30 + S.max.energy * 30) * s * (0.8 + S.max.mood.arousal * 0.5) * (m.run ? 1.8 : 1);
        if (d < 5 || m.actT > 35) { onArrive(); break; }
        m.x += (dx / d) * sp * dt; m.y += (dy / d) * sp * 0.7 * dt; m.lane = m.y; m.speed = sp; if (Math.abs(dx) > 5) m.faceT = Math.sign(dx); m.walkPh += sp * dt * 0.16;
        m.onCushion = false; break;
      }
      case 'play': { // chase the ball between kicks
        const b = getObj('ball'); if (!b || b.type !== 'ball' || b.held) { setAct('idle', 2); break; }
        const tx = b.x - Math.sign(b.vx || (b.x - m.x) || 1) * 18; const dx = tx - m.x, dy = clamp(b.y, l.laneMin + 4, l.laneMax) - m.y; const d = Math.hypot(dx, dy);
        const sp = (70 + S.max.energy * 50) * s; if (d > 8) { m.x += (dx / d) * sp * dt; m.y += (dy / d) * sp * 0.7 * dt; m.lane = m.y; m.speed = sp; m.faceT = Math.sign(dx) || m.faceT; m.walkPh += sp * dt * 0.16; }
        const near = Math.hypot(b.x - m.x, b.y - m.y) < 32 && Math.abs(b.vx) < 90 && !b.air; if (near && performance.now() - m.lastKick > 900) kick();
        if (m.actT > 12) setAct('idle', 3); break;
      }
      case 'perch': { if (m.actT > m.actDur) { const side = m.x < 200 ? -1 : 1; m.vx = side * rnd(60, 120); m.vy = -rnd(160, 260); m.air = true; m.surface = 'floor'; m.thrownSpeed = 0; m.hopLand = true; emote('excited', 0.8); setAct('fall', 99); } break; }
      case 'sleep': { m.zT -= dt; if (m.zT <= 0) { m.zT = rnd(1.8, 2.6); spawn('text', m.x + 16 * m.face, m.y - 62 * s, { glyph: 'z', size: 11 + Math.random() * 5, vx: 6, vy: -14, life: 2.6, color: 'rgba(235,235,255,.85)' }); } if (shouldWake() && m.actT > 20) wake(); break; }
      case 'inspect': { const o = m.tObj ? getObj(m.tObj) : null; if (o) { m.lookPt = { x: o.x, y: o.y - 8 }; m.faceT = Math.sign(o.x - m.x) || m.faceT; if (m.actT > 1.5 && !m.inspected) { m.inspected = true; emote('curious', 2, { tilt: 0.25 }); if (Math.random() < 0.35 && o.surface === 'floor' && o.def.mass < 2 && !o.def.noCollide) { o.vx = Math.sign(o.x - m.x) * 70; emit('max:nudge', { obj: o }); } } } if (m.actT > m.actDur) { m.inspected = false; m.lookPt = null; setAct('idle', rnd(2, 5)); } break; }
      case 'dance': if (!S.room.radio.on || m.actT > m.actDur) setAct('idle', 3); break;
      case 'window': case 'beam': case 'sit': case 'idle': default:
        if (m.act === 'idle' || m.act === 'sit' || m.act === 'window' || m.act === 'beam') { if (m.actT > m.actDur) { m.lookMode = 'wander'; decide(); } }
    }
    // fidgets & idle chatter: stillness is allowed, fidgets are rare
    if (m.act === 'idle' || m.act === 'sit' || m.act === 'window' || m.act === 'beam') {
      m.nextFid -= dt;
      if (m.nextFid <= 0 && !m.fid) { m.nextFid = rnd(7, 20); const r = Math.random(), e = S.max.energy; const f = e < 0.4 && r < 0.5 ? 'yawn' : r < 0.45 ? 'earflick' : r < 0.7 ? 'shake' : r < 0.85 ? 'stretch' : 'hum'; m.fid = { name: f, t: 0, dur: f === 'yawn' ? 2.2 : f === 'hum' ? 3 : 1.2 }; }
      if (m.act === 'window' && R.weather === 'rain' && m.actT > 4 && cd('rainsay', 120) && unsolicited()) sayLine('idle_rain');
      if (m.act === 'beam' && m.actT > 5 && cd('beamsay', 160) && unsolicited()) sayLine('idle_sun', null, { emotion: 'calm' });
      if (m.actT > 6 && m.act !== 'sleep' && unsolicited() && cd('idlesay', 25)) { const c = isNight() ? 'idle_night' : Math.random() < 0.3 ? 'idle_curious' : 'idle_day'; if (Math.random() < 0.6) sayLine(c); }
    }
    // body collisions with objects: pushing & getting hit
    collideObjects(dt, s);
  }
  if (!m.air && m.surface !== 'floor') { const p = platformById(l, m.surface); m.y = p.y; m.x = clamp(m.x, p.x0 + 14, p.x1 - 14); }
  else if (!m.air) { m.y = clamp(m.y, l.laneMin, l.laneMax + (m.held ? 30 : 0)); m.x = clamp(m.x, 26, WW - 26); }
  // hop (visual z)
  if (m.hop > 0 || m.hopV > 0) { m.hopV -= 900 * dt; m.hop += m.hopV * dt; if (m.hop <= 0) { m.hop = 0; if (m.hopV < -80) m.sq.vy = -2; m.hopV = 0; } }
  // passive mood: sleeping accumulates, etc. handled in mood module
  updatePose(dt, s);
  if (m.speech) { m.speech.t += dt; if (m.speech.t > m.speech.dur) m.speech = null; }
  if (m.emote) { m.emote.t += dt; if (m.emote.t > m.emote.dur) m.emote = null; }
  if (m.fid) { m.fid.t += dt; if (m.fid.t > m.fid.dur) m.fid = null; if (m.fid && m.fid.name === 'hum' && Math.random() < dt * 1.3) spawn('text', m.x + rnd(-14, 14), m.y - 68 * s, { glyph: '♪', size: 12, vy: -22, vx: rnd(-8, 8), life: 1.8, color: '#ffd9a0' }); }
  if (m.guard > 0) m.guard -= dt;
}

function collideObjects(dt, s) {
  const m = MX; const cy = m.y - 22 * s, r = 22 * s;
  for (const o of world.list) {
    if (o.def.kind !== 'dyn' || o.held || o.def.noCollide) continue; const or = objRadius(o); const oy = o.y - or;
    const dx = o.x - m.x, dy = oy - cy; const d = Math.hypot(dx, dy); if (d >= r + or || d < 0.01) continue;
    if (!o.air && Math.abs(o.y - m.y) > 26) continue;
    const speed = Math.hypot(o.vx, o.vy);
    if (o.air && speed > 170 && performance.now() - m.lastHit > 900 && o.lastHitMax !== m.t) {
      m.lastHit = performance.now(); const ball = o.type === 'ball'; o.vx = -o.vx * 0.5 + Math.sign(dx) * 40; o.vy = -Math.abs(o.vy) * 0.5 - 60;
      if (ball) { emote('surprised', 0.6, { hop: 160 }); impulse(0.04, 0.1); if (cd('hitsay', 10)) sayLine('play_ball', null, { emotion: 'happy' }); } else { emote(speed > 380 ? 'ouch' : 'surprised', 1, { squash: 2 }); impulse(-0.1, 0.18); if (cd('hitsay', 8)) sayLine('hit', null, { emotion: 'annoyed' }); R.session.rough++; }
      emit('max:hit', { obj: o, speed }); burst('puff', m.x, cy, 4, () => ({ vx: rnd(-30, 30), vy: rnd(-40, 0), size: 2, grow: 6, life: 0.4, color: '#fff', alpha: 0.5 }));
    } else if (!o.air && m.speed > 10 && o.def.mass < 3) { o.vx += Math.sign(dx) * 40 * dt * 10; } else if (!o.air) { o.x += Math.sign(dx) * 0.6; }
  }
}

function updatePose(dt, s) {
  const m = MX, p = m.pose; const t = m.t; const asleep = S.max.sleep.asleep;
  const base = baseExpr(); const em = m.emote ? EXPR[m.emote.name] : null; const tgt = { ...EXPR.neutral, ...base, ...(em || {}) };
  const k = 9;
  for (const key of ['eyeOpen', 'brow', 'pupil', 'blush', 'ear', 'arms', 'tail', 'tailSpeed', 'mouthOpen']) p[key] = damp(p[key], tgt[key] ?? 0, k, dt);
  p.eyeShape = tgt.eyeShape; p.mouth = tgt.mouth;
  // blink
  m.blinkT -= dt; if (m.blinkT <= 0 && m.blinkP < 0 && !asleep) { m.blinkP = 0; m.blinkT = rnd(2.2, 6.5); }
  let blink = 1; if (m.blinkP >= 0) { m.blinkP += dt / 0.16; blink = Math.abs(1 - m.blinkP * 2) ; if (m.blinkP >= 1) { m.blinkP = -1; blink = 1; } }
  p.eyeH = blink;
  // facing & looking
  m.face = damp(m.face, m.faceT, 8, dt); p.face = m.face;
  const lt = lookTargetFor(); m.look.x = damp(m.look.x, lt.x, 11, dt); m.look.y = damp(m.look.y, lt.y, 11, dt); p.look = m.look;
  if (!m.held && !m.air && m.lookMode !== 'wander' && Math.abs(lt.x) > 0.5 && m.act !== 'walk' && !asleep) m.faceT = Math.sign(lt.x) * 0.6 + (m.faceT > 0 ? 0.4 : -0.4) * 0.3;
  // body
  const breath = Math.sin(t * (asleep ? 1.2 : 1.8 + S.max.mood.arousal)) * (asleep ? 0.03 : 0.013);
  let sx = 1 - breath * 0.5, sy = 1 + breath, lean = 0, yoff = 0, walk = 0, arms = p.arms, earL = 0, earR = 0, tilt = m.emote?.tilt || 0;
  if (m.act === 'sit' || m.act === 'window' || m.act === 'beam' || m.act === 'idle' && S.max.energy < 0.3) { sy *= 0.93; sx *= 1.03; }
  if (asleep) { sy *= 0.8; sx *= 1.12; lean = 0.08 * m.face; yoff = 1; }
  if (m.act === 'walk' || m.act === 'play') { walk = m.walkPh; yoff -= Math.abs(Math.sin(m.walkPh)) * 2.6 * s; lean = m.faceT * 0.06 * (m.speed > 55 ? 2 : 1); sx *= 1 + Math.sin(m.walkPh * 2) * 0.012; }
  if (m.act === 'dance') { const ph = t * TAU / 1.33; lean = Math.sin(ph) * 0.12; yoff -= Math.abs(Math.sin(ph)) * 3; arms = 0.5 + Math.sin(ph) * 0.4; walk = Math.sin(ph) * 1.5; }
  if (m.act === 'held') { sy *= 1.08; sx *= 0.94; lean = clamp(-m.vx * 0.0006, -0.3, 0.3) + Math.sin(t * 6) * (m.emote?.name === 'annoyed' ? 0.12 : 0.01); arms = 0.9; walk = Math.sin(t * 5) * 0.6; p.held = true; } else p.held = false;
  if (m.air) { sy *= 1 + clamp(Math.abs(m.vy) * 0.0004, 0, 0.14); sx *= 1 - clamp(Math.abs(m.vy) * 0.0002, 0, 0.07); arms = 0.9; lean = clamp(m.vx * 0.0008, -0.3, 0.3); }
  if (m.fid) { const f = m.fid, u = f.t / f.dur, w = Math.sin(u * Math.PI);
    if (f.name === 'stretch') { sy *= 1 + w * 0.12; sx *= 1 - w * 0.06; arms = Math.max(arms, w); }
    else if (f.name === 'yawn') { sy *= 1 + w * 0.08; arms = Math.max(arms, w); p.mouthOpen = w; }
    else if (f.name === 'shake') { lean += Math.sin(u * 28) * 0.07 * (1 - u); earL = Math.sin(u * 30) * 0.3; earR = -earL; }
    else if (f.name === 'earflick') { if (f.side === undefined) f.side = Math.random() < 0.5 ? 0 : 1; const v = Math.sin(u * 22) * 0.45 * (1 - u); if (f.side) earR = v; else earL = v; } }
  if (m.emote?.name === 'excited' || m.emote?.name === 'happy') { lean += Math.sin(t * 12) * 0.035; }
  if (m.emote?.name === 'annoyed') lean += Math.sin(t * 20) * 0.015;
  // squash spring
  m.sq.vy += (-m.sq.y * 220 - m.sq.vy * 14) * dt; m.sq.y += m.sq.vy * dt; m.sq.vx = -m.sq.vy * 0.5; m.sq.x = -m.sq.y * 0.5;
  p.sx = sx * (1 + m.sq.x * 0.3); p.sy = sy * (1 + m.sq.y * 0.3); p.lean = lean + tilt * 0.5 * Math.sin(Math.min(1, (m.emote?.t || 0) / 0.3) * Math.PI * 0.5); p.walk = walk; p.arms = arms; p.earL = earL; p.earR = earR; p.y = yoff;
}
/** whole-body "sort" helper for the renderer */
export function sortKeyMax() { if (MX.held) return 9998; if (MX.onCushion) { const c = cushion(); return c ? c.y + 1 : MX.y; } if (MX.surface !== 'floor' && !MX.air) return platformById(L(), MX.surface).sortY + 0.3; return MX.air ? Math.max(MX.lane, MX.y) : MX.y; }
