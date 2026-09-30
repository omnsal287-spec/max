// Adaptive quality. Watches frame times + memory pressure + battery, and adjusts effects (never core functionality).
import { S, R } from './state.js';
import * as fx from '../render/fx.js';
import { world } from '../render/world.js';

export const PROFILES = {
  low: { name: 'low', dpr: 1.25, substeps: 1, particles: 0.3, lightRes: 0.32, lightRate: 3, reflection: false, shadows: 'simple', dust: 0, rain: 14, stars: 14, fps: 30 },
  medium: { name: 'medium', dpr: 1.75, substeps: 1, particles: 0.7, lightRes: 0.45, lightRate: 2, reflection: false, shadows: 'soft', dust: 7, rain: 28, stars: 30, fps: 60 },
  high: { name: 'high', dpr: 2.4, substeps: 2, particles: 1, lightRes: 0.6, lightRate: 1, reflection: true, shadows: 'soft', dust: 14, rain: 44, stars: 46, fps: 60 },
};
const ORDER = ['low', 'medium', 'high'];
let level = 'medium', ema = 16.7, slowT = 0, fastT = 0, onChange = () => {};
export function initPerf(cb) {
  onChange = cb || onChange; const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  level = cores <= 2 || mem <= 2 ? 'low' : cores >= 8 && mem >= 6 ? 'high' : 'medium';
  apply();
}
export function mode() { return S.user.perf.mode; }
export function setMode(m) { S.user.perf.mode = m; apply(true); }
function apply(force) {
  const m = S.user.perf.mode; const lv = m === 'auto' ? level : m; const p = PROFILES[lv];
  if (!force && R.quality === p) return; R.quality = p; fx.fx.scale = p.particles; world.quality.substeps = p.substeps; onChange(p);
}
export function currentName() { return R.quality?.name || 'medium'; }
/** called every rendered frame with the raw delta in seconds */
export function monitor(dtRaw) {
  if (dtRaw > 0.5) return; // tab was hidden / debugger
  ema = ema * 0.96 + dtRaw * 1000 * 0.04; R.fps = Math.round(1000 / ema);
  if (S.user.perf.mode !== 'auto') return;
  const target = R.quality.fps === 30 ? 33 : 16.7; const slow = ema > target * 1.45; const fast = ema < target * 1.12;
  slowT = slow ? slowT + dtRaw : Math.max(0, slowT - dtRaw); fastT = fast ? fastT + dtRaw : 0;
  const i = ORDER.indexOf(level);
  const mp = performance.memory ? performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit : 0;
  const lowBatt = R.battery && R.battery.level < 0.15 && !R.battery.charging;
  if ((slowT > 2.5 || mp > 0.82 || lowBatt && level === 'high') && i > 0) { level = ORDER[i - 1]; slowT = 0; fastT = 0; ema = target; apply(); }
  else if (fastT > 25 && i < ORDER.length - 1 && !lowBatt && R.quality.fps === 60 || (fastT > 40 && R.quality.fps === 30 && i < 2 && level === 'low' && (navigator.hardwareConcurrency || 4) > 4)) { level = ORDER[Math.min(i + 1, 2)]; fastT = 0; apply(); }
}
