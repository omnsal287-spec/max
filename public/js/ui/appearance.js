import { S, R } from '../core/state.js';
export function applyAppearance() {
  const a = S.user.appearance; const root = document.documentElement;
  root.style.setProperty('--ui', String(a.textScale || 1)); root.classList.toggle('hc', !!a.contrast);
  R.reduceMotion = a.motion === 'on' ? true : a.motion === 'off' ? false : matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.toggle('reduce', R.reduceMotion);
}
