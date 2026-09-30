// Procedural audio (WebAudio): ambience that follows time/weather, object sounds, MAX's little voice, radio music.
// Nothing is downloaded; nothing plays before a user gesture; everything respects the Sound settings.
import { S, R, listen } from './core/state.js';
import { rnd, pick, clamp, mulberry } from './util.js';

let ctx = null, master, bus = {}, noiseBuf = null, amb = null, started = false;
const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic
export const active = () => !!ctx && S.user.caps.sound && ctx.state !== 'closed';

export function unlock() {
  if (!S.user.caps.sound) return;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    master = ctx.createGain(); const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; master.connect(comp); comp.connect(ctx.destination);
    for (const k of ['amb', 'sfx', 'voice', 'music']) { bus[k] = ctx.createGain(); bus[k].connect(master); }
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); let b0 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.98 * b0 + 0.02 * w; d[i] = b0 * 3.5 + w * 0.15; }
    buildAmbience(); applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume();
}
export function applyVolumes() {
  if (!ctx) return; const U = S.user.sound; const on = S.user.caps.sound && !U.muted;
  master.gain.setTargetAtTime(on ? clamp(U.volume, 0, 1) : 0, ctx.currentTime, 0.05);
  bus.amb.gain.value = U.ambience ? 0.9 : 0; bus.voice.gain.value = U.voice ? 0.7 : 0; bus.music.gain.value = U.music ? 0.8 : 0; bus.sfx.gain.value = 1;
}
export function suspend(v) { if (!ctx) return; if (v) ctx.suspend(); else if (S.user.caps.sound) ctx.resume(); }

function noiseSrc(loop = true) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = loop; s.playbackRate.value = 0.8 + Math.random() * 0.4; return s; }
function buildAmbience() {
  const mk = (type, f, q) => { const s = noiseSrc(); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(bus.amb); s.start(); return { g, fl }; };
  amb = { room: mk('lowpass', 260, 0.5), wind: mk('bandpass', 520, 0.6), rain: mk('highpass', 2400, 0.4), cricketOn: 0, nextBird: 0, nextCricket: 0 };
  amb.room.g.gain.value = 0.05; started = true;
}
/** called ~1/s with the current look, weather and window state */
export function setAmbience(look, weather, windowOpen) {
  if (!ctx || !amb) return; const t = ctx.currentTime;
  amb.room.g.gain.setTargetAtTime(0.045 + look.night * 0.02, t, 1.2);
  amb.wind.g.gain.setTargetAtTime((windowOpen ? 0.05 : 0.008) + (weather === 'rain' ? 0.015 : 0), t, 1);
  amb.rain.g.gain.setTargetAtTime(weather === 'rain' ? (windowOpen ? 0.05 : 0.02) : 0, t, 1.5);
  amb.day = look.sunA * (1 - (weather === 'rain' ? 1 : 0)); amb.night = look.night; amb.open = windowOpen;
}
export function tickAmbience(dt) { // sparse, random events: birds by day, crickets at night
  if (!ctx || !amb || !S.user.sound.ambience) return; const now = ctx.currentTime;
  if (amb.day > 0.35 && now > amb.nextBird) { amb.nextBird = now + rnd(3, 11) / (amb.open ? 1.6 : 1); chirp(rnd(2600, 4200), rnd(2, 5), amb.open ? 0.05 : 0.014, bus.amb); }
  if (amb.night > 0.5 && now > amb.nextCricket) { amb.nextCricket = now + rnd(0.9, 2.2); const n = 3; for (let i = 0; i < n; i++) tone(4300 + Math.random() * 100, 'sine', now + i * 0.07, 0.04, (amb.open ? 0.02 : 0.006), bus.amb, 0.004); }
}

// ---------- primitives ----------
function tone(freq, type, at, dur, vol, out, attack = 0.005, slide = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, at); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), at + dur);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(g); g.connect(out || bus.sfx); o.start(at); o.stop(at + dur + 0.05);
}
function burst(dur, vol, type, f, q, out, at = ctx.currentTime) {
  const s = noiseSrc(false); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 1; const g = ctx.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); s.connect(fl); fl.connect(g); g.connect(out || bus.sfx); s.start(at, Math.random()); s.stop(at + dur + 0.05);
}
function chirp(f, n, vol, out) { const t = ctx.currentTime; for (let i = 0; i < n; i++) tone(f * (1 + Math.sin(i) * 0.12), 'sine', t + i * 0.09, 0.07, vol, out, 0.006, 1.3 + (i % 2) * -0.6); }

// ---------- object & interaction sounds ----------
const ok = () => active() && ctx.state === 'running';
export const sfx = {
  thud(speed = 300, kind = 'wood') { if (!ok()) return; const v = clamp(speed / 700, 0.08, 1); const t = ctx.currentTime; tone(kind === 'paper' ? 160 : 110, 'sine', t, 0.16, 0.5 * v, bus.sfx, 0.002, 0.5); burst(0.08, 0.3 * v, 'lowpass', kind === 'paper' ? 900 : 600, 1, bus.sfx); },
  bounce(speed = 300) { if (!ok()) return; const v = clamp(speed / 600, 0.1, 1); tone(240 + 160 * v, 'sine', ctx.currentTime, 0.22, 0.35 * v, bus.sfx, 0.002, 0.45); },
  glass() { if (!ok()) return; const t = ctx.currentTime; burst(0.35, 0.5, 'highpass', 3500, 0.8, bus.sfx); for (let i = 0; i < 7; i++) tone(rnd(2500, 6500), 'triangle', t + i * 0.03 + Math.random() * 0.03, 0.22, 0.12, bus.sfx, 0.001, 0.8); tone(180, 'sine', t, 0.12, 0.3, bus.sfx, 0.001, 0.5); },
  click(on = true) { if (!ok()) return; const t = ctx.currentTime; tone(on ? 1500 : 1000, 'square', t, 0.03, 0.08, bus.sfx, 0.001); tone(on ? 900 : 600, 'square', t + 0.03, 0.04, 0.06, bus.sfx, 0.001); },
  creak(open) { if (!ok()) return; const t = ctx.currentTime; tone(open ? 220 : 340, 'sawtooth', t, 0.35, 0.05, bus.sfx, 0.05, open ? 1.5 : 0.6); burst(0.4, 0.05, 'bandpass', 700, 2, bus.sfx); },
  leaf() { if (!ok()) return; burst(0.3, 0.14, 'bandpass', 3200, 0.6, bus.sfx); },
  step() { if (!ok()) return; tone(rnd(300, 380), 'sine', ctx.currentTime, 0.05, 0.05, bus.sfx, 0.002, 0.6); },
  whoosh(speed = 500) { if (!ok()) return; const v = clamp(speed / 900, 0.1, 0.7); burst(0.25, 0.14 * v, 'bandpass', 900 + speed, 0.8, bus.sfx); },
  pop() { if (!ok()) return; tone(520, 'sine', ctx.currentTime, 0.1, 0.22, bus.sfx, 0.002, 1.8); },
  rare() { if (!ok()) return; const t = ctx.currentTime; [0, 4, 7, 11, 14].forEach((s, i) => tone(330 * Math.pow(2, s / 12), 'sine', t + i * 0.16, 2.6, 0.09, bus.music, 0.3)); tone(110, 'sine', t, 3, 0.12, bus.music, 0.5); },
  chime() { if (!ok()) return; const t = ctx.currentTime; tone(880, 'sine', t, 0.6, 0.12, bus.sfx, 0.004); tone(1320, 'sine', t + 0.12, 0.8, 0.09, bus.sfx, 0.004); },
  tap() { if (!ok()) return; tone(440, 'sine', ctx.currentTime, 0.05, 0.05, bus.sfx, 0.002, 1.3); },
};

// ---------- MAX's voice: short, pitched blips, never real words ----------
const EMO = { happy: [620, 1.4, 'sine'], excited: [740, 1.6, 'triangle'], curious: [560, 1.25, 'sine'], calm: [430, 1.05, 'sine'], sleepy: [300, 0.8, 'sine'], annoyed: [360, 0.7, 'sawtooth'], confused: [480, 0.95, 'triangle'], surprised: [860, 1.7, 'triangle'], shy: [520, 1.1, 'sine'], neutral: [480, 1.15, 'sine'] };
export function voice(emotion = 'neutral', text = '') {
  if (!ok() || !S.user.sound.voice) return; const r = mulberry((S.max.seed || 1) + text.length); const [base0, mod, type] = EMO[emotion] || EMO.neutral; const base = base0 * (0.9 + (S.max.seed % 100) / 500);
  const n = clamp(Math.round(text.length / 4), 2, 9); const t0 = ctx.currentTime; const q = text.trim().endsWith('?');
  for (let i = 0; i < n; i++) { const f = base * Math.pow(2, (SCALE[Math.floor(r() * 5)] + (q && i === n - 1 ? 7 : 0)) / 12); tone(f, type, t0 + i * 0.085, 0.07, 0.07, bus.voice, 0.006, mod > 1 ? 1.12 : 0.9); }
}
let purr = null;
export function purrStart() { if (!ok() || purr || !S.user.sound.voice) return; const s = noiseSrc(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160; const g = ctx.createGain(); g.gain.value = 0; const lfo = ctx.createOscillator(); lfo.frequency.value = 22; const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g.gain); s.connect(f); f.connect(g); g.connect(bus.voice); s.start(); lfo.start(); g.gain.setTargetAtTime(0.3, ctx.currentTime, 0.4); purr = { s, lfo, g }; }
export function purrStop() { if (!purr) return; const p = purr; purr = null; p.g.gain.setTargetAtTime(0, ctx.currentTime, 0.25); setTimeout(() => { try { p.s.stop(); p.lfo.stop(); } catch {} }, 900); }

// ---------- radio: slow generative lo-fi, never the same twice ----------
let radio = null;
export function radioSet(on) {
  if (!ctx) { R.radioPlaying = false; return; }
  if (on && !radio) { radio = { next: ctx.currentTime + 0.1, step: 0, root: 57 + Math.floor(Math.random() * 5), timer: setInterval(radioTick, 120) }; R.radioPlaying = true; }
  if (!on && radio) { clearInterval(radio.timer); radio = null; R.radioPlaying = false; }
}
function radioTick() {
  if (!radio || !ctx) return; const beat = 0.6667;
  while (radio.next < ctx.currentTime + 0.4) {
    const t = radio.next, s = radio.step; const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    if (s % 8 === 0) { const chords = [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]]; const c = chords[(s / 8) % 4 | 0]; c.forEach((d) => tone(hz(radio.root - 12 + d), 'triangle', t, beat * 7.5, 0.05, bus.music, 0.25)); }
    if (Math.random() < 0.55) tone(hz(radio.root + 12 + pick(SCALE) + (Math.random() < 0.3 ? 12 : 0)), 'sine', t, 0.9, 0.06, bus.music, 0.004);
    if (s % 2 === 0) { tone(75, 'sine', t, 0.18, 0.12, bus.music, 0.002, 0.5); } if (s % 4 === 2) burst(0.06, 0.05, 'highpass', 6000, 1, bus.music, t);
    radio.next += beat / 1; radio.step++;
  }
}
export function radioPulse() { return radio ? (ctx.currentTime % 0.6667) / 0.6667 : 0; }

// ---------- wiring: sounds react to world events ----------
export function wire() {
  listen('world:land', ({ o, speed, wall }) => { if (o.type === 'ball' || o.type === 'button') sfx.bounce(speed); else sfx.thud(speed, o.def.hit === 'paper' ? 'paper' : 'wood'); });
  listen('world:break', () => sfx.glass());
  listen('world:throw', ({ speed }) => sfx.whoosh(speed));
  listen('world:frame', () => sfx.thud(200, 'paper'));
  listen('max:speech', ({ text, emotion, silent }) => { if (!silent) voice(emotion || 'neutral', text); });
  listen('max:land', ({ v }) => sfx.thud(v * 0.5, 'paper'));
}
