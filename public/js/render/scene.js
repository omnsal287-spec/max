// Scene renderer: camera, layered drawing, lighting composite, shadows, adaptive quality.
import { S, R } from '../core/state.js';
import { clamp, lerp, damp, rnd, TAU, now } from '../util.js';
import { layout, WW, scaleAt, platformById } from './layout.js';
import { world, sOf, sortKey, radius, relayout, build } from './world.js';
import { drawObject } from './objects.js';
import { renderBackground, drawCurtains, drawClockHands, drawFrame, drawTable, drawWallTrinket } from './room.js';
import { drawSky } from './sky.js';
import { drawBeam, renderLight, makeLightMap, lampOn, beamGeom } from './light.js';
import { drawMax } from './maxdraw.js';
import { MX, sortKeyMax, sc as maxScale } from '../brain/maxctl.js';
import * as fx from './fx.js';
import { makeCanvas, ell, rg } from './draw.js';
import { lookAt, updateTime, currentHour } from '../brain/time.js';

export const scene = { canvas: null, ctx: null, cssW: 0, cssH: 0, dpr: 1, sc: 1, H: 700, cam: { x: WW / 2, y: 350, z: 1 }, camT: { x: WW / 2, y: 350, z: 1 }, inset: 0, bg: null, lm: makeLightMap(), ovl: null, lastH: 0, frameN: 0, afterFrame: [], focus: null, cloud: 0, aurora: 0, flash: 0, look: null, env: null, bgScale: 1, parked: false };
const drawables = [];

export function initScene(canvas) { scene.canvas = canvas; scene.ctx = canvas.getContext('2d', { alpha: false }); resize(); }
export function resize() {
  const c = scene.canvas; const r = c.parentElement.getBoundingClientRect(); const q = R.quality || { dpr: 2 };
  const cssW = Math.max(200, r.width), cssH = Math.max(300, r.height); const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  scene.cssW = cssW; scene.cssH = cssH; scene.dpr = dpr; c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
  const H = clamp(Math.round(cssH / (cssW / WW)), 520, 880); scene.H = H; scene.sc = Math.min(cssW / WW, cssH / H);
  if (!world.L) build(H); else if (H !== scene.lastH) relayout(H);
  scene.lastH = H; scene.L = world.L;
  scene.bgScale = scene.sc * dpr * 1.0; scene.bg = renderBackground(world.L, scene.bgScale);
  // vignette overlay in screen space
  const o = makeCanvas(c.width, c.height); const x = o.getContext('2d'); const g = x.createRadialGradient(o.width / 2, o.height * 0.52, o.height * 0.25, o.width / 2, o.height * 0.52, o.height * 0.75); g.addColorStop(0, 'rgba(8,6,18,0)'); g.addColorStop(1, 'rgba(8,6,18,0.5)'); x.fillStyle = g; x.fillRect(0, 0, o.width, o.height); scene.ovl = o;
  scene.lm.c = null; scene.lightDirty = true;
}
export function setQuality() { resize(); }
export function setInset(px) { scene.inset = px; }
const viewCY = () => (scene.cssH - scene.inset) / 2;
export function toWorld(cx, cy) { const b = scene.canvas.getBoundingClientRect(); const k = scene.sc * scene.cam.z; return { x: (cx - b.left - scene.cssW / 2) / k + scene.cam.x, y: (cy - b.top - viewCY()) / k + scene.cam.y }; }
export function toScreen(wx, wy) { const b = scene.canvas.getBoundingClientRect(); const k = scene.sc * scene.cam.z; return { x: (wx - scene.cam.x) * k + scene.cssW / 2 + b.left, y: (wy - scene.cam.y) * k + viewCY() + b.top, k }; }
export function focusOn(f) { scene.focus = f; } // {x,y,z} or null

function updateCamera(dt) {
  const L = world.L; let tz = 1, tx = WW / 2, ty = L.H / 2;
  if (scene.focus) { tz = scene.focus.z; tx = scene.focus.x; ty = scene.focus.y; }
  else if (R.chatOpen || scene.inset > 10) { tz = 1.32; tx = MX.x; ty = MX.y - 40; }
  scene.camT.z = tz; const k = scene.sc * tz;
  const halfW = scene.cssW / 2 / k; tx = halfW >= WW / 2 ? WW / 2 : clamp(tx, halfW, WW - halfW);
  const top = viewCY() / k, bot = (scene.cssH - viewCY()) / k; ty = top + bot >= L.H ? L.H / 2 + (top - bot) / 2 : clamp(ty, top, L.H - bot);
  const reduce = R.reduceMotion; const sp = reduce ? 30 : 3.2;
  scene.cam.z = damp(scene.cam.z, tz, sp, dt); scene.cam.x = damp(scene.cam.x, tx, sp, dt); scene.cam.y = damp(scene.cam.y, ty, sp, dt);
}

function groundFor(x, y, lane) { let g = lane; for (const p of world.L.platforms) if (x >= p.x0 && x <= p.x1 && p.y >= y - 4 && p.y < g) g = p.y; return g; }
function shadow(ctx, x, y, rx, h, alpha, lampX) {
  const L = world.L; const look = scene.look; const s = scaleAt(L, y);
  const dx = lampX != null ? clamp((x - lampX) * 0.06, -10, 10) * (1 + h * 0.02) : look.shadowDx * (6 + h * 0.25);
  ctx.globalAlpha = alpha * clamp(1 - h * 0.006, 0.35, 1); ctx.fillStyle = '#1a1026';
  ell(ctx, x + dx, y + 1, rx * (1 + Math.abs(dx) * 0.03) * (1 + h * 0.003), rx * 0.26 * (1 + h * 0.002)); ctx.fill(); ctx.globalAlpha = 1;
}

export function render(dt, t) {
  const ctx = scene.ctx; const L = world.L; const q = R.quality; scene.frameN++;
  const hour = currentHour(); const look = lookAt(hour); scene.look = look;
  const wTarget = R.weather === 'rain' ? 0.95 : R.weather === 'cloudy' ? 0.6 : 0.0; scene.cloud = damp(scene.cloud, wTarget, 0.4, dt);
  scene.aurora = damp(scene.aurora, R.aurora || 0, 0.6, dt); scene.flash = Math.max(0, scene.flash - dt * 0.9);
  updateCamera(dt);
  const lamp = lampOn(look); const radioOn = S.room.radio.on && R.radioPlaying !== false;
  const sprTr = S.room.trinkets.find((x) => x.type === 'sprout');
  const env = scene.env = { t, cloud: scene.cloud, rain: R.weather === 'rain' ? 1 : 0, rainN: q.rain, stars: q.stars, aurora: scene.aurora, bird: R.bird, lampOn: lamp, radioOn, night: look.night, steam: look.night > 0.4 || look.phase === 'dawn' || look.phase === 'evening' || look.phase === 'morning' || scene.cloud > 0.5, sway: (S.room.window.open ? 2.2 : 0.6) + (R.weather === 'rain' ? 0.3 : 0),
    sprout: sprTr ? clamp(0.06 + (Date.now() - sprTr.ts) / (6 * 86400000), 0.06, 1) : 0 };
  // ---- clear + camera
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d0a14'; ctx.fillRect(0, 0, scene.canvas.width, scene.canvas.height);
  const k = scene.sc * scene.cam.z * scene.dpr; const tx = (scene.cssW / 2 - scene.cam.x * scene.sc * scene.cam.z) * scene.dpr, ty = (viewCY() - scene.cam.y * scene.sc * scene.cam.z) * scene.dpr;
  ctx.setTransform(k, 0, 0, k, tx, ty); ctx.imageSmoothingQuality = 'high';
  // ---- sky (unlit) → background bitmap with window hole
  drawSky(ctx, look, L, env);
  ctx.drawImage(scene.bg, 0, 0, L.W, L.H);
  drawCurtains(ctx, L, env.sway, t);
  drawClockHands(ctx, L, hour);
  drawFrame(ctx, L, S.room.frame.tilt, world.frameSwing || 0, t);
  for (const tr of S.room.trinkets) if (tr.type === 'scribble' || tr.type === 'pin') drawWallTrinket(ctx, L, tr, t, env);
  // ---- shadows
  const lampObj = world.byId?.get('lamp'); const lampX = lamp && lampObj ? lampObj.x : null; const sh = q.shadows; const base = lamp ? 0.22 : clamp(0.1 + look.sunA * (1 - scene.cloud * 0.6) * 0.3, 0.12, 0.34);
  for (const o of world.list) {
    if (o.def.flat || o.def.noCollide && false) continue; const s = sOf(o); const air = o.air || o.held; const ground = air ? groundFor(o.x, o.y, o.lane) : (o.surface === 'floor' ? o.y : platformById(L, o.surface).y);
    const h = Math.max(0, ground - o.y); const w = (o.def.r ? o.def.r * 1.1 : o.def.w * 0.4) * s; shadow(ctx, o.x, ground, w, h, base * (o.def.kind === 'furn' ? 0.9 : 1), lampX);
  }
  { const s = maxScale(); const air = MX.air || MX.held; const ground = air ? groundFor(MX.x, MX.y, MX.lane) : MX.y; shadow(ctx, MX.x, ground, 28 * s, Math.max(0, ground - MX.y) + MX.hop, base * 1.15, lampX); }
  // ---- sorted drawables
  drawables.length = 0; drawables.push({ k: L.table.laneY + 0.1, t: 0 });
  for (const o of world.list) drawables.push({ k: sortKey(o), t: 1, o }); drawables.push({ k: sortKeyMax(), t: 2 });
  drawables.sort((a, b) => a.k - b.k);
  for (const d of drawables) {
    if (d.t === 0) drawTable(ctx, L);
    else if (d.t === 1) drawObj(ctx, d.o, env);
    else drawMaxBody(ctx, env);
  }
  drawBeam(ctx, look, L, scene.cloud, t);
  // ---- lighting
  if (q.lightRate === 1 || scene.frameN % q.lightRate === 0 || scene.lightDirty || world.held) { renderLight(scene.lm, look, L, env, q.lightRes); scene.lightDirty = false; }
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, L.W, L.H); const w = L.win; ctx.rect(w.x + w.w, w.y, -w.w, w.h); ctx.clip('evenodd');
  ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(scene.lm.c, 0, 0, L.W, L.H); ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  // glow halos (additive) – lamp bulb + window bloom
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (lamp && lampObj) { const s = sOf(lampObj); ctx.fillStyle = rg(ctx, lampObj.x, lampObj.y - 104 * s, 2, 56 * s, [[0, 'rgba(255,220,150,.42)'], [1, 'rgba(255,200,120,0)']]); ctx.fillRect(lampObj.x - 70 * s, lampObj.y - 170 * s, 140 * s, 130 * s); }
  if (look.sunA > 0.3) { ctx.fillStyle = rg(ctx, w.x + w.w / 2, w.y + w.h / 2, 10, 120, [[0, `rgba(255,240,210,${0.1 * look.sunA * (1 - scene.cloud * 0.6)})`], [1, 'rgba(255,240,210,0)']]); ctx.fillRect(w.x - 100, w.y - 80, w.w + 200, w.h + 200); }
  ctx.restore();
  // ---- particles (dust in light), fx
  fx.draw(ctx, t);
  // ---- screen space overlays
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scene.ovl, 0, 0);
  if (scene.flash > 0.01) { ctx.fillStyle = `rgba(255,244,220,${Math.min(0.85, scene.flash)})`; ctx.fillRect(0, 0, scene.canvas.width, scene.canvas.height); }
  for (const f of scene.afterFrame) f();
}

function drawObj(ctx, o, env) {
  const s = sOf(o) * (1 + o.lift * 0.07); ctx.save(); ctx.translate(o.x, o.y - o.lift * 7);
  ctx.scale(s, s);
  if (o.def.kind === 'dyn' && o.type !== 'ball' && o.rot) { const r = o.def.r || 10; ctx.translate(0, -r); ctx.rotate(o.rot); ctx.translate(0, r); }
  if (o.def.kind === 'furn' && o.wob > 0.02) ctx.rotate(Math.sin(world.t * 18) * o.wob * 0.03);
  drawObject(ctx, o, env); ctx.restore();
}
function drawMaxBody(ctx, env) {
  const s = maxScale(); const p = MX.pose; const y = MX.y + p.y - MX.hop - (MX.held ? 0 : 0);
  if (R.quality.reflection && !MX.held) { ctx.save(); ctx.translate(MX.x, MX.y + 1); ctx.scale(s, -s * 0.55); ctx.globalAlpha = 0.09; drawMax(ctx, p, S.max.look, env.t); ctx.restore(); }
  ctx.save(); ctx.translate(MX.x, y); ctx.scale(s, s); drawMax(ctx, p, S.max.look, env.t); ctx.restore();
}
/** snapshot of the room (no UI, no private data) used by shareable moments */
export function snapshot(w = 540) {
  const c = scene.canvas; const ratio = c.height / c.width; const o = makeCanvas(w, w * ratio); o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/jpeg', 0.72);
}
