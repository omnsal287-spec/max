// First run: splash -> MAX welcomes you -> "Set up MAX" capability cards -> "Your MAX setup" summary -> room entry.
import { h } from '../util.js';
import { S, R, commit } from '../core/state.js';
import { t, onLang, lang, LANGS } from '../i18n/index.js';
import { icon } from './icons.js';
import { mountMini } from './miniMax.js';
import { stage } from './components.js';
import { capCard, offeredCaps, capSummary, capName, capIcon } from './capabilities.js';
import { openLangSheet } from './langsheet.js';
import { capState } from '../device/capabilities.js';
import * as bridge from '../device/bridge.js';
import * as audio from '../audio.js';

export function showSplash() {
  const el = h('div', { class: 'splash', role: 'status' }, h('div', { class: 'inner' }, h('canvas', { width: 240, height: 240, 'aria-hidden': 'true' }), h('div', { class: 'word' }, 'MAX'), h('div', { class: 'sub' }, t('splash.loading'))));
  stage().append(el); const mini = mountMini(el.querySelector('canvas'), { emotion: 'calm' });
  return { el, done: () => { el.classList.add('out'); setTimeout(() => { mini.destroy(); el.remove(); }, 560); }, setText: (s) => { el.querySelector('.sub').textContent = s; } };
}

export function runOnboarding({ review = false } = {}) {
  return new Promise(async (resolve) => {
    const offered = []; for (const id of offeredCaps()) { if (id === 'advanced') { let up = false; try { up = await bridge.available(); } catch {} if (!up) continue; } offered.push(id); }
    let step = review ? 'setup' : 'welcome'; let screen = null; let mini = null;
    const offLang = onLang(() => render());
    const mount = (cls) => { if (screen) screen.remove(); mini && mini.destroy(); screen = h('div', { class: 'screen ' + (cls || '') }); stage().append(screen); return screen; };

    function welcome() {
      const s = mount(); const cv = h('canvas', { width: 380, height: 380, 'aria-hidden': 'true' });
      const cur = LANGS.find((l) => l.code === lang());
      s.append(h('button', { class: 'btn small lang-btn', onclick: openLangSheet, 'aria-label': t('welcome.lang') }, icon('globe'), cur.name),
        h('div', { class: 'scroll' }, h('div', { class: 'welcome' },
          h('div', { class: 'portrait rise', style: { '--d': '100ms' } }, cv),
          h('h1', { class: 'rise', style: { '--d': '500ms' } }, t('welcome.l1')), h('h1', { class: 'l2 rise', style: { '--d': '1000ms' } }, t('welcome.l2')), h('h1', { class: 'rise', style: { '--d': '1500ms' } }, t('welcome.l3')),
          h('p', { class: 'rise', style: { '--d': '2100ms' } }, t('welcome.body')), h('p', { class: 'rise', style: { '--d': '2700ms' } }, t('welcome.body2')))),
        h('div', { class: 'bar rise', style: { '--d': '2500ms' } }, h('button', { class: 'btn primary block', onclick: () => { audio.unlock(); audio.sfx.chime(); step = 'setup'; render(); } }, t('welcome.cta'))));
      mini = mountMini(cv, { emotion: 'happy' }); setTimeout(() => mini && mini.emotion('calm'), 2600);
    }
    function setup() {
      const s = mount(); const list = h('div', { class: 'list' }, offered.map((id) => capCard(id)));
      s.append(h('div', { class: 'scroll' }, h('div', { class: 'setup-head' }, h('h1', null, t('setup.title')), h('p', null, t('setup.sub'))), list),
        h('div', { class: 'bar' }, h('button', { class: 'btn primary block', onclick: () => { step = 'summary'; render(); } }, t('continue'))));
      s.querySelector('.scroll').scrollTop = 0;
    }
    async function summary() {
      const s = mount(); const { can, cannot } = await capSummary(); const on = offered.filter((i) => can.includes(i)); const off = offered.filter((i) => !can.includes(i));
      const item = (id, isOn) => h('div', { class: 'sum-item ' + (isOn ? 'on' : 'off') }, h('span', { class: 'mk', 'aria-hidden': 'true' }, isOn ? '✓' : '–'), h('span', null, capName(id)), h('span', { class: 'sr' }, isOn ? t('summary.enabled') : t('summary.disabled')));
      s.append(h('div', { class: 'scroll' }, h('div', { class: 'setup-head' }, h('h1', null, t('summary.title'))),
        on.length ? h('div', { class: 'sum-group' }, h('h5', null, t('summary.enabled')), on.map((i) => item(i, true))) : null,
        off.length ? h('div', { class: 'sum-group' }, h('h5', null, t('summary.disabled')), off.map((i) => item(i, false))) : null,
        h('div', { class: 'with' }, h('h5', null, t('summary.with')), on.length ? h('ul', null, on.map((i) => h('li', null, t('can.' + i)))) : h('p', { class: 'muted', style: { margin: 0 } }, t('summary.none')),
          off.length ? [h('h5', { style: { marginTop: '14px' } }, t('summary.cant')), h('ul', { style: { color: 'var(--muted)' } }, off.map((i) => h('li', null, t('cannot.' + i))))] : null),
        h('p', { class: 'note' }, t('summary.change'))),
        h('div', { class: 'bar' }, h('button', { class: 'btn ghost small', onclick: () => { step = 'setup'; render(); } }, t('back')), h('button', { class: 'btn primary block', onclick: enter }, t('summary.enter'))));
    }
    function enter() {
      audio.unlock(); audio.applyVolumes && audio.applyVolumes(); offLang();
      if (!review) commit('user', (u) => { u.onboarded = true; u.stats.firstEnter = Date.now(); }, 'onboard');
      const cine = h('div', { class: 'cine' }); if (!review) stage().append(cine); screen.classList.add('out'); mini && mini.destroy();
      setTimeout(() => { screen.remove(); resolve(); }, R.reduceMotion ? 50 : 520); setTimeout(() => cine.remove(), 1500);
    }
    function render() { if (step === 'welcome') welcome(); else if (step === 'setup') setup(); else summary(); }
    render();
  });
}
/** Re-run from Settings: setup + summary only, then returns to the room. */
export function reviewSetup() { return runOnboarding({ review: true }); }
