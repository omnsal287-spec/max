// A small, self-contained MAX portrait (welcome screen, chat header, empty states). Uses the same renderer and look as the room.
import { S } from '../core/state.js';
import { drawMax } from '../render/maxdraw.js';
import { EXPR } from '../brain/maxctl.js';
import { damp } from '../util.js';

const BASE = { sx: 1, sy: 1, lean: 0, face: 1, look: { x: 0, y: 0 }, eyeOpen: 1, eyeH: 1, eyeShape: 'round', brow: 0, mouth: 'smile', mouthOpen: 0, pupil: 1, blush: 0.1, ear: 0.3, earL: 0, earR: 0, tail: 0.4, tailSpeed: 2, walk: 0, arms: 0, armSwing: 0, held: false, y: 0 };
const NUM = ['eyeOpen', 'pupil', 'blush', 'ear', 'arms', 'tail', 'tailSpeed', 'mouthOpen', 'brow'];
const DEF_LOOK = { hue: 30, sat: 78, eye: 200, ear: 0, tail: 0 };
const minis = new Set(); let raf = 0, last = 0, px = 0, py = 0;
addEventListener('pointermove', (e) => { px = (e.clientX / innerWidth - 0.5) * 2; py = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });

function frame(ts) {
  raf = 0; if (document.hidden) return; const dt = Math.min(0.1, (ts - last) / 1000 || 0.016); last = ts;
  for (const m of [...minis]) { if (!m.canvas.isConnected) { minis.delete(m); continue; } m.step(dt, ts / 1000); }
  if (minis.size) raf = requestAnimationFrame(frame);
}
/** mountMini(canvas, {emotion, animate}) -> {emotion(name), bounce(), destroy()} */
export function mountMini(canvas, { emotion = 'happy', animate = true } = {}) {
  const pose = JSON.parse(JSON.stringify(BASE)); let target = EXPR[emotion] || EXPR.neutral; let blink = 0, nextBlink = 1.5, sqv = 0, tt = 0;
  Object.assign(pose, target); const ctx = canvas.getContext('2d');
  const size = () => { const r = canvas.getBoundingClientRect(); const s = Math.max(24, Math.round(r.width || canvas.width || 96)); const dpr = Math.min(2, devicePixelRatio || 1); if (canvas.width !== s * dpr) { canvas.width = s * dpr; canvas.height = s * dpr; } return { s, dpr }; };
  const m = { canvas,
    step(dt, t) {
      tt = t; const { s, dpr } = size();
      for (const k of NUM) if (typeof target[k] === 'number') pose[k] = damp(pose[k] ?? target[k], target[k], 9, dt);
      pose.eyeShape = target.eyeShape || 'round'; pose.mouth = target.mouth || 'smile';
      nextBlink -= dt; if (nextBlink < 0) { blink = 0.14; nextBlink = 2 + Math.random() * 3.5; } blink = Math.max(0, blink - dt);
      const eo = target.eyeOpen * (blink > 0 ? 0.05 : 1); pose.eyeOpen = blink > 0 ? eo : pose.eyeOpen;
      sqv += (-(pose.sy - 1) * 140 - sqv * 9) * dt; pose.sy += sqv * dt; pose.sx = 1 - (pose.sy - 1) * 0.6; pose.sy += Math.sin(t * 2) * 0.0008;
      pose.look.x = damp(pose.look.x, px * 0.9, 5, dt); pose.look.y = damp(pose.look.y, py * 0.6, 5, dt);
      m.draw(s, dpr);
    },
    draw(s, dpr) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); const k = (s * dpr) / 124; ctx.setTransform(k, 0, 0, k, (s * dpr) / 2, s * dpr * 0.88); drawMax(ctx, pose, S.max ? S.max.look : DEF_LOOK, tt); },
    emotion(n) { target = EXPR[n] || EXPR.neutral; if (!animate) { Object.assign(pose, target); const { s, dpr } = size(); m.draw(s, dpr); } },
    bounce() { sqv -= 5; },
    destroy() { minis.delete(m); },
  };
  if (animate) minis.add(m);
  if (animate) { if (!raf) raf = requestAnimationFrame(frame); } else { const { s, dpr } = size(); m.draw(s, dpr); }
  return m;
}
