// Pooled particle system. Fixed-size pool, no allocations during play.
import { TAU, rnd } from '../util.js';
const N = 260; const P = Array.from({ length: N }, () => ({ on: false }));
export const fx = { cap: N, scale: 1 };
export function spawn(type, x, y, o = {}) {
  if (fx.scale < 1 && Math.random() > fx.scale && type !== 'text') return null;
  for (let i = 0; i < N; i++) { const p = P[i]; if (!p.on) { Object.assign(p, { on: true, type, x, y, vx: 0, vy: 0, g: 0, life: 1, age: 0, size: 3, rot: 0, vr: 0, color: '#fff', glyph: '', grow: 0, add: false, drag: 0 }, o); return p; } }
  return null;
}
export function burst(type, x, y, n, f) { for (let i = 0; i < n; i++) spawn(type, x, y, f(i, n)); }
export function update(dt) {
  for (let i = 0; i < N; i++) {
    const p = P[i]; if (!p.on) continue; p.age += dt; if (p.age >= p.life) { p.on = false; continue; }
    p.vy += p.g * dt; if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.size += p.grow * dt;
    if (p.type === 'shard' && p.floorY && p.y > p.floorY) { p.y = p.floorY; p.vy *= -0.3; p.vx *= 0.6; p.vr *= 0.5; }
  }
}
export function draw(ctx, t) {
  for (let i = 0; i < N; i++) {
    const p = P[i]; if (!p.on) continue; const k = p.age / p.life; const a = Math.min(1, k * 6) * (1 - k) * (p.alpha ?? 1);
    ctx.globalAlpha = Math.max(0, a); ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    switch (p.type) {
      case 'dust': case 'spark': case 'puff': ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, TAU); ctx.fill(); break;
      case 'star': ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); const s = p.size; ctx.beginPath(); for (let j = 0; j < 8; j++) { const r = j % 2 ? s * 0.25 : s; const an = (j / 8) * TAU; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill(); ctx.restore(); break;
      case 'shard': ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.9); ctx.lineTo(p.size, p.size * 0.4); ctx.closePath(); ctx.fill(); ctx.restore(); break;
      case 'text': ctx.fillStyle = p.color; ctx.font = `700 ${p.size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(t * 2 + i) * 0.15); ctx.fillText(p.glyph, 0, 0); ctx.restore(); break;
      case 'heart': ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.size / 10, p.size / 10); ctx.beginPath(); ctx.moveTo(0, 3); ctx.bezierCurveTo(-8, -3, -4, -9, 0, -4); ctx.bezierCurveTo(4, -9, 8, -3, 0, 3); ctx.fill(); ctx.restore(); break;
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
export const clearAll = () => P.forEach((p) => (p.on = false));
