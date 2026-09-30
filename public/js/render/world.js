// The physical room: object instances + lightweight physics (gravity, bounce, slide, collide, break).
// Purpose-built instead of a physics engine: predictable, cheap, stable on mid-range phones.
import { S, R, commit, emit } from '../core/state.js';
import { clamp, hashStr } from '../util.js';
import { layout, laneToY, yToLane, scaleAt, platformById, WW } from './layout.js';
import { DEFS, DYN_IDS, FURN_IDS, layoutHome, homeY } from './objects.js';

export const world = { L: null, list: [], byId: new Map(), held: null, dirty: false, t: 0, quality: { substeps: 1 } };
const G = 1650;

function makeObj(id, type, st, extra = {}) {
  const def = DEFS[type]; const L = world.L;
  const home = layoutHome(L, id in DEFS ? id : type);
  const p = { ...home, ...(st || {}) };
  const surface = p.surface || 'floor';
  const o = { id, type, def, surface, x: p.x ?? home.x, ly: p.ly ?? home.ly ?? 0.5, vx: 0, vy: 0, air: false, rot: 0, vr: 0, wob: 0, held: false, lift: 0, sortY: 0, variant: st?.variant || 0, broken: !!st?.broken, ...extra };
  o.y = surface === 'floor' ? laneToY(L, o.ly) : platformById(L, surface).y;
  o.lane = surface === 'floor' ? o.y : (surface === 'shelf' ? L.laneMin + 14 : L.table.laneY + 24);
  return o;
}
export function build(H) {
  const L = layout(H); world.L = L; world.list = []; world.byId.clear();
  const R_ = S.room;
  for (const id of FURN_IDS) add(makeObj(id, id, R_.furniture[id]));
  for (const id of DYN_IDS) {
    const st = R_.objects[id]; const type = st && st.broken ? 'shards' : id;
    add(makeObj(id, type, st));
  }
  for (const tr of R_.trinkets) if (DEFS[tr.type]) add(makeObj(tr.id, tr.type, tr, { trinket: true }));
  return L;
}
function add(o) { world.list.push(o); world.byId.set(o.id, o); }
export const get = (id) => world.byId.get(id);
export function respawn(id) { // re-instantiate one object from saved state (e.g. replacement mug)
  const old = world.byId.get(id); if (old) { world.list.splice(world.list.indexOf(old), 1); world.byId.delete(id); }
  const st = S.room.objects[id]; add(makeObj(id, st && st.broken ? 'shards' : id, st));
}
export function addTrinket(tr) { add(makeObj(tr.id, tr.type, tr, { trinket: true })); }
export function relayout(H) { // screen aspect changed: keep things where they belong
  const L = layout(H); world.L = L;
  for (const o of world.list) {
    if (o.held) continue;
    if (o.surface === 'floor') { o.y = laneToY(L, o.ly); o.lane = o.y; o.air = false; o.vy = 0; } else { const p = platformById(L, o.surface); o.y = p.y; o.lane = o.surface === 'shelf' ? L.laneMin + 14 : L.table.laneY + 24; }
  }
}
export const radius = (o) => (o.def.r || 12) * scaleAt(world.L, o.surface === 'floor' ? o.y : o.lane);
export const sOf = (o) => scaleAt(world.L, o.surface === 'floor' || o.air ? clamp(o.air ? o.lane : o.y, world.L.laneMin, world.L.laneMax) : o.lane);
export function sortKey(o) { if (o.held) return 9999; if (o.def.flat) return -5 + o.y * 0.001; if (o.surface !== 'floor' && !o.air) return platformById(world.L, o.surface).sortY + 0.2; return o.air ? Math.max(o.lane, o.y) - 0.1 : o.y; }

/** platform directly below a falling point, if any */
export function landingPlatform(x, prevY, y) {
  let best = null;
  for (const p of world.L.platforms) if (x >= p.x0 && x <= p.x1 && prevY <= p.y + 4 && y >= p.y && (!best || p.y < best.y)) best = p;
  return best;
}

export function release(o, vx, vy) { // let go of an object with throw velocity
  o.held = false; world.held = null;
  const L = world.L; const heavy = o.def.kind === 'furn';
  const k = heavy ? 0.22 : o.def.light ? 0.6 : 1;
  o.vx = clamp(vx * k, -900, 900); o.vy = clamp(vy * k, -900, 900);
  if (o.y >= L.laneMin) o.lane = clamp(o.y, L.laneMin, L.laneMax);
  o.x = clamp(o.x, 8, WW - 8);
  o.surface = 'floor'; o.air = true; o.lane = Math.max(o.lane, L.laneMin);
  if (heavy) { o.air = true; } world.dirty = true;
  if (Math.hypot(o.vx, o.vy) > 260) { emit('world:throw', { o, speed: Math.hypot(o.vx, o.vy) }); }
}
export function grab(o) { o.held = true; o.air = false; o.vx = o.vy = 0; o.surface = 'floor'; world.held = o; if (o.def.kind === 'furn') o.lane = o.y; }
export function dragTo(o, x, y, dt) {
  const L = world.L; const nx = clamp(x, 10, WW - 10), ny = clamp(y, 40, L.laneMax + 26);
  o.vx = (nx - o.x) / Math.max(dt, 0.008); o.vy = (ny - o.y) / Math.max(dt, 0.008); o.x = nx; o.y = ny;
  if (ny >= L.laneMin) o.lane = Math.min(ny, L.laneMax); o.lift = 1;
}

function land(o, p, speed, dt) {
  const d = o.def; const isFurn = d.kind === 'furn';
  if (p) { o.surface = p.id; o.y = p.y; } else { o.y = o.lane; o.surface = 'floor'; }
  if (d.breakable && speed > d.breakable) { breakObj(o); return; }
  const rest = isFurn ? 0.0 : d.rest;
  if (speed > 55 && rest > 0.02) { o.vy = -speed * rest; o.vx *= 0.92; o.air = true; if (o.type !== 'ball') o.vr = (Math.random() - 0.5) * 3; } else { o.vy = 0; o.air = false; o.vr *= 0.3; }
  if (speed > 70) emit('world:land', { o, speed, x: o.x, y: o.y });
  if (isFurn && speed > 120) o.wob = 0.6;
  world.dirty = true;
}
export function breakObj(o) {
  if (o.type === 'shards') return;
  const id = o.id; const x = o.x, y = o.y;
  S.room.objects[id] = { ...(S.room.objects[id] || {}), broken: true, x: o.x, ly: yToLane(world.L, o.lane), surface: 'floor' };
  o.type = 'shards'; o.def = DEFS.shards; o.broken = true; o.vx *= 0.3; o.vy = 0; o.air = false; o.surface = 'floor'; o.y = o.lane; o.vr = 0; o.rot = 0;
  commit('room', (r) => { r.objects[id] = { broken: true, brokenTs: Date.now(), x: o.x, ly: yToLane(world.L, o.lane), surface: 'floor' }; }, 'break');
  emit('world:break', { id, x, y: o.y });
}

export function updateWorld(dt) {
  world.t += dt; const L = world.L; if (!L) return;
  const n = world.quality.substeps; const h = dt / n;
  for (let s = 0; s < n; s++) for (const o of world.list) step(o, h);
  // dyn-dyn collisions
  const ds = world.list.filter((o) => o.def.kind === 'dyn' && !o.def.noCollide);
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) pairCollide(ds[i], ds[j]);
  // frame knocked askew by something flying into it
  const f = L.frame;
  for (const o of ds) if (o.air && Math.hypot(o.vx, o.vy) > 240 && o.x > f.x - f.w / 2 - 4 && o.x < f.x + f.w / 2 + 4 && o.y - 10 > f.y - f.h / 2 && o.y - 10 < f.y + f.h / 2 && Math.abs(S.room.frame.tilt) < 0.4) {
    commit('room', (r) => { r.frame.tilt = clamp(r.frame.tilt + Math.sign(o.vx || 1) * 0.16, -0.5, 0.5); }, 'frame'); world.frameSwing = 1; emit('world:frame', {}); world.dirty = true;
  }
  world.frameSwing = (world.frameSwing || 0) * Math.exp(-dt * 2.2);
}
function step(o, dt) {
  if (o.held) { o.lift = Math.min(1, o.lift + dt * 8); o.rot += ((o.def.kind === 'dyn' ? clamp(o.vx * 0.0015, -0.5, 0.5) : 0) - o.rot) * 0.15; return; }
  o.lift = Math.max(0, o.lift - dt * 6); const L = world.L; const d = o.def; const r = radius(o);
  o.wob *= Math.exp(-dt * 4);
  if (!o.air && o.surface !== 'floor') { // standing on a platform: still supported?
    const p = platformById(L, o.surface);
    if (!p || o.x < p.x0 - 3 || o.x > p.x1 + 3) { o.air = true; o.surface = 'floor'; o.vy = 10; }
  }
  if (o.air) {
    const prevY = o.y; o.vy += G * dt * (d.light ? 0.25 : 1); if (d.light) { o.vy = Math.min(o.vy, 140); o.vx *= Math.exp(-dt * 1.5); }
    o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt; if (o.type === 'ball') o.vr = o.vx / 11;
    if (o.x < r + 4) { o.x = r + 4; o.vx = Math.abs(o.vx) * 0.6; if (Math.abs(o.vx) > 120) emit('world:land', { o, speed: Math.abs(o.vx) * 0.6, x: o.x, y: o.y, wall: true }); }
    if (o.x > WW - r - 4) { o.x = WW - r - 4; o.vx = -Math.abs(o.vx) * 0.6; if (Math.abs(o.vx) > 120) emit('world:land', { o, speed: Math.abs(o.vx) * 0.6, x: o.x, y: o.y, wall: true }); }
    if (o.y - r * 2 < 4) { o.y = r * 2 + 4; o.vy = Math.abs(o.vy) * 0.4; }
    if (o.vy > 0) {
      const p = landingPlatform(o.x, prevY, o.y);
      if (p) land(o, p, o.vy, dt); else if (o.y >= o.lane) land(o, null, o.vy, dt);
    }
  } else {
    if (Math.abs(o.vx) > 0.5) {
      o.x += o.vx * dt; const f = Math.exp(-d.fric * dt * (d.kind === 'furn' ? 2.2 : 1)); o.vx *= f; if (Math.abs(o.vx) < 3) o.vx = 0;
      if (o.type === 'ball') o.rot += (o.vx / 11) * dt; else o.rot *= 0.9;
      if (o.x < r + 4) { o.x = r + 4; o.vx = Math.abs(o.vx) * 0.5; } if (o.x > WW - r - 4) { o.x = WW - r - 4; o.vx = -Math.abs(o.vx) * 0.5; }
      if (!o.def.light || true) { world.dirty = true; }
    }
    o.vr *= 0.9;
  }
}
function pairCollide(a, b) {
  if (a.held && b.held) return; const ra = radius(a), rb = radius(b);
  const ay = a.y - ra, by = b.y - rb; const dx = b.x - a.x, dy = by - ay; const dist = Math.hypot(dx, dy); const min = ra + rb;
  if (dist >= min || dist < 0.001) return;
  // grounded objects at clearly different depths do not touch
  if (!a.air && !b.air && Math.abs(a.y - b.y) > min * 0.8) return;
  const nx = dx / dist, ny = dy / dist; const pen = min - dist; const ma = a.held ? 1e6 : a.def.mass, mb = b.held ? 1e6 : b.def.mass;
  const ta = mb / (ma + mb), tb = ma / (ma + mb);
  if (!a.held) { a.x -= nx * pen * ta; a.y -= ny * pen * ta * 0.3; } if (!b.held) { b.x += nx * pen * tb; b.y += ny * pen * tb * 0.3; }
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy; const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const e = 0.45; const j = (-(1 + e) * vn) / (1 / ma + 1 / mb);
    if (!a.held) { a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny * 0.6; a.air = a.air || Math.abs(ny) > 0.4 && a.vy < -60; }
    if (!b.held) { b.vx += (j / mb) * nx; b.vy += (j / mb) * ny * 0.6; b.air = b.air || (Math.abs(ny) > 0.4 && b.vy < -60); }
    if (-vn > 120) { emit('world:bump', { a, b, speed: -vn }); if (a.def.breakable && -vn > a.def.breakable * 0.9 && !a.held) breakObj(a); if (b.def.breakable && -vn > b.def.breakable * 0.9 && !b.held) breakObj(b); }
  }
}

/** Serialize the current room into persistent state (objects at rest -> positions; airborne -> their landing lane) */
export function saveRoom() {
  const L = world.L; if (!L) return;
  commit('room', (r) => {
    for (const o of world.list) {
      const floor = o.surface === 'floor' || o.air;
      const pos = floor ? { x: +o.x.toFixed(1), ly: +yToLane(L, o.lane).toFixed(3), surface: 'floor' } : { x: +o.x.toFixed(1), surface: o.surface };
      o.ly = pos.ly ?? o.ly;
      if (o.def.kind === 'furn') r.furniture[o.id] = { x: pos.x, ly: pos.ly };
      else if (o.trinket) { const tr = r.trinkets.find((t) => t.id === o.id); if (tr) Object.assign(tr, pos); }
      else r.objects[o.id] = { ...(r.objects[o.id] || {}), ...pos, broken: o.type === 'shards' || undefined, variant: o.variant || undefined };
    }
  }, 'world');
  world.dirty = false;
}

export function hit(x, y, padding = 10) { // topmost interactive object at world point
  let best = null, bk = -1e9;
  for (const o of world.list) {
    if (o.held) continue; const s = sOf(o); const d = o.def; let ok = false;
    if (d.kind === 'furn') {
      if (d.flat) { const rx = d.w / 2 * s + 4, ry = d.h / 2 * s + 4; ok = ((x - o.x) / rx) ** 2 + ((y - o.y) / ry) ** 2 <= 1; }
      else ok = Math.abs(x - o.x) <= (d.w / 2) * s + 4 && y <= o.y + 6 && y >= o.y - d.h * s - 4;
    } else { const r = Math.max(radius(o) * 1.25, 19) + padding * 0.4; ok = Math.hypot(x - o.x, y - (o.y - radius(o))) <= r; }
    if (!ok) continue; const k = sortKey(o) + (d.flat ? -500 : 0) - (o.def.noCollide ? 20 : 0);
    if (k > bk) { bk = k; best = o; }
  }
  return best;
}
