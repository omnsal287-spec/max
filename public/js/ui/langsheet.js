// Language picker: automatic detection or manual choice, switches instantly everywhere.
import { h } from '../util.js';
import { S, commit } from '../core/state.js';
import { t, LANGS, setLang, detect, lang } from '../i18n/index.js';
import { openSheet, switchRow } from './components.js';
import { icon } from './icons.js';

export async function chooseLang(code, auto) {
  commit('user', (u) => { u.lang = code; u.langAuto = !!auto; }, 'lang'); await setLang(code);
}
export function langView() {
  const wrap = h('div', null); const det = LANGS.find((l) => l.code === detect());
  wrap.append(switchRow({ title: t('lang.auto'), desc: t('lang.detected', { name: det.name }), checked: S.user.langAuto, onChange: async (v) => { await chooseLang(v ? detect() : lang(), v); return true; } }));
  wrap.append(h('div', { class: 'list', role: 'radiogroup', 'aria-label': t('set.lang') }, LANGS.map((l) => h('button', { class: 'row-item', role: 'radio', 'aria-checked': String(l.code === lang()), lang: l.code, dir: l.dir, onclick: async () => { await chooseLang(l.code, false); } },
    h('span', { class: 'tx' }, h('b', null, l.name)), l.code === lang() ? h('span', { class: 'chev', style: { color: 'var(--amber)' } }, icon('check')) : null))));
  return wrap;
}
export const openLangSheet = () => openSheet({ title: () => t('set.lang'), build: () => langView(), full: false });
