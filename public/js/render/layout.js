// World layout. World width is fixed (400 units); height adapts to the screen aspect. All positions derive from it.
import { lerp, clamp } from '../util.js';
export const WW = 400;
export function layout(H) {
  const floorTop = Math.round(H * 0.5); const wallH = floorTop;
  const laneMin = floorTop + 36, laneMax = H - 104;
  const L = {
    W: WW, H, floorTop, wallH, laneMin, laneMax,
    win: { x: 70, y: Math.round(wallH * 0.13), w: 126, h: Math.round(wallH * 0.56) },
    shelf: { x0: 246, x1: 378, y: Math.round(wallH * 0.66) },
    frame: { x: 312, y: Math.round(wallH * 0.3), w: 52, h: 64 },
    clock: { x: 236, y: Math.round(wallH * 0.14), r: 17 },
    door: { x: 10, w: 40, h: 54 },
  };
  const tl = laneMin + 30; L.table = { x0: 286, x1: 376, laneY: tl, y: tl - 50 };
  L.platforms = [
    { id: 'shelf', x0: L.shelf.x0 + 2, x1: L.shelf.x1 - 2, y: L.shelf.y, sortY: L.shelf.y + 0.5 },
    { id: 'table', x0: L.table.x0 + 3, x1: L.table.x1 - 3, y: L.table.y, sortY: L.table.laneY + 0.5 },
  ];
  return L;
}
export const laneToY = (L, ly) => lerp(L.laneMin, L.laneMax, clamp(ly, 0, 1));
export const yToLane = (L, y) => clamp((y - L.laneMin) / (L.laneMax - L.laneMin), 0, 1);
/** perspective scale for something standing at screen y on the floor */
export const scaleAt = (L, y) => lerp(0.8, 1.14, clamp((y - L.laneMin) / (L.laneMax - L.laneMin), 0, 1));
export const platformById = (L, id) => L.platforms.find((p) => p.id === id);
