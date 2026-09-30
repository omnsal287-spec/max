// Shared UI building blocks: toasts, dialogs, sheets with navigation stack, toggles, segmented controls.
import { h } from '../util.js';
import { S, R, emit } from '../core/state.js';
import { t, onLang } from '../i18n/index.js';
import { icon } from './icons.js';
import * as audio from '../audio.js';
import { haptic } from '../device/capabilities.js';

export const stage = () => document.getElementById('stage');
let modalCount = 0;
const setModal = (d) => { modalCount = Math.max(0, modalCount + d); R.dialogOpen = modalCount > 0; };

// ------------------------------------------------------------------ toast
export function toast(msg, { ms = 3600, live = true } = {}) {
  let box = document.getElementById('toasts'); if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); (document.getElementById('stage') || document.body).append(box); }
  const el = h('div', { class: 'toast', role: live ? 'status' : null }, msg);
  while (box.children.length >= 2) box.firstChild.remove(); box.append(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms); return el;
}

// ------------------------------------------------------------------ focus handling
function trap(root, onEsc) {
  const prev = document.activeElement;
  const key = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onEsc && onEsc(); return; }
    if (e.key !== 'Tab') return; const f = [...root.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  root.addEventListener('keydown', key);
  return () => { root.removeEventListener('keydown', key); try { prev && prev.focus && prev.isConnected && prev.focus({ preventScroll: true }); } catch {} };
}

// ------------------------------------------------------------------ dialog
/** Promise<boolean|string>. buttons: [{label, value, kind}] */
export function dialog({ title, body, buttons, node }) {
  return new Promise((res) => {
    const scrim = h('div', { class: 'scrim top' }); const id = 'dlg' + Math.random().toString(36).slice(2, 6);
    const d = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': id + 't', 'aria-describedby': id + 'b' }, h('h3', { id: id + 't' }, title), h('p', { id: id + 'b' }, body), node || null,
      h('div', { class: 'row' }, buttons.map((b) => h('button', { class: 'btn ' + (b.kind || ''), onclick: () => done(b.value) }, b.label))));
    const release = trap(d, () => done(buttons.find((b) => b.cancel)?.value ?? false));
    const done = (v) => { release(); scrim.remove(); d.remove(); setModal(-1); res(v); };
    stage().append(scrim, d); setModal(1); (d.querySelector('.btn.primary') || d.querySelector('.btn')).focus({ preventScroll: true });
  });
}
export const confirmDialog = ({ title, body, ok, cancel, danger }) => dialog({ title, body, buttons: [{ label: cancel || t('cancel'), value: false, cancel: true }, { label: ok || t('ok'), value: true, kind: danger ? 'danger' : 'primary' }] });
export const alertDialog = ({ title, body, ok }) => dialog({ title, body, buttons: [{ label: ok || t('ok'), value: true, kind: 'primary', cancel: true }] });

// ------------------------------------------------------------------ sheet (bottom sheet with back-stack navigation)
/** openSheet({title, build, full, onClose}) -> controller {push(title, build), pop(), refresh(), close()} */
export function openSheet({ title, build, full = true, onClose, tabs }) {
  const scrim = h('div', { class: 'scrim' }); const stack = [{ title, build }]; let closing = false;
  const titleEl = h('h2', { id: 'sh' + Math.random().toString(36).slice(2, 5) }); const back = h('button', { class: 'icon-btn btn-back', 'aria-label': t('back'), onclick: () => ctl.pop(), hidden: true }, icon('back'));
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': t('close'), onclick: () => ctl.close() }, icon('close'));
  const body = h('div', { class: 'sheet-body' }); const sheet = h('div', { class: 'sheet' + (full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleEl.id }, h('div', { class: 'grab' }), h('div', { class: 'sheet-head' }, back, titleEl, closeBtn), body);
  const render = (keepScroll) => { const top = stack[stack.length - 1]; const sc = body.scrollTop; titleEl.textContent = typeof top.title === 'function' ? top.title() : top.title; back.hidden = stack.length < 2; body.replaceChildren(top.build(ctl)); body.scrollTop = keepScroll ? sc : 0; };
  const offLang = onLang(() => { closeBtn.setAttribute('aria-label', t('close')); back.setAttribute('aria-label', t('back')); render(true); });
  const release = trap(sheet, () => (stack.length > 1 ? ctl.pop() : ctl.close()));
  const ctl = {
    el: sheet, body,
    push(ttl, b) { stack.push({ title: ttl, build: b }); render(false); body.focus?.(); titleEl.focus?.(); },
    pop() { if (stack.length > 1) { stack.pop(); render(false); } else ctl.close(); },
    refresh() { render(true); },
    close() { if (closing) return; closing = true; offLang(); sheet.classList.add('closing'); setTimeout(() => { release(); scrim.remove(); sheet.remove(); setModal(-1); onClose && onClose(); }, R.reduceMotion ? 0 : 240); },
  };
  scrim.addEventListener('click', () => ctl.close());
  stage().append(scrim, sheet); setModal(1); render(false); titleEl.setAttribute('tabindex', '-1'); titleEl.focus({ preventScroll: true }); return ctl;
}

// ------------------------------------------------------------------ small controls
export function toggle({ checked, label, onChange, disabled, busy }) {
  const b = h('button', { class: 'toggle', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': label, disabled: disabled || null });
  b.addEventListener('click', async () => { if (b.classList.contains('busy')) return; const next = b.getAttribute('aria-checked') !== 'true'; haptic && haptic('tick'); audio.sfx.click(); b.classList.add('busy'); try { const ok = await onChange(next); if (ok !== false) b.setAttribute('aria-checked', String(next)); } finally { b.classList.remove('busy'); } });
  b.set = (v) => b.setAttribute('aria-checked', String(!!v)); return b;
}
export function switchRow({ title, desc, checked, onChange, disabled }) {
  const tg = toggle({ checked, label: title, onChange, disabled }); const row = h('div', { class: 'switch-row' }, h('div', { class: 'tx' }, h('b', null, title), desc ? h('span', null, desc) : null), tg); row.toggle = tg; return row;
}
export function segmented({ options, value, label, onChange }) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const btns = options.map((o) => h('button', { 'aria-pressed': String(o.value === value), onclick: () => { btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === o.value))); onChange(o.value); } }, o.label)); wrap.append(...btns); return wrap;
}
export function rowItem({ ic, title, sub, onClick, danger, end }) {
  const el = h(onClick ? 'button' : 'div', { class: 'row-item' + (danger ? ' danger' : '') + (onClick ? '' : ' static'), onclick: onClick || null },
    ic ? h('span', { class: 'ic' }, icon(ic)) : null, h('span', { class: 'tx' }, h('b', null, title), sub ? h('span', null, sub) : null), end || (onClick ? h('span', { class: 'chev' }, icon('chev')) : null));
  return el;
}
export const badge = (kind, text) => h('span', { class: 'badge ' + kind }, text);
export const fmtBytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
