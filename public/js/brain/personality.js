// Personality: subtle trait differences at birth; slow evolution driven by how the user actually behaves.
import { S, R, commit } from '../core/state.js';
import { TRAITS } from '../core/defaults.js';
import { clamp, dayKey, DAY } from '../util.js';
import { t } from '../i18n/index.js';

export const tr = (n) => S.max.personality.traits[n];
export const stage = () => { const b = S.max.relationship.bond; return b < 0.12 ? 0 : b < 0.38 ? 1 : b < 0.7 ? 2 : 3; };

/** Evolution runs at most once per calendar day (catching up for missed days, capped), with tiny deltas and a hard leash to the birth traits. */
export function evolve() {
  const today = dayKey(); const p = S.max.personality;
  if (p.lastEval === today) return;
  const rel = S.max.relationship; const d = S.max.daily;
  const prevKey = p.lastEval; p.lastEval = today;
  if (!prevKey) { commit('max', () => {}, 'evolve'); return; }
  commit('max', (m) => {
    const P = m.personality, r = m.relationship, tt = P.traits, base = P.base;
    const play = r.plays - (r._plays0 || 0), talk = r.chats - (r._chats0 || 0), gentle = r.gentle - (r._gentle0 || 0), rough = r.rough - (r._rough0 || 0), taps = r.taps - (r._taps0 || 0);
    const nudge = (trait, dlt, note) => {
      const before = tt[trait]; tt[trait] = clamp(before + dlt, base[trait] - 0.22, base[trait] + 0.22);
      if (Math.abs(tt[trait] - before) > 0.002 && note) { const last = P.journal[P.journal.length - 1]; if (!last || last.note !== note || Date.now() - last.ts > 3 * DAY) P.journal.push({ ts: Date.now(), note }); }
    };
    const active = play + talk + taps > 2;
    if (play >= 4) nudge('energy', 0.012, 'playful'), nudge('temperament', 0.01, 'playful');
    if (talk >= 4) { nudge('sociability', 0.014, 'comfy'); nudge('humor', 0.006); }
    if (gentle >= 4 && rough === 0) nudge('patience', 0.012, 'comfy'), nudge('temperament', -0.008, 'calm');
    if (rough >= 3) nudge('patience', -0.014, 'careful'), nudge('sociability', -0.006, 'careful');
    if (!active) { nudge('sociability', -0.012, 'independent'); r.ignoredDays++; } else r.ignoredDays = Math.max(0, r.ignoredDays - 1);
    const topTopic = Object.entries(P.topics).sort((a, b) => b[1] - a[1])[0]; if (topTopic && topTopic[1] >= 3) nudge('curiosity', 0.01, 'curious');
    if (P.journal.length > 12) P.journal = P.journal.slice(-12);
    r._plays0 = r.plays; r._chats0 = r.chats; r._gentle0 = r.gentle; r._rough0 = r.rough; r._taps0 = r.taps;
  }, 'evolve');
}

export function describeTraits() {
  const tt = S.max.personality.traits; const scored = TRAITS.map((k) => [k, tt[k] - 0.5]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
  const w = scored.map(([k, v]) => t(`trait.${k}.${v >= 0 ? 'hi' : 'lo'}`));
  return t('pers.lead', { a: w[0], b: w[1], c: w[2] });
}
export function evoNotes() { const seen = new Set(); return [...S.max.personality.journal].reverse().filter((j) => !seen.has(j.note) && seen.add(j.note)).slice(0, 4).map((j) => ({ ts: j.ts, text: t('evo.' + j.note) })); }
/** One-line, English, model-facing summary for the AI context. */
export function aiSummary() {
  const p = S.max.personality; const tt = p.traits;
  const lv = (v) => (v > 0.62 ? 'high' : v < 0.4 ? 'low' : 'moderate');
  return `${p.style} voice; temperament ${lv(tt.temperament)}, curiosity ${lv(tt.curiosity)}, sociability ${lv(tt.sociability)}, humor ${lv(tt.humor)}, energy ${lv(tt.energy)}, patience ${lv(tt.patience)}; likes ${p.favorite} and ${p.favorite2}; dislikes ${p.dislike}; ${p.chronotype === 'night' ? 'evening creature' : 'daylight creature'}`;
}
