// A quiet card that appears after a special moment. Dismissible, never blocks the room, never repeats.
import { h } from '../util.js';
import { S, R, listen } from '../core/state.js';
import { t } from '../i18n/index.js';
import { icon } from './icons.js';
import { stage } from './components.js';
import { shareMoment } from './share.js';

let cur = null, timer = 0;
export function initMomentCards() {
  listen('event:fired', ({ id, moment, present }) => {
    R.notebookDot = true; if (!present || R.chatOpen) return; showCard(moment);
  });
}
export function showCard(m, ms = 16000) {
  dismiss(); const img = m.snap ? h('img', { src: m.snap, alt: '' }) : null;
  cur = h('div', { class: 'moment-card', role: 'status' }, img, h('button', { class: 'icon-btn x', 'aria-label': t('close'), onclick: dismiss }, icon('close')),
    h('div', { class: 'in' }, h('span', { class: 'badge info' }, t('rarity.' + m.rarity)), h('h4', null, t('ev.' + m.ev + '.title')), h('p', null, t('ev.' + m.ev + '.body')),
      h('div', { class: 'row' }, m.shareable ? h('button', { class: 'btn small primary', onclick: () => shareMoment(m) }, icon('share'), t('share')) : null, h('button', { class: 'btn small', onclick: dismiss }, t('done')))));
  stage().append(cur); timer = setTimeout(dismiss, ms);
}
export function dismiss() { clearTimeout(timer); if (cur) { const c = cur; cur = null; c.style.transition = 'opacity .25s, transform .25s'; c.style.opacity = '0'; c.style.transform = 'translateY(12px)'; setTimeout(() => c.remove(), 260); } }
