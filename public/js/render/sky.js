// The view through the window: sky gradient, sun/moon, stars, clouds, skyline, rain, aurora, a visitor bird.
import { rgb, lg, rg, ell } from './draw.js';
import { mulberry, TAU, clamp, lerp } from '../util.js';

const rnd = mulberry(7);
const STARS = Array.from({ length: 46 }, () => ({ x: rnd(), y: rnd() * 0.75, s: 0.5 + rnd() * 1.1, p: rnd() * TAU }));
const CLOUDS = Array.from({ length: 5 }, (_, i) => ({ x: rnd(), y: 0.12 + rnd() * 0.4, s: 0.7 + rnd() * 0.8, v: 0.004 + rnd() * 0.006 }));
const SKY = (() => { const r = mulberry(21); const out = []; let x = 0; while (x < 1.05) { const w = 0.08 + r() * 0.12; out.push({ x, w, h: 0.1 + r() * 0.22, lit: r() }); x += w * 0.92; } return out; })();

export function drawSky(ctx, look, L, env) {
  const w = L.win; const x = w.x - 3, y = w.y - 3, W = w.w + 6, H = w.h + 6; const t = env.t;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
  ctx.fillStyle = lg(ctx, 0, y, 0, y + H, [[0, rgb(look.top)], [1, rgb(look.bot)]]); ctx.fillRect(x, y, W, H);
  // stars
  const ns = look.night * (1 - env.cloud * 0.8);
  if (ns > 0.05) for (let i = 0; i < env.stars; i++) { const s = STARS[i]; ctx.globalAlpha = ns * (0.5 + Math.sin(t * 1.5 + s.p) * 0.4); ctx.fillStyle = '#fff'; ctx.fillRect(x + s.x * W, y + s.y * H, s.s, s.s); }
  ctx.globalAlpha = 1;
  // aurora ribbons
  if (env.aurora > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const hue = [150, 175, 280][k]; ctx.beginPath(); ctx.moveTo(x, y + H * 0.7);
      for (let i = 0; i <= 12; i++) { const u = i / 12; ctx.lineTo(x + u * W, y + H * (0.26 + k * 0.1) + Math.sin(u * 5 + t * (0.5 + k * 0.2) + k * 2) * H * 0.09); }
      ctx.lineTo(x + W, y + H * 0.8); ctx.lineTo(x, y + H * 0.8); ctx.closePath();
      ctx.fillStyle = lg(ctx, 0, y + H * 0.15, 0, y + H * 0.85, [[0, `hsla(${hue},90%,62%,0)`], [0.45, `hsla(${hue},90%,62%,${0.5 * env.aurora})`], [1, `hsla(${hue},90%,62%,0)`]]); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // sun / moon
  const arc = (u) => ({ x: x + W * (0.14 + 0.72 * u), y: y + H * (0.86 - Math.sin(Math.PI * u) * 0.62) });
  if (look.sunT != null && look.sunA > 0.02) { const p = arc(look.sunT); ctx.fillStyle = rg(ctx, p.x, p.y, 2, 46, [[0, rgb(look.sunc, 0.95 * (1 - env.cloud * 0.4))], [0.25, rgb(look.sunc, 0.35)], [1, rgb(look.sunc, 0)]]); ctx.fillRect(x, y, W, H); ctx.fillStyle = rgb([255, 252, 235], 1 - env.cloud * 0.5); ell(ctx, p.x, p.y, 8, 8); ctx.fill(); }
  if (look.moonT != null && look.moon > 0.05) { const p = arc(look.moonT); ctx.globalAlpha = look.moon * (1 - env.cloud * 0.6); ctx.fillStyle = rg(ctx, p.x, p.y, 2, 34, [[0, 'rgba(210,225,255,.5)'], [1, 'rgba(210,225,255,0)']]); ctx.fillRect(x, y, W, H); ctx.fillStyle = '#eef2ff'; ell(ctx, p.x, p.y, 7.5, 7.5); ctx.fill(); ctx.fillStyle = rgb(look.top); ell(ctx, p.x + 3.4, p.y - 1.4, 6.3, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
  // clouds
  const cl = env.cloud; const n = cl < 0.05 ? 1 : 5; const tone = 1 - cl * 0.35;
  for (let i = 0; i < n; i++) {
    const c = CLOUDS[i]; const cx = x + ((((c.x + t * c.v * (cl > 0.5 ? 1.6 : 1)) % 1.3) - 0.15)) * W; const cyy = y + c.y * H; const sz = 26 * c.s * (1 + cl * 0.5);
    const a = (cl < 0.05 ? 0.35 : 0.35 + cl * 0.5); const base = lerp(255, 130, cl * 0.6) * (0.35 + 0.65 * clamp(look.amb[0] + 0.15, 0, 1));
    ctx.fillStyle = `rgba(${base | 0},${(base * 0.98) | 0},${(base * 1.02 + 6) | 0},${a * tone})`;
    for (const [dx, dy, r] of [[-0.6, 0.15, 0.6], [0, 0, 0.8], [0.65, 0.12, 0.6], [0.2, 0.25, 0.7]]) { ell(ctx, cx + dx * sz, cyy + dy * sz, r * sz, r * sz * 0.62); ctx.fill(); }
  }
  // skyline silhouette with lit windows
  const sil = mixDark(look.bot, 0.42 + look.night * 0.2); ctx.fillStyle = rgb(sil);
  const base = y + H + 1; for (const b of SKY) { ctx.fillRect(x + b.x * W, base - b.h * H, b.w * W, b.h * H + 2); }
  if (look.night > 0.25) for (const b of SKY) { const bx = x + b.x * W, by = base - b.h * H; for (let j = 0; j < 4; j++) { if (((b.lit * 97 + j * 13 + Math.floor(t * 0.02)) % 1) > 0.45) continue; ctx.fillStyle = `rgba(255,220,140,${0.75 * look.night})`; ctx.fillRect(bx + 2 + (j % 2) * (b.w * W * 0.45), by + 4 + Math.floor(j / 2) * 8, 2.2, 3); } }
  // rain
  if (env.rain > 0 && env.rainN) { ctx.strokeStyle = `rgba(200,220,255,${0.35 * env.rain})`; ctx.lineWidth = 0.9; ctx.beginPath(); for (let i = 0; i < env.rainN; i++) { const px = x + ((i * 53.7 + t * 12) % W), py = y + ((i * 91.3 + t * 260 * (0.8 + (i % 5) * 0.1)) % H); ctx.moveTo(px, py); ctx.lineTo(px - 2, py + 9); } ctx.stroke(); }
  // visitor bird on the sill
  if (env.bird) bird(ctx, x + W * 0.66, y + H - 2, env.bird, t);
  ctx.restore();
}
function mixDark(c, k) { return [c[0] * (1 - k), c[1] * (1 - k), c[2] * (1 - k * 0.9)]; }
function bird(ctx, bx, by, st, t) {
  const hop = Math.max(0, Math.sin(t * 5.5)) * (st.phase === 'hop' ? 3 : 0); const hx = st.phase === 'arrive' ? (1 - st.k) * 70 : st.phase === 'leave' ? st.k * 90 : 0; const hy = st.phase === 'arrive' ? -(1 - st.k) * 40 : st.phase === 'leave' ? -st.k * 60 : 0;
  ctx.save(); ctx.translate(bx + hx, by - hop + hy); const flying = st.phase === 'arrive' || st.phase === 'leave';
  ctx.fillStyle = '#3d3542'; ell(ctx, 0, -7, 9, 6.5); ctx.fill(); ell(ctx, 7.5, -12, 4.6, 4.3); ctx.fill(); ctx.fillStyle = '#e9a24a'; ctx.beginPath(); ctx.moveTo(11.5, -12.5); ctx.lineTo(16, -11.5); ctx.lineTo(11.5, -10.5); ctx.fill();
  ctx.fillStyle = '#d87a5a'; ell(ctx, 2, -4.5, 5.5, 3.5); ctx.fill(); ctx.fillStyle = '#fff'; ell(ctx, 8.6, -12.6, 1, 1); ctx.fill();
  ctx.strokeStyle = '#3d3542'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-16, -9 + Math.sin(t * 4) * 1.2); ctx.stroke();
  if (flying) { ctx.fillStyle = '#4a4050'; const f = Math.sin(t * 28) * 7; ctx.beginPath(); ctx.moveTo(-2, -10); ctx.quadraticCurveTo(-6, -18 - f, -14, -12 - f * 0.6); ctx.quadraticCurveTo(-7, -9, -2, -8); ctx.fill(); }
  else { ctx.strokeStyle = '#8a6a4a'; ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(-2, 1); ctx.moveTo(3, -1); ctx.lineTo(3, 1); ctx.stroke(); }
  ctx.restore();
}
