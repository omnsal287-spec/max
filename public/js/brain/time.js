// Time system: real device time -> smooth lighting "look". If Location is enabled, sunrise/sunset are computed
// on-device (NOAA approximation) so the window matches daylight where the user actually is.
import { S, R } from '../core/state.js';
import { hourFloat, hashStr, mulberry, dayKey, clamp, lerp, smooth } from '../util.js';

export const PHASES = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night'];
let sun = { sr: 6, ss: 18 }, sunDay = '';
let shown = null; // fractional hour being displayed (eases toward target for overrides)

export function sunTimes(lat, lon, date = new Date()) {
  const rad = Math.PI / 180;
  const N = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
  const calc = (rising) => {
    const lngH = lon / 15; const t = N + ((rising ? 6 : 18) - lngH) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634; L = (L + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad; RA = (RA + 360) % 360;
    RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const T = H + RA - 0.06571 * t - 6.622; let UT = (T - lngH) % 24; if (UT < 0) UT += 24;
    let local = UT - date.getTimezoneOffset() / 60; return ((local % 24) + 24) % 24;
  };
  const sr = calc(true), ss = calc(false);
  return sr == null || ss == null ? null : { sr, ss };
}
export function refreshSun() {
  const k = dayKey(); const loc = S.user.location;
  if (k === sunDay && !refreshSun.force) return; sunDay = k; refreshSun.force = false;
  const st = loc && S.user.caps.location ? sunTimes(loc.lat, loc.lon) : null;
  sun = st && st.ss > st.sr + 4 ? st : { sr: 6, ss: 18 };
}
export const sunInfo = () => sun;

const C = (r, g, b) => [r, g, b];
// look keyframes relative to the sun. sky colours, ambient multiply colour, light strength.
const LOOKS = {
  night: { top: C(10, 14, 36), bot: C(27, 35, 72), amb: C(.30, .36, .58), sunc: C(150, 170, 255), sunA: .0, moon: 1 },
  predawn: { top: C(22, 28, 66), bot: C(74, 66, 110), amb: C(.42, .44, .64), sunc: C(255, 160, 140), sunA: .05, moon: .6 },
  dawn: { top: C(84, 98, 160), bot: C(248, 168, 120), amb: C(.80, .68, .74), sunc: C(255, 176, 120), sunA: .5, moon: .1 },
  morning: { top: C(116, 178, 232), bot: C(214, 232, 240), amb: C(.97, .93, .85), sunc: C(255, 232, 190), sunA: .8, moon: 0 },
  noon: { top: C(84, 158, 232), bot: C(196, 224, 245), amb: C(1, 1, .97), sunc: C(255, 250, 230), sunA: 1, moon: 0 },
  afternoon: { top: C(104, 164, 222), bot: C(240, 224, 186), amb: C(1, .93, .80), sunc: C(255, 222, 160), sunA: .85, moon: 0 },
  evening: { top: C(70, 62, 132), bot: C(244, 138, 92), amb: C(.88, .66, .62), sunc: C(255, 140, 90), sunA: .6, moon: .1 },
  dusk: { top: C(26, 30, 74), bot: C(104, 72, 122), amb: C(.52, .5, .68), sunc: C(200, 130, 160), sunA: .1, moon: .5 },
};
function keyframes() {
  const { sr, ss } = sun; const mid = (sr + ss) / 2;
  return [
    [sr - 1.6, 'predawn'], [sr + .25, 'dawn'], [sr + 2.2, 'morning'], [mid, 'noon'], [ss - 2.8, 'afternoon'], [ss - .1, 'evening'], [ss + .9, 'dusk'], [ss + 2.2, 'night'], [sr - 1.6 + 24, 'predawn'],
  ];
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function phaseAt(h) {
  const { sr, ss } = sun; const mid = (sr + ss) / 2;
  if (h < sr - 0.5 || h >= ss + 1.6) return 'night';
  if (h < sr + 1.2) return 'dawn'; if (h < mid - 1.2) return 'morning'; if (h < mid + 1.4) return 'noon';
  if (h < ss - 1.5) return 'afternoon'; return 'evening';
}

/** Returns the full lighting description for fractional hour h. */
export function lookAt(h) {
  const kf = keyframes(); let hh = h; if (hh < kf[0][0]) hh += 24;
  let i = 0; while (i < kf.length - 2 && hh >= kf[i + 1][0]) i++;
  const a = kf[i], b = kf[i + 1]; const t = smooth(clamp((hh - a[0]) / (b[0] - a[0]), 0, 1));
  const A = LOOKS[a[1]], B = LOOKS[b[1]];
  const { sr, ss } = sun;
  const dayT = (h - sr) / (ss - sr); const nightT = ((h < sr ? h + 24 : h) - ss) / (24 - (ss - sr));
  const isDay = dayT >= 0 && dayT <= 1;
  return {
    h, phase: phaseAt(h), top: mixc(A.top, B.top, t), bot: mixc(A.bot, B.bot, t), amb: mixc(A.amb, B.amb, t), sunc: mixc(A.sunc, B.sunc, t),
    sunA: lerp(A.sunA, B.sunA, t), moon: lerp(A.moon, B.moon, t),
    sunT: isDay ? dayT : null, moonT: isDay ? null : clamp(nightT, 0, 1),
    night: lerp(A.moon, B.moon, t), // 0..1 how "night" it is (for stars, crickets)
    shadowDx: isDay ? (0.5 - dayT) * 2 : 0,
  };
}

let lastOverride = 'auto';
export function updateTime(dt) {
  refreshSun();
  const ov = S.user.appearance.timeOverride;
  let target;
  if (ov === 'auto') target = hourFloat();
  else { const { sr, ss } = sun; const mid = (sr + ss) / 2; target = { dawn: sr + .6, morning: sr + 3, noon: mid, afternoon: ss - 2.4, evening: ss - .2, night: 23.5 }[ov] ?? hourFloat(); }
  if (shown == null) shown = target;
  else {
    let d = target - shown; if (d > 12) d -= 24; if (d < -12) d += 24;
    if (Math.abs(d) > 0.004) { const step = ov === lastOverride && ov === 'auto' ? d : Math.sign(d) * Math.min(Math.abs(d), Math.max(dt * 7, Math.abs(d) * dt * 2.4)); shown += step; if (shown >= 24) shown -= 24; if (shown < 0) shown += 24; }
    else shown = target;
  }
  lastOverride = ov;
  return shown;
}
export const currentHour = () => (shown == null ? hourFloat() : shown);

// Weather outside the window is MAX's own invention, derived from the date, NOT real weather.
export function weatherAt(d = new Date()) {
  const r = mulberry(hashStr(dayKey(d) + ':' + Math.floor(d.getHours() / 7) + ':w'))();
  return r < 0.58 ? 'clear' : r < 0.84 ? 'cloudy' : 'rain';
}
export function weatherNow() { const ov = S.user.appearance.timeOverride; return weatherAt(ov === 'auto' ? new Date() : new Date(new Date().setHours(Math.floor(currentHour())))); }
