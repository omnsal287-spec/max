// MAX's notebook: memories (readable, editable, deletable), moments (what happened), and who MAX is becoming.
import { h } from '../util.js';
import { S, R, commit, listen } from '../core/state.js';
import { t, fmtDate, fmtAgo, onLang } from '../i18n/index.js';
import * as memory from '../brain/memory.js';
import { getMoments, deleteMoment } from '../brain/events.js';
import { describeTraits, evoNotes, stage } from '../brain/personality.js';
import { moodWord } from '../brain/mood.js';
import { icon } from './icons.js';
import { mountMini } from './miniMax.js';
import { openSheet, confirmDialog, dialog, switchRow, toast } from './components.js';
import { shareMoment } from './share.js';
import { switchCap } from './capabilities.js';

let ctl = null; let tab = 'mem';
export function openNotebook(initial) {
  if (initial) tab = initial === 'max' ? 'max' : initial; else if (tab === 'max' && !initial) tab = 'mem';
  R.notebookDot = false;
  ctl = openSheet({ title: () => t('nb.title'), build: () => view(), onClose: () => { ctl = null; offs.forEach((o) => o()); } });
  const offs = [listen('memory:changed', () => ctl && ctl.refresh()), listen('event:fired', () => ctl && ctl.refresh())];
  return ctl;
}
function view() {
  const wrap = h('div', null); const tabs = [['mem', 'nb.memories'], ['moments', 'nb.moments'], ['max', 'nb.max']];
  wrap.append(h('div', { class: 'tabs', role: 'tablist', style: { padding: '0 0 10px' } }, tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; ctl.refresh(); } }, t(l)))));
  const body = h('div', { role: 'tabpanel' }); wrap.append(body);
  if (tab === 'mem') memView(body); else if (tab === 'moments') momView(body); else maxView(body); return wrap;
}

// ---------------------------------------------------------------- memories
function memView(body) {
  const on = memory.enabled(); const items = memory.list();
  if (!on) body.append(h('div', { class: 'card' }, switchRow({ title: t('mem.toggle'), desc: t('nb.empty.memOff'), checked: false, onChange: async (v) => { const ok = await switchCap('memory', v); if (ok) setTimeout(() => ctl && ctl.refresh(), 100); return ok; } })));
  if (on) {
    const inp = h('input', { type: 'text', maxlength: 160, placeholder: t('nb.add'), 'aria-label': t('nb.add') });
    const add = async () => { const v = inp.value.trim(); if (!v) return; await memory.add({ cat: 'user', text: v, importance: 4, source: 'manual' }); inp.value = ''; };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    body.append(h('div', { class: 'field', style: { flexDirection: 'row', gap: '8px', alignItems: 'center' } }, inp, h('button', { class: 'btn small primary', onclick: add }, t('nb.addBtn'))));
  }
  if (!items.length) { body.append(h('div', { class: 'empty' }, h('canvas', { width: 176, height: 176 }), h('div', null, on ? t('nb.empty.mem') : t('nb.empty.memOff')))); const m = mountMini(body.querySelector('canvas'), { emotion: 'calm', animate: false }); return; }
  const groups = memory.byCat();
  for (const cat of memory.CATS) { const g = groups[cat]; if (!g || !g.length) continue; body.append(h('div', { class: 'h-label' }, t('cat.' + cat)), h('div', { class: 'list' }, g.map(memRow))); }
  if (on) body.append(h('div', { style: { marginTop: '20px' } }, h('button', { class: 'btn danger block', onclick: clearMem }, icon('trash'), t('mem.clear'))));
}
function memRow(m) {
  return h('div', { class: 'mem' }, h('div', { class: 'tx' }, memory.text(m), h('small', null, fmtDate(m.ts))),
    h('div', { class: 'acts' }, h('button', { 'aria-label': t('edit'), onclick: () => editMem(m) }, icon('edit')), h('button', { 'aria-label': t('delete'), onclick: async () => { if (await confirmDialog({ title: t('nb.delConfirm'), body: memory.text(m), ok: t('delete'), danger: true })) memory.remove(m.id); } }, icon('trash'))));
}
async function editMem(m) {
  const inp = h('input', { type: 'text', value: memory.text(m), maxlength: 160, 'aria-label': t('nb.editPrompt'), style: { marginBottom: '16px' } });
  const r = await dialog({ title: t('nb.editPrompt'), body: '', node: inp, buttons: [{ label: t('cancel'), value: false, cancel: true }, { label: t('save'), value: true, kind: 'primary' }] });
  if (r && inp.value.trim()) memory.update(m.id, inp.value.trim());
}
export async function clearMem() { if (await confirmDialog({ title: t('mem.clear'), body: t('mem.clear.c'), ok: t('delete'), danger: true })) { await memory.clearAll(); toast(t('mem.cleared')); } }

// ---------------------------------------------------------------- moments
let momCache = null;
function momView(body) {
  const holder = h('div', { class: 'list' }); body.append(holder);
  getMoments().then((all) => {
    if (!holder.isConnected) return;
    if (!all.length) { const cv = h('canvas', { width: 176, height: 176 }); holder.replaceWith(h('div', { class: 'empty' }, cv, h('div', null, t('nb.empty.moments')))); mountMini(cv, { emotion: 'calm', animate: false }); return; }
    const card = (m) => {
      const acts = h('div', { style: { display: 'flex', gap: '8px' } }, m.shareable ? h('button', { class: 'btn small primary', onclick: () => shareMoment(m) }, icon('share'), t('share')) : null,
        h('button', { class: 'btn small ghost', 'aria-label': t('delete'), onclick: async () => { await deleteMoment(m.id); ctl && ctl.refresh(); } }, icon('trash')));
      const inner = h('div', { class: 'in' }, h('span', { class: 'badge info' }, t('rarity.' + m.rarity)), h('h4', null, t('ev.' + m.ev + '.title')), h('p', null, t('ev.' + m.ev + '.body')), h('div', { class: 'small muted', style: { marginBottom: '10px' } }, fmtDate(m.ts)), acts);
      return h('div', { class: 'moment' }, m.snap ? h('img', { src: m.snap, alt: '', loading: 'lazy' }) : null, inner);
    };
    holder.replaceChildren(...all.map(card));
  });
}

// ---------------------------------------------------------------- MAX
export function maxView(body) {
  const r = S.max.relationship; const p = S.max.personality; const st = stage(); const cv = h('canvas', { width: 280, height: 280, style: { width: '140px', height: '140px' }, 'aria-hidden': 'true' });
  body.append(h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px', padding: '6px 0 14px' } }, cv,
    h('h3', { style: { margin: '4px 0 0', fontSize: '1.375rem' } }, 'MAX'), h('div', { class: 'muted' }, t('mood.' + moodWord())), h('div', { class: 'small muted' }, t('rel.days', { n: Math.max(1, r.days) }))));
  mountMini(cv, { emotion: 'calm' });
  body.append(h('div', { class: 'card' }, h('div', { class: 'kv' }, h('span', null, t('rel.' + st)), h('span', null, Math.round(r.bond * 100) + '%')), h('div', { class: 'bar-mini', role: 'progressbar', 'aria-valuenow': Math.round(r.bond * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: Math.max(3, r.bond * 100) + '%' } }))));
  body.append(h('div', { class: 'card', style: { marginTop: '10px' } }, h('p', { style: { margin: '0 0 8px', lineHeight: 1.5 } }, describeTraits()),
    h('div', { class: 'small muted', style: { lineHeight: 1.6 } }, t('pers.likes', { a: t('obj.' + p.favorite), b: t('obj.' + p.favorite2) }), h('br'), t('pers.dislikes', { a: t('dis.' + p.dislike) }), h('br'), t(p.chronotype === 'night' ? 'pers.night' : 'pers.day'))));
  const ev = evoNotes(); body.append(h('div', { class: 'h-label' }, t('evo.title')), ev.length ? h('div', { class: 'list' }, ev.map((e) => h('div', { class: 'mem' }, h('div', { class: 'tx' }, e.text, h('small', null, fmtDate(e.ts)))))) : h('p', { class: 'note' }, t('evo.none')));
}
