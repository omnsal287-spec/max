// Capability cards + the explain-then-ask permission flow. Shared by onboarding and Settings.
import { h, fill } from '../util.js';
import { S, listen } from '../core/state.js';
import { t } from '../i18n/index.js';
import { CAP_IDS, NEEDS_OS_PROMPT, capState, setCap, supported } from '../device/capabilities.js';
import { icon } from './icons.js';
import { toggle, badge, confirmDialog, alertDialog, toast } from './components.js';

const ICONS = { memory: 'book', sound: 'vol', notifications: 'bell', device: 'phone', location: 'pin', voice: 'mic', haptics: 'wave', advanced: 'zap' };
const CANS = { memory: 3, sound: 3, notifications: 2, device: 2, location: 2, voice: 2, haptics: 1, advanced: 2 };
export const capName = (id) => t('cap.' + id + '.name');
export const capIcon = (id) => ICONS[id];

/** Only capabilities that genuinely exist on this device are offered in onboarding. */
export const offeredCaps = () => CAP_IDS.filter((id) => supported(id) || id === 'advanced');

/** Turn a capability on/off the honest way: explain first, then the real OS prompt. Resolves to true if now on. */
export async function switchCap(id, on) {
  if (!on) { await setCap(id, false); return true; }
  const st = await capState(id);
  if (!st.supported) { toast(t('perm.unsupported', { name: capName(id) })); return false; }
  if (st.os === 'denied') { await alertDialog({ title: capName(id), body: t('cap.denied.help') }); return false; }
  if (NEEDS_OS_PROMPT[id] && st.os !== 'granted') {
    const go = await confirmDialog({ title: t('explain.title') + ' · ' + capName(id), body: t('explain.' + id), ok: t('explain.go'), cancel: t('explain.no') });
    if (!go) return false;
  }
  const r = await setCap(id, true);
  if (r.reason === 'denied') { toast(t('perm.denied', { name: capName(id) }), { ms: 5200 }); return false; }
  if (r.reason === 'unsupported') { toast(t('perm.unsupported', { name: capName(id) })); return false; }
  if (r.reason === 'failed') { toast(t('perm.failed', { name: capName(id) })); return false; }
  if (r.reason === 'adv') { toast(t('adv.unavailable'), { ms: 5200 }); return true; }
  return r.ok;
}

const stateBadge = (st) => {
  if (st.status === 'unsupported') return badge('off', t('state.unsupported'));
  if (st.status === 'denied') return badge('warn', t('state.denied'));
  if (st.status === 'adv') return badge('info', t('state.adv'));
  if (st.enabled && st.effective) return badge('on', t('state.enabled'));
  if (st.enabled) return badge('info', t('caps.inactive'));
  return badge('off', t('state.disabled'));
};

/** Full card: name, description, what MAX can do, state, toggle. Keeps itself in sync with real state. */
export function capCard(id, { compact = false, onChange } = {}) {
  const root = h('div', { class: 'card cap' }); let tg = null;
  async function paint() {
    const st = await capState(id); const can = []; for (let i = 1; i <= CANS[id]; i++) can.push(h('li', null, t(`cap.${id}.can${i}`)));
    tg = toggle({ checked: st.enabled && st.status !== 'denied' && st.status !== 'unsupported', label: capName(id), disabled: st.status === 'unsupported', onChange: async (v) => { const ok = await switchCap(id, v); onChange && onChange(id); paint(); return ok ? true : false; } });
    fill(root,
      h('div', { class: 'cap-top' }, h('span', { class: 'ic' }, icon(ICONS[id])), h('div', { class: 't' }, h('h4', null, capName(id)), h('div', { class: 'meta' }, stateBadge(st))), tg),
      h('p', { class: 'desc' }, t(`cap.${id}.desc`)),
      compact ? null : [h('div', { class: 'cap-can' }, t('setup.canDo')), h('ul', null, can), h('div', { class: 'cap-note' }, t(`cap.${id}.note`))],
      st.status === 'denied' ? h('div', { class: 'cap-msg' }, t('cap.denied.help')) : null,
      st.status === 'adv' ? h('div', { class: 'cap-msg info' }, t('adv.unavailable')) : null,
    );
  }
  paint();
  const offs = ['caps:changed', 'caps:refreshed'].map((e) => listen(e, () => { if (!root.isConnected) { offs.forEach((o) => o()); return; } paint(); }));
  return root;
}

/** Live, truthful summary of what MAX can / cannot do right now. */
export async function capSummary() {
  const can = [], cannot = [];
  for (const id of CAP_IDS) { const st = await capState(id); (st.enabled && st.effective ? can : cannot).push(id); }
  return { can, cannot };
}
