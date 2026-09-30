// i18n: ui strings (t), MAX's local voice lines (say), RTL handling, locale-aware formatting.
import { ls } from '../core/storage.js';
import { pick } from '../util.js';

export const LANGS = [
  { code: 'en', name: 'English', dir: 'ltr' }, { code: 'ar', name: 'العربية', dir: 'rtl' }, { code: 'zh', name: '中文', dir: 'ltr' },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr' }, { code: 'es', name: 'Español', dir: 'ltr' }, { code: 'fr', name: 'Français', dir: 'ltr' },
];
const packs = {}; let cur = 'en'; const listeners = new Set();
const recent = []; // avoid repeating the same line back to back

export function detect() {
  const cands = [...(navigator.languages || []), navigator.language || 'en'];
  for (const c of cands) { const b = String(c).toLowerCase().split('-')[0]; if (LANGS.some((l) => l.code === b)) return b; }
  return 'en';
}
export async function load(code) {
  if (!packs[code]) packs[code] = (await import(`./${code}.js`)).default;
  if (!packs.en) packs.en = (await import('./en.js')).default;
  return packs[code];
}
export async function setLang(code) {
  if (!LANGS.some((l) => l.code === code)) code = 'en';
  await load(code); cur = code; ls.set('lang', code);
  const L = LANGS.find((l) => l.code === code);
  document.documentElement.lang = code; document.documentElement.dir = L.dir;
  listeners.forEach((f) => f(code));
  return code;
}
export const onLang = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const lang = () => cur;
export const isRTL = () => cur === 'ar';
const interp = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m)) : s);
export const has = (k) => !!(packs[cur]?.ui[k] ?? packs.en?.ui[k]);
export function t(k, v) { const s = packs[cur]?.ui[k] ?? packs.en?.ui[k]; return s === undefined ? k : interp(s, v); }
/** MAX's local lines. Falls back category->english. Avoids immediate repeats. */
export function say(cat, v) {
  const pool = packs[cur]?.say[cat] || packs.en?.say[cat]; if (!pool || !pool.length) return '';
  let s, tries = 0; do { s = pick(pool); tries++; } while (recent.includes(s) && tries < 5 && pool.length > 1);
  recent.push(s); if (recent.length > 8) recent.shift();
  return interp(s, v);
}
export const pack = () => packs[cur];
// ---- formatting ----
export const fmtDate = (ts, opts = { dateStyle: 'medium' }) => new Intl.DateTimeFormat(cur, opts).format(ts);
export const fmtTime = (ts) => new Intl.DateTimeFormat(cur, { hour: 'numeric', minute: '2-digit' }).format(ts);
export const fmtNum = (n) => new Intl.NumberFormat(cur).format(n);
export const fmtPct = (n) => new Intl.NumberFormat(cur, { style: 'percent', maximumFractionDigits: 0 }).format(n);
export function fmtAgo(ms) {
  const rtf = new Intl.RelativeTimeFormat(cur, { numeric: 'auto' }); const m = Math.round(ms / 60000);
  if (m < 60) return rtf.format(-m, 'minute'); const hr = Math.round(m / 60); if (hr < 48) return rtf.format(-hr, 'hour'); return rtf.format(-Math.round(hr / 24), 'day');
}
