// Lighting: a half-resolution light map (multiplied over the scene) + additive sunbeam and lamp glow.
import { rgb, rg, makeCanvas, ell } from './draw.js';
import { S } from '../core/state.js';
import { world, get } from './world.js';
import { scaleAt } from './layout.js';

export function beamGeom(look, L) {
  if (look.sunT == null || look.sunA < 0.2) return null;
  const off = look.shadowDx * 80 + 10; const w = L.win; const yTop = L.floorTop + 8, yBot = L.laneMin + 170;
  const x0 = w.x + off, x1 = w.x + w.w + off; const sh = look.shadowDx * 36;
  return { yTop, yBot, l0: x0, r0: x1, l1: x0 - 24 + sh - 20, r1: x1 + 34 + sh + 10 };
}
export function beamSpot(look, L) {
  const g = beamGeom(look, L); if (!g || look.sunA < 0.35) return null;
  return { x: (g.l0 + g.r0 + g.l1 + g.r1) / 4, y: Math.min(L.laneMax, (g.yTop + g.yBot) / 2 + 30) };
}
export function lampOn(look) {
  const l = S.room.lamp; const night = look.night > 0.5;
  if (l.on === null || l.on === undefined) return night;
  if (l.nightAtSet !== undefined && l.nightAtSet !== night) return night; // manual choice expires when day turns to night / night to day
  return l.on;
}
const lerp = (a, b, t) => a + (b - a) * t;
export function drawBeam(ctx, look, L, cloud, t) {
  const g = beamGeom(look, L); if (!g) return; const a = look.sunA * (1 - cloud * 0.8) * 0.3; if (a < 0.01) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgb(look.sunc, a);
  const P = (u, v) => ({ x: lerp(lerp(g.l0, g.r0, u), lerp(g.l1, g.r1, u), v), y: lerp(g.yTop, g.yBot, v) });
  for (const [u0, u1] of [[0, 0.47], [0.53, 1]]) for (const [v0, v1] of [[0, 0.46], [0.54, 1]]) {
    const p = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]; ctx.globalAlpha = 1 - v0 * 0.5; ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function makeLightMap() { return { c: null, ctx: null, w: 0, h: 0 }; }
export function renderLight(lm, look, L, env, res) {
  const w = Math.ceil(L.W * res), h = Math.ceil(L.H * res);
  if (!lm.c || lm.w !== w || lm.h !== h) { lm.c = makeCanvas(w, h); lm.ctx = lm.c.getContext('2d'); lm.w = w; lm.h = h; }
  const c = lm.ctx; c.setTransform(res, 0, 0, res, 0, 0); c.globalCompositeOperation = 'source-over';
  c.fillStyle = `rgb(${look.amb[0] * 255 | 0},${look.amb[1] * 255 | 0},${look.amb[2] * 255 | 0})`; c.fillRect(0, 0, L.W, L.H);
  c.globalCompositeOperation = 'lighter';
  const cloud = env.cloud;
  // daylight spilling from the window onto the wall and floor
  const wx = L.win.x + L.win.w / 2, wy = L.win.y + L.win.h / 2;
  const day = look.sunA * (1 - cloud * 0.5);
  if (day > 0.02) { c.fillStyle = rg(c, wx, wy, 10, 210, [[0, rgb(look.sunc, 0.22 * day)], [1, rgb(look.sunc, 0)]]); c.fillRect(0, 0, L.W, L.H); }
  if (look.moon > 0.1) { c.fillStyle = rg(c, wx, wy, 10, 170, [[0, `rgba(120,150,255,${0.2 * look.moon})`], [1, 'rgba(120,150,255,0)']]); c.fillRect(0, 0, L.W, L.H); }
  if (env.aurora > 0.02) { c.fillStyle = rg(c, wx, wy, 10, 240, [[0, `rgba(110,255,190,${0.3 * env.aurora})`], [1, 'rgba(120,120,255,0)']]); c.fillRect(0, 0, L.W, L.H); }
  if (env.lampOn) {
    const lamp = get('lamp'); if (lamp) { const s = scaleAt(L, lamp.y); const flick = 1 + Math.sin(env.t * 9) * 0.006;
      c.fillStyle = rg(c, lamp.x, lamp.y - 104 * s, 6, 200 * s * flick, [[0, 'rgba(255,214,150,.95)'], [0.5, 'rgba(255,190,110,.42)'], [1, 'rgba(255,170,90,0)']]); c.fillRect(0, 0, L.W, L.H);
      c.save(); c.translate(lamp.x, lamp.y); c.scale(1, 0.32); c.fillStyle = rg(c, 0, 0, 4, 120 * s, [[0, 'rgba(255,200,130,.5)'], [1, 'rgba(255,190,110,0)']]); c.beginPath(); c.arc(0, 0, 120 * s, 0, 7); c.fill(); c.restore(); }
  }
  const st = get('stone'); if (st && env.night > 0.2) { c.fillStyle = rg(c, st.x, st.y - 9, 2, 70, [[0, `rgba(110,255,235,${0.42 * env.night * (0.75 + Math.sin(env.t * 1.6) * 0.25)})`], [1, 'rgba(110,255,235,0)']]); c.fillRect(0, 0, L.W, L.H); }
  const rad = get('radio'); if (rad && env.radioOn) { c.fillStyle = rg(c, rad.x + 10, rad.y - 8, 1, 28, [[0, 'rgba(255,170,70,.26)'], [1, 'rgba(255,170,70,0)']]); c.fillRect(0, 0, L.W, L.H); }
  c.globalCompositeOperation = 'source-over';
}
