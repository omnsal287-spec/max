// Object catalogue: definitions (physics + behaviour) and procedural drawings. Everything is vector-drawn.
import { rr, lg, rg, ell, rgb } from './draw.js';
import { TAU } from '../util.js';
import { laneToY } from './layout.js';

export const DEFS = {
  ball: { kind: 'dyn', r: 11, mass: 1, rest: 0.78, fric: 1.2, tapable: true, hit: 'ball', home: () => ({ x: 140, ly: 0.72, surface: 'floor' }) },
  mug: { kind: 'dyn', r: 9, mass: 1.2, rest: 0.25, fric: 6, breakable: 330, hit: 'glass', home: () => ({ x: 316, surface: 'table' }) },
  book: { kind: 'dyn', r: 11, mass: 1.4, rest: 0.12, fric: 7, hit: 'paper', home: () => ({ x: 352, surface: 'table' }) },
  block1: { kind: 'dyn', r: 11, mass: 1.3, rest: 0.3, fric: 5, hit: 'wood', home: () => ({ x: 232, ly: 0.34, surface: 'floor' }) },
  block2: { kind: 'dyn', r: 11, mass: 1.3, rest: 0.3, fric: 5, hit: 'wood', home: () => ({ x: 262, ly: 0.52, surface: 'floor' }) },
  vase: { kind: 'dyn', r: 11, mass: 1.6, rest: 0.18, fric: 6, breakable: 300, hit: 'glass', home: () => ({ x: 350, surface: 'shelf' }) },
  radio: { kind: 'dyn', r: 15, mass: 3, rest: 0.1, fric: 9, tapable: true, hit: 'wood', home: () => ({ x: 292, surface: 'shelf' }) },
  stone: { kind: 'dyn', r: 9, mass: 1.3, rest: 0.2, fric: 7, hit: 'wood' },
  button: { kind: 'dyn', r: 6, mass: 0.4, rest: 0.4, fric: 6, hit: 'glass' },
  feather: { kind: 'dyn', r: 8, mass: 0.1, rest: 0.05, fric: 12, hit: 'paper', light: true },
  shards: { kind: 'dyn', r: 10, mass: 0.6, rest: 0.05, fric: 12, hit: 'glass', noCollide: true },
  plant: { kind: 'furn', w: 46, h: 78, mass: 9, tapable: true, home: () => ({ x: 46, ly: 0.22 }) },
  lamp: { kind: 'furn', w: 34, h: 128, mass: 7, tapable: true, home: () => ({ x: 352, ly: 0.64 }) },
  cushion: { kind: 'furn', w: 82, h: 26, mass: 4, home: () => ({ x: 96, ly: 0.36 }) },
  rug: { kind: 'furn', w: 210, h: 70, mass: 6, flat: true, home: () => ({ x: 176, ly: 0.52 }) },
};
export const DYN_IDS = ['ball', 'mug', 'book', 'block1', 'block2', 'vase', 'radio'];
export const FURN_IDS = ['rug', 'cushion', 'plant', 'lamp'];

// ---------- draw functions: origin = base (contact point), y up is negative ----------
function shine(ctx, x, y, r, a = 0.5) { ctx.fillStyle = `rgba(255,255,255,${a})`; ell(ctx, x, y, r, r * 0.6, -0.6); ctx.fill(); }

const D = {
  ball(ctx, o) {
    ctx.translate(0, -11); ctx.rotate(o.rot || 0);
    ctx.fillStyle = rg(ctx, -4, -4, 1, 13, [[0, '#ff9a84'], [1, '#d8472f']]); ell(ctx, 0, 0, 11, 11); ctx.fill();
    ctx.save(); ell(ctx, 0, 0, 11, 11); ctx.clip(); ctx.fillStyle = '#fff4e4'; ctx.fillRect(-14, -2.5, 28, 5); ctx.fillStyle = '#2f5d7a'; ctx.fillRect(-14, 5, 28, 2.5); ctx.restore();
    ctx.rotate(-(o.rot || 0)); shine(ctx, -4, -5, 3.2, 0.55);
  },
  mug(ctx, o, env) {
    const v = o.variant ? ['#d9744e', '#f3c8a8'] : ['#f2ece0', '#c9d8de'];
    ctx.strokeStyle = v[1]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(8.5, -8.5, 4.6, -1.3, 1.5); ctx.stroke();
    ctx.fillStyle = lg(ctx, -8, 0, 8, 0, [[0, v[0]], [0.6, v[0]], [1, v[1]]]); ctx.beginPath(); ctx.moveTo(-7.5, -16); ctx.lineTo(7.5, -16); ctx.lineTo(6.5, -1.5); ctx.quadraticCurveTo(0, 1, -6.5, -1.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a3a2a'; ell(ctx, 0, -15.5, 7, 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-5, -13, 1.6, 9);
    if (env.steam) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; for (let i = 0; i < 2; i++) { const ph = env.t * 1.3 + i * 2; ctx.beginPath(); ctx.moveTo(-2 + i * 4, -18); ctx.bezierCurveTo(-5 + i * 4 + Math.sin(ph) * 3, -24, 1 + i * 4 + Math.cos(ph) * 3, -28, -2 + i * 4 + Math.sin(ph * 0.8) * 3, -34); ctx.stroke(); } }
  },
  book(ctx) {
    ctx.fillStyle = '#2d6a73'; rr(ctx, -15, -8, 30, 8, 1.5); ctx.fill(); ctx.fillStyle = '#f4ead4'; ctx.fillRect(-13.5, -6.5, 28, 5); ctx.fillStyle = '#1f4f57'; rr(ctx, -15, -8, 30, 2.4, 1); ctx.fill(); ctx.fillRect(-15, -8, 2.6, 8);
    ctx.fillStyle = '#e8b15a'; ctx.fillRect(-6, -7.3, 10, 1);
  },
  block1(ctx) { cube(ctx, '#e0563f', '#f58d76', '#b83c2a', 'M'); },
  block2(ctx) { cube(ctx, '#3f78c2', '#7aa8e6', '#2c5a97', 'X'); },
  vase(ctx, o) {
    ctx.strokeStyle = '#4d7d4a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -24); ctx.quadraticCurveTo(-5, -34, -8, -42); ctx.moveTo(1, -24); ctx.quadraticCurveTo(4, -36, 9, -40); ctx.stroke();
    ctx.fillStyle = '#e8b64f'; ell(ctx, -8, -43, 3.2, 3.2); ctx.fill(); ell(ctx, 9, -41, 3, 3); ctx.fillStyle = '#e97a6a'; ctx.fill();
    ctx.fillStyle = lg(ctx, -10, 0, 10, 0, [[0, '#2e6f77'], [0.5, '#4a9aa0'], [1, '#2a5f66']]);
    ctx.beginPath(); ctx.moveTo(-3.5, -28); ctx.quadraticCurveTo(-3, -22, -9, -15); ctx.quadraticCurveTo(-11, -6, -6, -1); ctx.lineTo(6, -1); ctx.quadraticCurveTo(11, -6, 9, -15); ctx.quadraticCurveTo(3, -22, 3.5, -28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ell(ctx, -4.5, -14, 1.6, 6, 0.15); ctx.fill();
  },
  radio(ctx, o, env) {
    ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(10, -25); ctx.lineTo(18, -40); ctx.stroke();
    ctx.fillStyle = lg(ctx, 0, -26, 0, 0, [[0, '#9a6a45'], [1, '#6e4630']]); rr(ctx, -20, -26, 40, 26, 5); ctx.fill();
    ctx.fillStyle = '#2b2620'; rr(ctx, -16, -21, 18, 16, 3); ctx.fill(); ctx.strokeStyle = 'rgba(200,170,120,.35)'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-14, -18 + i * 3.6); ctx.lineTo(0, -18 + i * 3.6); ctx.stroke(); }
    ctx.fillStyle = '#d9c7a0'; ell(ctx, 10, -16, 4.5, 4.5); ctx.fill(); ctx.strokeStyle = '#6e4630'; ctx.beginPath(); ctx.moveTo(10, -16); ctx.lineTo(12.5, -19); ctx.stroke();
    const on = env.radioOn; ctx.fillStyle = on ? '#ffb24a' : '#5a4636'; ell(ctx, 10, -8, 2, 2); ctx.fill();
    if (on) { ctx.fillStyle = 'rgba(255,178,74,.25)'; ell(ctx, 10, -8, 6 + Math.sin(env.t * 6) * 1, 6); ctx.fill(); }
  },
  stone(ctx, o, env) {
    const pulse = 0.65 + Math.sin(env.t * 1.6) * 0.25; const glow = 0.4 + env.night * 0.6;
    ctx.fillStyle = rg(ctx, 0, -8, 1, 18, [[0, `rgba(120,240,230,${0.5 * pulse * glow})`], [1, 'rgba(120,240,230,0)']]); ell(ctx, 0, -8, 18, 18); ctx.fill();
    ctx.fillStyle = lg(ctx, -8, -16, 8, 0, [[0, '#5c6b78'], [1, '#2b3540']]); ctx.beginPath(); ctx.moveTo(-8, -3); ctx.quadraticCurveTo(-11, -10, -4, -15); ctx.quadraticCurveTo(4, -18, 9, -10); ctx.quadraticCurveTo(11, -2, 4, -0.5); ctx.quadraticCurveTo(-3, 1, -8, -3); ctx.fill();
    ctx.strokeStyle = `rgba(130,255,240,${0.55 * pulse + 0.2})`; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-5, -9); ctx.quadraticCurveTo(-1, -12, 1, -8); ctx.quadraticCurveTo(3, -5, 6, -8); ctx.stroke();
  },
  button(ctx) {
    ctx.translate(0, -5); ctx.fillStyle = rg(ctx, -1.5, -2, 0.5, 7, [[0, '#ffe3a0'], [1, '#c98a2f']]); ell(ctx, 0, 0, 6, 5); ctx.fill(); ctx.fillStyle = '#7a4d14'; for (const [x, y] of [[-1.6, -1], [1.6, -1], [-1.6, 1.2], [1.6, 1.2]]) { ell(ctx, x, y, 0.8, 0.8); ctx.fill(); }
  },
  feather(ctx) {
    ctx.strokeStyle = '#efe6d6'; ctx.fillStyle = '#e9ddc9'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-9, -2); ctx.quadraticCurveTo(0, -12, 10, -5); ctx.quadraticCurveTo(2, -1, -9, -2); ctx.fill(); ctx.strokeStyle = '#b9a98f'; ctx.beginPath(); ctx.moveTo(-10, -1.5); ctx.quadraticCurveTo(0, -7, 9, -5); ctx.stroke();
  },
  shards(ctx) {
    ctx.fillStyle = 'rgba(230,240,245,.9)'; for (const [x, y, s, r] of [[-7, -1, 4, 0.2], [0, -1, 5, 1.1], [7, -1, 3.5, 2.1], [-2, -3, 3, 0.5]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(0, -s * 0.9); ctx.lineTo(s, 0.5); ctx.closePath(); ctx.fill(); ctx.restore(); }
  },
  // ---------- furniture ----------
  rug(ctx, o) {
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ell(ctx, 0, 4, 106, 37); ctx.fill();
    ctx.fillStyle = '#b5543f'; ell(ctx, 0, 0, 104, 34); ctx.fill(); ctx.strokeStyle = '#f0d9b5'; ctx.lineWidth = 3; ell(ctx, 0, 0, 92, 29); ctx.stroke();
    ctx.strokeStyle = '#e9b97a'; ctx.lineWidth = 2; ell(ctx, 0, 0, 72, 22); ctx.stroke(); ctx.fillStyle = '#e9b97a'; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ell(ctx, Math.cos(a) * 46, Math.sin(a) * 13.5, 3.2, 1.6, a); ctx.fill(); }
    ctx.fillStyle = '#7d3a2f'; ell(ctx, 0, 0, 22, 7); ctx.fill();
  },
  cushion(ctx, o, env) {
    ctx.fillStyle = lg(ctx, -40, -24, 40, 0, [[0, '#7fa59a'], [1, '#4e7a73']]);
    ctx.beginPath(); ctx.moveTo(-40, -6); ctx.quadraticCurveTo(-42, -24, -14, -25); ctx.quadraticCurveTo(0, -27, 14, -25); ctx.quadraticCurveTo(42, -24, 40, -6); ctx.quadraticCurveTo(38, 2, 0, 3); ctx.quadraticCurveTo(-38, 2, -40, -6); ctx.fill();
    ctx.fillStyle = '#9cc2b5'; ell(ctx, 0, -17, 28, 6); ctx.fill(); ctx.fillStyle = '#6a9388'; ell(ctx, 0, -16, 16, 3.4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ell(ctx, 0, -17, 33, 8); ctx.stroke(); ctx.setLineDash([]);
  },
  plant(ctx, o, env) {
    const sw = env.sway; ctx.fillStyle = lg(ctx, -16, 0, 16, 0, [[0, '#b8714b'], [1, '#8d4f33']]);
    ctx.beginPath(); ctx.moveTo(-16, -26); ctx.lineTo(16, -26); ctx.lineTo(12, -1); ctx.quadraticCurveTo(0, 2, -12, -1); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#9e5d3c'; rr(ctx, -18, -30, 36, 7, 3); ctx.fill();
    ctx.fillStyle = '#4a3324'; ell(ctx, 0, -29, 15, 2.6); ctx.fill();
    const leaves = [[-1.2, 46, 0], [-0.6, 54, 1], [0, 60, 2], [0.6, 52, 3], [1.2, 44, 4]];
    leaves.forEach(([a, len, i]) => {
      const ang = a + sw * 0.06 * (1 + i * 0.2) + (o.wob || 0) * Math.sin(env.t * 14 + i); ctx.save(); ctx.translate(0, -29); ctx.rotate(ang * 0.8);
      ctx.fillStyle = lg(ctx, 0, 0, 0, -len, [[0, '#3f7a4a'], [1, i % 2 ? '#7cbc6a' : '#5ea05a']]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-13, -len * 0.5, 0, -len); ctx.quadraticCurveTo(13, -len * 0.5, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, -len + 6); ctx.stroke(); ctx.restore();
    });
    if (env.sprout) sprout(ctx, env.sprout, env.t);
  },
  lamp(ctx, o, env) {
    ctx.fillStyle = '#3d3229'; ell(ctx, 0, -2, 13, 4); ctx.fill(); ctx.fillStyle = '#6b5640'; ell(ctx, 0, -4, 11, 3); ctx.fill();
    ctx.strokeStyle = '#8a6d3f'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, -92); ctx.stroke();
    const on = env.lampOn; ctx.fillStyle = on ? lg(ctx, -17, -118, 17, -88, [[0, '#ffe8b0'], [1, '#f2b25a']]) : lg(ctx, -17, -118, 17, -88, [[0, '#d8c9a8'], [1, '#b39a72']]);
    ctx.beginPath(); ctx.moveTo(-9, -120); ctx.lineTo(9, -120); ctx.lineTo(18, -90); ctx.lineTo(-18, -90); ctx.closePath(); ctx.fill();
    ctx.fillStyle = on ? '#fff4d0' : '#9a8560'; ell(ctx, 0, -90, 18, 3.4); ctx.fill();
    if (on) { ctx.fillStyle = 'rgba(255,230,160,.85)'; ell(ctx, 0, -88, 5, 3); ctx.fill(); }
  },
};
function cube(ctx, front, top, side, ch) {
  ctx.fillStyle = front; rr(ctx, -10, -19, 20, 19, 2.4); ctx.fill(); ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(-10, -19); ctx.lineTo(-6, -23); ctx.lineTo(13, -23); ctx.lineTo(10, -19); ctx.closePath(); ctx.fill();
  ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(10, -19); ctx.lineTo(13, -23); ctx.lineTo(13, -4); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, 0, -9.5);
}
function sprout(ctx, stage, t) { // stage 0..1 grows over days
  const h = 6 + stage * 34; ctx.save(); ctx.translate(11, -29); ctx.strokeStyle = '#6fb45e'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2 + Math.sin(t) * 1, -h * 0.5, 0, -h); ctx.stroke();
  ctx.fillStyle = '#8fd07a'; const n = 1 + Math.floor(stage * 3); for (let i = 0; i < n; i++) { const y = -h * (0.4 + i * 0.3); ctx.save(); ctx.translate(0, y); ctx.rotate(i % 2 ? 0.8 : -0.8); ell(ctx, i % 2 ? 4 : -4, 0, 4.5, 2.2, 0); ctx.fill(); ctx.restore(); }
  if (stage > 0.92) { ctx.fillStyle = '#f7d06a'; ell(ctx, 0, -h - 2, 3.4, 3.4); ctx.fill(); ctx.fillStyle = '#f29a5a'; ell(ctx, 0, -h - 2, 1.3, 1.3); ctx.fill(); }
  ctx.restore();
}
export function drawObject(ctx, o, env) { const f = D[o.type]; if (f) f(ctx, o, env); }
export const layoutHome = (L, id) => { const d = DEFS[id]; return d && d.home ? d.home(L) : { x: 200, ly: 0.5, surface: 'floor' }; };
export function homeY(L, h) { if (h.surface === 'floor' || !h.surface) return laneToY(L, h.ly ?? 0.5); return L.platforms.find((p) => p.id === h.surface).y; }
