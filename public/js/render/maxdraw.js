// MAX's body, procedurally drawn. The face and body are driven by a set of smoothed "pose" parameters so
// expressions blend instead of snapping. Origin = feet contact point, y up is negative. Nominal body 64x54.
import { blob, ell, lg, rg } from './draw.js';
import { TAU } from '../util.js';

export function bodyColors(look) {
  const h = look.hue, s = look.sat;
  return { hi: `hsl(${h + 4},${s}%,88%)`, mid: `hsl(${h},${s}%,78%)`, lo: `hsl(${h - 6},${s - 6}%,62%)`, belly: `hsl(${h + 6},${s - 12}%,92%)`, ear: `hsl(${h - 26},${s}%,74%)`, eye: '#231b2d', iris: `hsl(${look.eye},60%,68%)`, cheek: `hsla(${h - 22},85%,66%,0.45)` };
}

/**
 * pose: { sx, sy (squash), tilt, face(-1..1), look:{x,y}, eyeOpen, eyeShape, brow, mouth, pupil, blush, ear, tail, walk, arms, held, asleep, breath, lean }
 */
export function drawMax(ctx, pose, look, t) {
  const C = bodyColors(look); const p = pose;
  ctx.save();
  ctx.rotate(p.lean * 0.5);
  ctx.scale(p.sx, p.sy);
  const W = 64, Hh = 54; const cy = -Hh / 2 - 2;
  // tail (behind)
  const side = p.face >= 0 ? -1 : 1; const tw = Math.sin(t * (p.tailSpeed || 2) + 1) * (p.tail || 0.4);
  ctx.save(); ctx.translate(side * 27, -13); ctx.rotate(side * (0.5 + tw) ); ctx.strokeStyle = C.lo; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(side * 16, -6, side * 20, -22, side * 10, -30); ctx.stroke();
  if (look.tail) { ctx.strokeStyle = C.belly; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(side * 12, -24); ctx.lineTo(side * 10, -30); ctx.stroke(); }
  ctx.restore();
  // feet
  const step = p.walk; const fl = Math.max(0, Math.sin(step)) * 4, fr = Math.max(0, -Math.sin(step)) * 4; const dang = p.held ? 6 : 0;
  ctx.fillStyle = C.lo; ell(ctx, -15 + p.face * 2, -3 - fl + dang, 10, 5); ctx.fill(); ell(ctx, 15 + p.face * 2, -3 - fr + dang, 10, 5); ctx.fill();
  // ears
  const ef = p.ear; const eS = look.ear ? 1.12 : 1;
  for (const sgn of [-1, 1]) {
    const flick = sgn === 1 ? p.earR : p.earL;
    ctx.save(); ctx.translate(sgn * 18 + p.face * 2, -Hh + 8); ctx.rotate(sgn * (0.35 - ef * 0.5) + flick); ctx.scale(eS, eS);
    ctx.fillStyle = C.mid; ctx.beginPath(); ctx.moveTo(-10, 4); ctx.quadraticCurveTo(-9, -16, 0, -22); ctx.quadraticCurveTo(10, -14, 11, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.ear; ctx.beginPath(); ctx.moveTo(-5.5, 2); ctx.quadraticCurveTo(-5, -9, 0, -14); ctx.quadraticCurveTo(5, -8, 6, 2); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // body
  ctx.fillStyle = lg(ctx, -24, -Hh, 26, 0, [[0, C.hi], [0.45, C.mid], [1, C.lo]]);
  blob(ctx, p.face * 1.5, cy, W, Hh, 2.7); ctx.fill();
  // belly
  ctx.fillStyle = C.belly; ctx.globalAlpha = 0.85; ell(ctx, p.face * 3, -15, 17, 12); ctx.fill(); ctx.globalAlpha = 1;
  // arms
  const aw = p.arms; // 0 rest .. 1 raised
  for (const sgn of [-1, 1]) { ctx.save(); ctx.translate(sgn * 30 + p.face * 2, -22 - aw * 16); ctx.rotate(sgn * (0.35 + aw * 0.9) + (p.armSwing || 0) * sgn); ctx.fillStyle = C.mid; ell(ctx, 0, 0, 5, 9); ctx.fill(); ctx.restore(); }
  // face
  ctx.save(); ctx.translate(p.face * 6 + p.look.x * 1.5, cy - 6 + p.look.y * 1.2);
  face(ctx, p, C);
  ctx.restore();
  // rim light (soft, top-left), helps volume
  ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(p.face * 1.5, cy, 27, Math.PI * 1.08, Math.PI * 1.36); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
}

function face(ctx, p, C) {
  const ex = 13.2; const open = p.eyeOpen; const shape = p.eyeShape; const fx = p.face * 3.5;
  // cheeks
  if (p.blush > 0.02) { ctx.fillStyle = C.cheek; ctx.globalAlpha = Math.min(1, p.blush); ell(ctx, -21 + fx, 7, 6, 4); ctx.fill(); ell(ctx, 21 + fx, 7, 6, 4); ctx.fill(); ctx.globalAlpha = 1; }
  for (const sgn of [-1, 1]) {
    const cx = sgn * ex + fx; const eyeScale = 1 - Math.abs(p.face) * 0.12 * (sgn === Math.sign(p.face) ? 1 : -0.6);
    ctx.save(); ctx.translate(cx, 0);
    const h = 17 * open * p.eyeH, w = 11 * eyeScale * (shape === 'wide' ? 1.1 : 1);
    if (shape === 'closed' || open < 0.12) { ctx.strokeStyle = C.eye; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-5.5, 1); ctx.quadraticCurveTo(0, 4.5, 5.5, 1); ctx.stroke(); }
    else if (shape === 'happy') { ctx.strokeStyle = C.eye; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-6, 3); ctx.quadraticCurveTo(0, -5, 6, 3); ctx.stroke(); }
    else {
      ctx.fillStyle = C.eye; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, w / 2); else ctx.rect(-w / 2, -h / 2, w, h); ctx.fill();
      // iris glint + highlights follow look
      const lx = p.look.x * 1.8, ly = p.look.y * 2;
      ctx.fillStyle = C.iris; ctx.globalAlpha = 0.28; ell(ctx, lx * 0.6, ly * 0.6 + h * 0.15, w * 0.34, h * 0.26); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ell(ctx, lx - 2, -h * 0.25 + ly * 0.5, 2.6 * p.pupil, 2.6 * p.pupil); ctx.fill(); ell(ctx, lx + 2, h * 0.18 + ly * 0.4, 1.2, 1.2); ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
      if (shape === 'spark') { ctx.fillStyle = '#fff'; ell(ctx, lx + 2.6, -h * 0.05, 1.8, 1.8); ctx.fill(); }
      // lids: sleepy/flat(annoyed): cover part of the eye with body colour
      const lid = shape === 'sleepy' ? 0.55 : shape === 'flat' ? 0.38 : 0; const slope = p.brow * sgn;
      if (lid > 0 || Math.abs(p.brow) > 0.05) {
        ctx.save(); ctx.fillStyle = C.mid; ctx.beginPath(); const top = -h / 2 - 2, cut = -h / 2 + h * lid;
        ctx.moveTo(-w / 2 - 2, top); ctx.lineTo(w / 2 + 2, top); ctx.lineTo(w / 2 + 2, cut + slope * 6); ctx.lineTo(-w / 2 - 2, cut - slope * 6); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    ctx.restore();
  }
  // mouth
  const my = 11; ctx.strokeStyle = C.eye; ctx.fillStyle = C.eye; ctx.lineWidth = 2.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const m = p.mouth, mo = p.mouthOpen || 0; ctx.save(); ctx.translate(fx, my);
  if (m === 'smile') { ctx.beginPath(); ctx.moveTo(-5.5, 0); ctx.quadraticCurveTo(0, 5 + mo * 3, 5.5, 0); ctx.stroke(); }
  else if (m === 'cat') { ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-3.5, 5, 0, 0); ctx.quadraticCurveTo(3.5, 5, 7, 0); ctx.stroke(); }
  else if (m === 'open') { ctx.beginPath(); ctx.ellipse(0, 2, 5, 3.6 + mo * 3, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#ef7f74'; ell(ctx, 0, 4.5, 3, 1.4 + mo); ctx.fill(); }
  else if (m === 'o') { ell(ctx, 0, 2, 2.8, 3.4); ctx.fill(); }
  else if (m === 'frown') { ctx.beginPath(); ctx.moveTo(-5, 3); ctx.quadraticCurveTo(0, -2, 5, 3); ctx.stroke(); }
  else if (m === 'wavy') { ctx.beginPath(); ctx.moveTo(-6, 1); ctx.quadraticCurveTo(-3, -2, 0, 1); ctx.quadraticCurveTo(3, 4, 6, 1); ctx.stroke(); }
  else if (m === 'yawn') { ell(ctx, 0, 3, 5.5, 6 + mo * 2); ctx.fill(); ctx.fillStyle = '#ef7f74'; ell(ctx, 0, 6, 3.6, 2.4); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(-3.5, 1); ctx.lineTo(3.5, 1); ctx.stroke(); }
  ctx.restore();
}
