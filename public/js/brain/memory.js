// Structured memory. Categories: user | pref | relationship | room | event | digest.
// Items can be language-neutral ({tk, tp} rendered via t()) or free text the user/AI provided.
// If memory is disabled nothing is written to disk; items live in RAM for the current session only.
import * as storage from '../core/storage.js';
import { S, R, emit } from '../core/state.js';
import { uid, DAY, HOUR } from '../util.js';
import { t, pack, has } from '../i18n/index.js';

export const CATS = ['user', 'pref', 'relationship', 'room', 'event', 'digest'];
let items = []; const MAX_ITEMS = 120;
export const enabled = () => !!S.user.caps.memory;

export async function loadMemories() { items = (await storage.all('memories')).sort((a, b) => b.ts - a.ts); return items; }
export const list = () => items;
export const count = () => items.length;
export const text = (m) => (m.tk ? t(m.tk, m.tp) : m.text);

export async function add({ cat = 'user', text: tx, tk, tp, importance = 3, source = 'auto', dedupeKey }) {
  if (!tx && !tk) return null;
  const key = dedupeKey || (tk ? tk + JSON.stringify(tp || {}) : tx.toLowerCase());
  const dup = items.find((m) => m.key === key);
  if (dup) { dup.ts = Date.now(); dup.importance = Math.max(dup.importance, importance); if (enabled()) await storage.put('memories', dup); return dup; }
  const m = { id: uid(), cat, text: tx ? String(tx).slice(0, 160) : undefined, tk, tp, key, importance, ts: Date.now(), used: 0, source };
  items.unshift(m);
  if (enabled()) { await storage.put('memories', m); await maintain(); }
  emit('memory:changed', { added: m });
  return m;
}
export async function update(id, textNew) {
  const m = items.find((x) => x.id === id); if (!m) return; m.text = String(textNew).slice(0, 160); m.tk = undefined; m.key = m.text.toLowerCase(); m.source = 'manual';
  if (enabled()) await storage.put('memories', m); emit('memory:changed', {});
}
export async function remove(id) { items = items.filter((m) => m.id !== id); await storage.del('memories', id); emit('memory:changed', {}); }
export async function clearAll() { items = []; await storage.clear('memories'); emit('memory:changed', {}); }
/** When memory is switched off we stop persisting; already-saved data stays until the user deletes it. */

/** Summarise older, low-importance memories so the notebook never turns into a log. */
async function maintain() {
  if (items.length <= MAX_ITEMS - 20) return;
  const old = items.filter((m) => m.importance <= 2 && m.cat !== 'digest' && Date.now() - m.ts > 2 * DAY).sort((a, b) => a.ts - b.ts).slice(0, 25);
  if (old.length < 8) { // drop the lowest-value oldest ones
    const drop = [...items].sort((a, b) => a.importance - b.importance || a.ts - b.ts).slice(0, 5); for (const d of drop) await remove(d.id); return;
  }
  const list = old.slice(0, 8).map((m) => text(m).replace(/\.$/, '')).join('; ');
  for (const m of old) await storage.del('memories', m.id); items = items.filter((m) => !old.includes(m));
  const d = { id: uid(), cat: 'digest', tk: 'memk.digest', tp: { list }, key: 'digest:' + uid(), importance: 2, ts: Date.now(), used: 0, source: 'auto' }; items.unshift(d); await storage.put('memories', d);
}

const tokens = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
/** Relevance filter for AI context: keyword overlap + importance + recency. Returns at most n items. */
export function relevant(query, n = 5) {
  if (!enabled()) return [];
  const q = new Set(tokens(query));
  const scored = items.map((m) => {
    const toks = tokens(text(m)); let ov = 0; for (const w of toks) if (q.has(w)) ov++;
    const rec = Math.max(0, 1 - (Date.now() - m.ts) / (30 * DAY));
    return { m, s: ov * 3 + m.importance + rec + (m.cat === 'user' ? 1.5 : 0) };
  }).sort((a, b) => b.s - a.s).slice(0, n);
  scored.forEach((x) => x.m.used++);
  return scored.map((x) => x.m);
}
export const byCat = () => { const g = {}; for (const m of items) (g[m.cat] ||= []).push(m); return g; };

// ---- Local fact extraction (language aware). The AI may add more, but this works offline. ----
const clip = (s) => s.replace(/^(the|a|an|to|el|la|los|las|un|una|le|les|des|du)\s+/i, '').trim().replace(/\s+/g, ' ').slice(0, 40);
export function extractFacts(msg) {
  const ex = pack()?.extract; if (!ex) return [];
  const out = [];
  for (const kind of ['name', 'like', 'dislike']) for (const src of ex[kind] || []) {
    let re; try { re = new RegExp(src, 'iu'); } catch { continue; }
    const m = msg.match(re); if (m && m[1]) { out.push({ kind, value: clip(m[1]) }); break; }
  }
  return out.filter((f) => f.value.length >= (/[\u3040-\u30ff\u4e00-\u9fff]/.test(f.value) ? 1 : 2));
}
export async function rememberFacts(facts) {
  const saved = [];
  for (const f of facts) {
    if (f.kind === 'name') saved.push(await add({ cat: 'user', tk: 'memk.name', tp: { name: f.value }, importance: 5, source: 'chat', dedupeKey: 'name' }));
    else if (f.kind === 'like') saved.push(await add({ cat: 'pref', tk: 'memk.like', tp: { thing: f.value }, importance: 3, source: 'chat' }));
    else saved.push(await add({ cat: 'pref', tk: 'memk.dislike', tp: { thing: f.value }, importance: 3, source: 'chat' }));
  }
  return saved.filter(Boolean);
}
export const userName = () => { const m = items.find((x) => x.key === 'name'); return m ? m.tp.name : null; };
