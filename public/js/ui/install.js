// Subtle install prompt: only after the user has actually spent time with MAX, only once per two weeks, never a modal.
import { h } from '../util.js';
import { S, R, commit, listen } from '../core/state.js';
import { t } from '../i18n/index.js';
import { toast } from './components.js';
import { DAY } from '../util.js';

let deferred = null; let shown = false;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canInstall = () => !!deferred;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone();
export function initInstall() {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  addEventListener('appinstalled', () => { deferred = null; toast(t('install.done')); });
}
export async function promptInstall() {
  if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice.catch(() => ({})); deferred = null; return r.outcome === 'accepted';
}
/** Called periodically; shows at most once per session. */
export function maybeSuggest() {
  if (shown || !deferred || isStandalone() || R.dialogOpen || R.chatOpen) return;
  const i = S.user.install; const engaged = S.max.relationship.sessions >= 3 || S.user.tutorial.t > 600; if (!engaged) return; if (Date.now() - (i.dismissedAt || 0) < 14 * DAY) return;
  shown = true; const box = document.getElementById('toasts'); const el = h('div', { class: 'toast', role: 'status' }, h('span', null, t('hud.installWhy')),
    h('button', { class: 'btn small primary', onclick: async () => { el.remove(); await promptInstall(); } }, t('hud.install')), h('button', { class: 'btn small ghost', onclick: () => { commit('user', (u) => { u.install.dismissedAt = Date.now(); }, 'install'); el.remove(); } }, t('later')));
  box.append(el); setTimeout(() => { if (el.isConnected) { commit('user', (u) => { u.install.dismissedAt = Date.now(); }, 'install'); el.remove(); } }, 20000);
}
