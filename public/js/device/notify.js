// Notifications via the standard Notification API / service worker. No Termux needed.
import * as storage from '../core/storage.js';
import { S, R, commit } from '../core/state.js';
import { t, lang } from '../i18n/index.js';

let reg = null;
export async function setRegistration(r) { reg = r; }
export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');
export function inQuietHours(d = new Date()) {
  const n = S.user.notif; if (!n.quietOn) return false; const toM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const cur = d.getHours() * 60 + d.getMinutes(), a = toM(n.quietStart), b = toM(n.quietEnd); return a === b ? false : a < b ? cur >= a && cur < b : cur >= a || cur < b;
}
export function canSend() {
  if (!S.user.caps.notifications || permission() !== 'granted') return false; if (inQuietHours()) return false;
  const log = S.user.notif.sentLog.filter((x) => Date.now() - x < 86400000); if (log.length >= 2) return false; if (log.length && Date.now() - Math.max(...log) < 3 * 3600000) return false; return true;
}
export async function send({ title, body, tag, force = false }) {
  if (!S.user.caps.notifications || permission() !== 'granted') return 'off';
  if (!force) { if (!canSend()) return 'limited'; if (!document.hidden) return 'visible'; }
  const opts = { body, tag: tag || 'max', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', lang: lang(), dir: document.documentElement.dir, data: { url: '/' }, silent: false };
  try { if (!reg && 'serviceWorker' in navigator) reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.showNotification(title, opts); else new Notification(title, opts); }
  catch { try { new Notification(title, opts); } catch { return 'error'; } }
  if (!force) commit('user', (u) => { u.notif.sentLog = [...u.notif.sentLog.filter((x) => Date.now() - x < 86400000), Date.now()]; }, 'notif');
  return 'shown';
}
/** Mirror the few notification preferences the service worker needs (it cannot read our in-memory state). */
export async function syncPrefs() {
  const n = S.user.notif; const on = S.user.caps.notifications && permission() === 'granted';
  const strings = { title: t('app.name'), body: t('ev.aurora.notif') };
  try {
    const prev = (await storage.kvGet('notifPrefs')) || {};
    await storage.kvSet('notifPrefs', { enabled: on, quietOn: n.quietOn, quietStart: n.quietStart, quietEnd: n.quietEnd, lang: lang(), sentLog: n.sentLog, strings, lastShared: prev.lastShared || '' });
  } catch {}
  try {
    const r = reg || (await navigator.serviceWorker?.getRegistration()); if (r?.periodicSync) { if (on) await r.periodicSync.register('max-shared-check', { minInterval: 12 * 3600000 }); else await r.periodicSync.unregister('max-shared-check'); }
  } catch {}
}
