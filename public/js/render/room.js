// The room's architecture and fixed furniture. Static parts render once into a cached bitmap; animated bits render live.
import { rr, lg, rg, ell, makeCanvas, rgb } from './draw.js';
import { mulberry, TAU, clamp } from '../util.js';

export function renderBackground(L, scale) {
  const c = makeCanvas(L.W * scale, L.H * scale); const ctx = c.getContext('2d'); ctx.scale(scale, scale);
  const r = mulberry(99); const W = L.W, H = L.H, ft = L.floorTop;
  // ---- wall
  ctx.fillStyle = lg(ctx, 0, 0, 0, ft, [[0, '#d9cfbf'], [1, '#cdc1ae']]); ctx.fillRect(0, 0, W, ft);
  ctx.fillStyle = 'rgba(120,100,80,.045)'; for (let x = 0; x < W; x += 16) ctx.fillRect(x, 0, 1.2, ft);
  for (let i = 0; i < 420; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,70,50'},${0.018 + r() * 0.03})`; ctx.fillRect(r() * W, r() * ft, 1 + r() * 2, 1 + r() * 2); }
  // crown moulding + ceiling shadow
  ctx.fillStyle = lg(ctx, 0, 0, 0, 34, [[0, 'rgba(70,55,45,.32)'], [1, 'rgba(70,55,45,0)']]); ctx.fillRect(0, 0, W, 34);
  ctx.fillStyle = '#e9e0d1'; ctx.fillRect(0, 0, W, 5); ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(0, 5, W, 1.5);
  // wainscot
  const wt = Math.round(ft * 0.74); ctx.fillStyle = lg(ctx, 0, wt, 0, ft, [[0, '#6f8f8d'], [1, '#5b7b79']]); ctx.fillRect(0, wt, W, ft - wt);
  ctx.fillStyle = '#e6dccb'; ctx.fillRect(0, wt - 3, W, 4); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, wt + 1, W, 2);
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1.2; for (let x = 30; x < W; x += 68) { rr(ctx, x, wt + 10, 48, ft - wt - 24, 3); ctx.stroke(); }
  // baseboard
  ctx.fillStyle = '#e4d9c6'; ctx.fillRect(0, ft - 11, W, 11); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(0, ft - 11, W, 1.4); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, ft - 1.5, W, 1.5);
  // ---- floor with perspective planks
  const vpY = ft - 320, vpX = W / 2; const top = ft, bot = H;
  ctx.fillStyle = lg(ctx, 0, top, 0, bot, [[0, '#b98a5c'], [0.5, '#a97a4d'], [1, '#8e6340']]); ctx.fillRect(0, top, W, bot - top);
  const n = 11; const plank = [];
  for (let i = -2; i <= n + 1; i++) { const xt = (i / n) * W; const xb = vpX + (xt - vpX) * (bot - vpY) / (top - vpY); plank.push([xt, xb]); }
  for (let i = 0; i < plank.length - 1; i++) {
    const a = plank[i], b = plank[i + 1]; ctx.fillStyle = `rgba(${r() < 0.5 ? '255,235,200' : '60,30,10'},${0.04 + r() * 0.06})`;
    ctx.beginPath(); ctx.moveTo(a[0], top); ctx.lineTo(b[0], top); ctx.lineTo(b[1], bot); ctx.lineTo(a[1], bot); ctx.fill();
    // butt joints
    let y = top + r() * 40; while (y < bot) { const t = (y - top) / (bot - top); const x0 = a[0] + (a[1] - a[0]) * t, x1 = b[0] + (b[1] - b[0]) * t; ctx.strokeStyle = 'rgba(40,20,5,.22)'; ctx.lineWidth = 0.7 + t; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); y += 60 + r() * 120 + t * 60; }
  }
  ctx.strokeStyle = 'rgba(40,20,5,.3)'; for (const [xt, xb] of plank) { ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(xt, top); ctx.lineTo(xb, bot); ctx.stroke(); ctx.strokeStyle = 'rgba(255,230,190,.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xt + 1.4, top); ctx.lineTo(xb + 1.4, bot); ctx.stroke(); ctx.strokeStyle = 'rgba(40,20,5,.3)'; }
  ctx.fillStyle = lg(ctx, 0, top, 0, top + 34, [[0, 'rgba(40,25,10,.4)'], [1, 'rgba(40,25,10,0)']]); ctx.fillRect(0, top, W, 34); // wall/floor contact shadow
  ctx.fillStyle = lg(ctx, 0, top + (bot - top) * 0.3, 0, top + (bot - top) * 0.7, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,245,225,.07)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(0, top, W, bot - top);
  // ---- shelf
  const sh = L.shelf; ctx.fillStyle = 'rgba(40,25,10,.22)'; rr(ctx, sh.x0 + 3, sh.y + 6, sh.x1 - sh.x0, 10, 4); ctx.fill();
  ctx.fillStyle = lg(ctx, 0, sh.y, 0, sh.y + 8, [[0, '#8a5d3c'], [1, '#6a4329']]); rr(ctx, sh.x0, sh.y, sh.x1 - sh.x0, 8, 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(sh.x0, sh.y, sh.x1 - sh.x0, 1.4);
  ctx.fillStyle = '#5b3a24'; for (const bx of [sh.x0 + 12, sh.x1 - 18]) { ctx.beginPath(); ctx.moveTo(bx, sh.y + 8); ctx.lineTo(bx + 6, sh.y + 8); ctx.lineTo(bx, sh.y + 24); ctx.closePath(); ctx.fill(); }
  // ---- clock face
  const ck = L.clock; ctx.fillStyle = 'rgba(0,0,0,.2)'; ell(ctx, ck.x + 2, ck.y + 3, ck.r + 2, ck.r + 2); ctx.fill(); ctx.fillStyle = '#5b3a24'; ell(ctx, ck.x, ck.y, ck.r + 3, ck.r + 3); ctx.fill(); ctx.fillStyle = '#f4ecdb'; ell(ctx, ck.x, ck.y, ck.r, ck.r); ctx.fill();
  ctx.strokeStyle = '#6a5848'; ctx.lineWidth = 1.2; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(ck.x + Math.sin(a) * (ck.r - 4), ck.y - Math.cos(a) * (ck.r - 4)); ctx.lineTo(ck.x + Math.sin(a) * (ck.r - 1.5), ck.y - Math.cos(a) * (ck.r - 1.5)); ctx.stroke(); }
  // ---- MAX's little door
  const d = L.door; const dy = ft - d.h; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(d.x - 3, ft - 2); ctx.lineTo(d.x - 3, dy + 18); ctx.arc(d.x + d.w / 2, dy + 18, d.w / 2 + 3, Math.PI, 0); ctx.lineTo(d.x + d.w + 3, ft - 2); ctx.fill();
  ctx.fillStyle = lg(ctx, d.x, 0, d.x + d.w, 0, [[0, '#7a4f33'], [1, '#5d3a26']]); ctx.beginPath(); ctx.moveTo(d.x, ft - 2); ctx.lineTo(d.x, dy + 18); ctx.arc(d.x + d.w / 2, dy + 18, d.w / 2, Math.PI, 0); ctx.lineTo(d.x + d.w, ft - 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(d.x + d.w / 2, dy + 2); ctx.lineTo(d.x + d.w / 2, ft - 4); ctx.stroke(); ctx.fillStyle = '#e0b15a'; ell(ctx, d.x + d.w - 8, ft - 22, 2.4, 2.4); ctx.fill();
  ctx.fillStyle = '#f0d9a0'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★', d.x + d.w / 2 - 0.5, dy + 22);
  // ---- window frame (glass is punched out so the live sky shows through)
  const w = L.win; ctx.fillStyle = 'rgba(0,0,0,.22)'; rr(ctx, w.x - 5, w.y - 3, w.w + 12, w.h + 12, 5); ctx.fill();
  ctx.fillStyle = '#efe6d6'; rr(ctx, w.x - 8, w.y - 8, w.w + 16, w.h + 16, 5); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'; rr(ctx, w.x, w.y, w.w, w.h, 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#e4d9c6'; ctx.fillRect(w.x + w.w / 2 - 2.5, w.y, 5, w.h); ctx.fillRect(w.x, w.y + w.h * 0.46, w.w, 5);
  ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1.5; rr(ctx, w.x, w.y, w.w, w.h, 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.beginPath(); ctx.moveTo(w.x + 10, w.y + w.h); ctx.lineTo(w.x + 40, w.y); ctx.lineTo(w.x + 62, w.y); ctx.lineTo(w.x + 32, w.y + w.h); ctx.fill();
  ctx.fillStyle = lg(ctx, 0, w.y + w.h + 6, 0, w.y + w.h + 16, [[0, '#f4ecdc'], [1, '#cfc2ab']]); rr(ctx, w.x - 12, w.y + w.h + 6, w.w + 24, 9, 3); ctx.fill(); // sill
  return c;
}

export function drawCurtains(ctx, L, sway, t) {
  const w = L.win; const top = w.y - 14; const bot = w.y + w.h + 26;
  ctx.fillStyle = '#6a4329'; rr(ctx, w.x - 30, top - 4, w.w + 60, 5, 2.5); ctx.fill(); ell(ctx, w.x - 30, top - 1.5, 4, 4); ctx.fill(); ell(ctx, w.x + w.w + 30, top - 1.5, 4, 4); ctx.fill();
  for (const side of [-1, 1]) {
    const edge = side < 0 ? w.x - 8 : w.x + w.w + 8; const outer = side < 0 ? w.x - 30 : w.x + w.w + 30; const gather = 26 + Math.sin(t * 0.7 + side) * sway * 0.6;
    const inner = edge + side * 4 + side * (-0) ; const bottomSwing = Math.sin(t * 0.9 + side * 1.7) * sway * 3;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(outer + side * 3, top); ctx.lineTo(inner + side * 3 + bottomSwing * 0.3, bot); ctx.lineTo(inner + side * 9, bot); ctx.lineTo(outer + side * 9, top); ctx.fill();
    ctx.fillStyle = lg(ctx, outer, 0, inner, 0, [[0, '#b9792f'], [0.5, '#d79f4a'], [1, '#b9792f']]);
    ctx.beginPath(); ctx.moveTo(outer, top); ctx.lineTo(inner, top);
    ctx.bezierCurveTo(inner, top + (bot - top) * 0.45, inner - side * 6 + bottomSwing * 0.5, bot - 40, inner - side * 7 + bottomSwing, bot);
    ctx.lineTo(outer + side * 2 + bottomSwing * 0.2, bot); ctx.bezierCurveTo(outer, bot - 40, outer, top + 60, outer, top); ctx.fill();
    ctx.strokeStyle = 'rgba(80,40,10,.25)'; ctx.lineWidth = 1.2; for (let i = 1; i < 4; i++) { const u = i / 4; const x0 = outer + (inner - outer) * u; ctx.beginPath(); ctx.moveTo(x0, top); ctx.quadraticCurveTo(x0 + bottomSwing * 0.3 * u, (top + bot) / 2, x0 - side * 3 * u + bottomSwing * u, bot); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(outer + (inner - outer) * 0.3, top, 3, 40);
    ctx.fillStyle = '#6a4329'; ctx.fillRect(Math.min(outer, inner) , top + (bot - top) * 0.62, Math.abs(inner - outer) + 2, 3);
  }
}

export function drawClockHands(ctx, L, hour) {
  const ck = L.clock; const m = (hour % 1) * 60; const hh = (hour % 12) + m / 60;
  ctx.strokeStyle = '#3b2f28'; ctx.lineCap = 'round'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.sin((hh / 12) * TAU) * ck.r * 0.5, ck.y - Math.cos((hh / 12) * TAU) * ck.r * 0.5); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.sin((m / 60) * TAU) * ck.r * 0.78, ck.y - Math.cos((m / 60) * TAU) * ck.r * 0.78); ctx.stroke();
  ctx.fillStyle = '#3b2f28'; ell(ctx, ck.x, ck.y, 1.5, 1.5); ctx.fill();
}

export function drawFrame(ctx, L, tilt, swing, t) {
  const f = L.frame; ctx.save(); ctx.translate(f.x, f.y - f.h / 2); ctx.rotate(tilt + Math.sin(t * 7) * swing * 0.08);
  ctx.strokeStyle = 'rgba(60,40,25,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-f.w / 4, 6); ctx.lineTo(0, -8); ctx.lineTo(f.w / 4, 6); ctx.stroke();
  ctx.translate(0, f.h / 2); ctx.fillStyle = 'rgba(0,0,0,.2)'; rr(ctx, -f.w / 2 + 2, -f.h / 2 + 3, f.w, f.h, 3); ctx.fill();
  ctx.fillStyle = '#7a5233'; rr(ctx, -f.w / 2, -f.h / 2, f.w, f.h, 3); ctx.fill(); ctx.fillStyle = '#f2ead8'; ctx.fillRect(-f.w / 2 + 5, -f.h / 2 + 5, f.w - 10, f.h - 10);
  const iw = f.w - 18, ih = f.h - 18; ctx.save(); ctx.beginPath(); ctx.rect(-iw / 2, -ih / 2, iw, ih); ctx.clip();
  ctx.fillStyle = lg(ctx, 0, -ih / 2, 0, ih / 2, [[0, '#f3c78f'], [1, '#e89c7a']]); ctx.fillRect(-iw / 2, -ih / 2, iw, ih); ctx.fillStyle = '#fff3cf'; ell(ctx, 6, -6, 6, 6); ctx.fill();
  ctx.fillStyle = '#6a7fa0'; ctx.beginPath(); ctx.moveTo(-iw / 2, ih / 2); ctx.quadraticCurveTo(-8, -2, 2, ih / 2); ctx.fill(); ctx.fillStyle = '#4c6382'; ctx.beginPath(); ctx.moveTo(-2, ih / 2); ctx.quadraticCurveTo(12, 2, iw / 2, ih / 2); ctx.fill(); ctx.restore();
  ctx.restore();
}

export function drawTable(ctx, L) {
  const t = L.table; const top = t.y, ly = t.laneY;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ell(ctx, (t.x0 + t.x1) / 2 + 4, ly + 2, (t.x1 - t.x0) / 2 + 6, 7); ctx.fill();
  ctx.fillStyle = '#5b3a24'; for (const x of [t.x0 + 6, t.x1 - 10]) ctx.fillRect(x, top + 8, 4, ly - top - 8);
  ctx.fillStyle = '#7a5233'; for (const x of [t.x0 + 14, t.x1 - 18]) ctx.fillRect(x, top + 8, 4.5, ly - top - 4);
  ctx.fillStyle = '#6a4329'; ctx.fillRect(t.x0 + 4, top + 7, t.x1 - t.x0 - 8, 5);
  ctx.fillStyle = lg(ctx, 0, top - 7, 0, top + 9, [[0, '#a87850'], [1, '#8e6240']]); rr(ctx, t.x0, top - 7, t.x1 - t.x0, 16, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(t.x0 + 2, top - 6.5, t.x1 - t.x0 - 4, 1.4); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(t.x0, top + 7, t.x1 - t.x0, 2);
}

/** Persistent decorations created by events (drawn on the wall) */
export function drawWallTrinket(ctx, L, tr, t, env) {
  if (tr.type === 'scribble') {
    const x = L.win.x + L.win.w + 26, y = L.wallH * 0.64 - 4; ctx.save(); ctx.translate(x, y); ctx.rotate(-0.06); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#e0563f'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(0, 0, 12, 10, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-9, -16); ctx.moveTo(6, -9); ctx.lineTo(9, -16); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(-7, 17); ctx.moveTo(5, 10); ctx.lineTo(7, 17); ctx.stroke();
    ctx.fillStyle = '#e0563f'; ell(ctx, -4, -2, 1.3, 1.3); ctx.fill(); ell(ctx, 4, -2, 1.3, 1.3); ctx.fill(); ctx.strokeStyle = '#3f78c2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(24, -12, 5, 0, TAU); ctx.stroke(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(24 + Math.cos(a) * 7, -12 + Math.sin(a) * 7); ctx.lineTo(24 + Math.cos(a) * 10, -12 + Math.sin(a) * 10); ctx.stroke(); }
    ctx.strokeStyle = '#e9b64f'; ctx.beginPath(); ctx.moveTo(-18, 22); ctx.bezierCurveTo(-8, 18, 6, 26, 18, 20); ctx.stroke(); ctx.restore();
  } else if (tr.type === 'pin') {
    const x = 226, y = L.wallH * 0.38; ctx.save(); ctx.translate(x, y); ctx.rotate(0.07); ctx.fillStyle = 'rgba(0,0,0,.2)'; rr(ctx, -16, -20, 32, 40, 2); ctx.fill(); ctx.fillStyle = '#0f1730'; rr(ctx, -17, -22, 32, 40, 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(-15, 12); for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(-15 + u * 28, -8 + k * 7 + Math.sin(u * 5 + t * 0.6 + k) * 4); } ctx.lineTo(13, 12); ctx.closePath(); ctx.fillStyle = k ? 'rgba(180,110,255,.45)' : 'rgba(90,255,190,.5)'; ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#e04f4f'; ell(ctx, -1, -21, 2.4, 2.4); ctx.fill(); ctx.restore();
  }
}
