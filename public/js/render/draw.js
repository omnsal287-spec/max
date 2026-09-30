// Small canvas helpers shared by all renderers.
export function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else { ctx.rect(x, y, w, h); } }
export const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export function lg(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
export function rg(ctx, x, y, r0, r1, stops) { const g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
export function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); }
export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
/** superellipse-ish blob (squircle) used by MAX's body */
export function blob(ctx, cx, cy, w, h, n = 2.6) {
  ctx.beginPath(); const steps = 36;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a);
    const x = cx + Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * w / 2; const y = cy + Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * h / 2;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
