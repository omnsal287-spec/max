// Settings. Every row here opens something real; nothing is decorative.
import { h, fill } from '../util.js';
import { S, R, commit, resetSlice, saveNow, listen } from '../core/state.js';
import * as storage from '../core/storage.js';
import { makePersonality, makeMax } from '../core/defaults.js';
import { t, lang, LANGS, fmtAgo, fmtDate } from '../i18n/index.js';
import { CAP_IDS, capState, allStates, refreshAll } from '../device/capabilities.js';
import * as bridge from '../device/bridge.js';
import * as notify from '../device/notify.js';
import * as memory from '../brain/memory.js';
import * as perf from '../core/perf.js';
import * as audio from '../audio.js';
import { health } from '../ai/client.js';
import { world, build } from '../render/world.js';
import { scene } from '../render/scene.js';
import { MX } from '../brain/maxctl.js';
import { icon } from './icons.js';
import { openSheet, rowItem, switchRow, segmented, confirmDialog, alertDialog, toast, badge, fmtBytes, toggle } from './components.js';
import { capCard, capSummary, capName, switchCap } from './capabilities.js';
import { langView } from './langsheet.js';
import { maxView, openNotebook, clearMem } from './notebook.js';
import { applyAppearance } from './appearance.js';
import { canInstall, promptInstall, isStandalone, isIOS } from './install.js';
import { reviewSetup } from './onboarding.js';
import { hashStr } from '../util.js';

const VERSION = '1.0.0';
let ctl = null;
export const openSettings = (section) => {
  ctl = openSheet({ title: () => t('set.title'), build: () => root(), onClose: () => { ctl = null; offs.forEach((o) => o()); } });
  const offs = [listen('caps:changed', () => {}), listen('caps:revoked', () => ctl && ctl.refresh())];
  if (section && SECTIONS[section]) ctl.push(SECTIONS[section].title, SECTIONS[section].view); return ctl;
};
const field = (label, node, id) => { const l = h('label', { for: id }, label); node.id = id; return h('div', { class: 'field' }, l, node); };
const note = (s) => h('p', { class: 'note' }, s);
const kv = (a, b) => h('div', { class: 'kv' }, h('span', null, a), h('span', null, b));

function root() {
  const list = h('div', { class: 'list' });
  for (const k of ORDER) { const s = SECTIONS[k]; list.append(rowItem({ ic: s.ic, title: t(s.t), sub: t(s.t + '.d'), danger: k === 'reset', onClick: () => { if (k === 'setup') { ctl.close(); reviewSetup(); } else ctl.push(() => t(s.t), (c) => s.view(c)); } })); }
  return h('div', null, list, h('p', { class: 'note', style: { textAlign: 'center', marginTop: '18px' } }, t('priv.noads')));
}

// ------------------------------------------------------------------ sections
function maxSection() { const b = h('div'); maxView(b); return b; }
function capsSection() {
  const wrap = h('div'); const sum = h('div', { class: 'card', style: { marginBottom: '12px' } }); wrap.append(sum, h('div', { class: 'list' }, CAP_IDS.map((id) => capCard(id))));
  const paint = async () => { const { can, cannot } = await capSummary(); fill(sum, h('b', null, t('caps.sumTitle')), h('p', { class: 'small', style: { margin: '8px 0 4px', color: 'var(--ok)' } }, t('caps.can')), h('ul', { class: 'small', style: { margin: 0, paddingInlineStart: '18px', lineHeight: 1.6 } }, can.length ? can.map((i) => h('li', null, t('can.' + i))) : h('li', null, t('summary.none'))),
    cannot.length ? [h('p', { class: 'small muted', style: { margin: '10px 0 4px' } }, t('caps.cannot')), h('ul', { class: 'small muted', style: { margin: 0, paddingInlineStart: '18px', lineHeight: 1.6 } }, cannot.map((i) => h('li', null, t('cannot.' + i))))] : null); };
  paint(); const offs = ['caps:changed', 'caps:refreshed'].map((e) => listen(e, () => { if (!sum.isConnected) offs.forEach((o) => o()); else paint(); })); return wrap;
}
function memorySection() {
  const w = h('div'); w.append(switchRow({ title: t('mem.toggle'), desc: t('mem.toggle.d'), checked: memory.enabled(), onChange: async (v) => { const ok = await switchCap('memory', v); return ok; } }));
  w.append(h('div', { class: 'list', style: { marginTop: '8px' } }, rowItem({ ic: 'book', title: t('mem.open'), sub: t('mem.count', { n: memory.count() }), onClick: () => { ctl.close(); setTimeout(() => openNotebook('mem'), 280); } }),
    rowItem({ ic: 'trash', title: t('mem.clear'), danger: true, onClick: clearMem })));
  w.append(note(t('cap.memory.note'))); return w;
}
function notifSection() {
  const w = h('div'); const n = S.user.notif; const perm = h('span'); const paintPerm = () => { const p = notify.permission(); perm.replaceChildren(badge(p === 'granted' ? 'on' : p === 'denied' ? 'warn' : 'off', t('os.' + (p === 'default' ? 'prompt' : p === 'unsupported' ? 'unsupported' : p)))); }; paintPerm();
  w.append(switchRow({ title: t('notif.toggle'), desc: t('notif.how'), checked: S.user.caps.notifications, onChange: async (v) => { const ok = await switchCap('notifications', v); paintPerm(); notify.syncPrefs(); ctl && setTimeout(() => ctl.refresh(), 50); return ok; } }));
  w.append(h('div', { class: 'kv' }, h('span', null, t('notif.perm')), perm), note(t('notif.limit')));
  w.append(h('div', { class: 'h-label' }, t('notif.quiet')));
  w.append(switchRow({ title: t('notif.quiet'), checked: n.quietOn, onChange: async (v) => { commit('user', (u) => { u.notif.quietOn = v; }, 'notif'); notify.syncPrefs(); return true; } }));
  const tm = (key, label, id) => { const i = h('input', { type: 'time', value: n[key] }); i.addEventListener('change', () => { if (!i.value) return; commit('user', (u) => { u.notif[key] = i.value; }, 'notif'); notify.syncPrefs(); }); return field(label, i, id); };
  w.append(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, tm('quietStart', t('notif.from'), 'qs'), tm('quietEnd', t('notif.to'), 'qe')));
  const can = S.user.caps.notifications && notify.permission() === 'granted';
  w.append(h('button', { class: 'btn block', disabled: can ? null : true, style: { marginTop: '14px' }, onclick: async () => { const ok = await notify.send({ title: t('app.name'), body: t('notif.test.body'), tag: 'test', force: true }); toast(ok ? t('notif.testSent') : t('err.generic')); } }, icon('bell'), t('notif.test')));
  return w;
}
function appearanceSection() {
  const a = S.user.appearance; const w = h('div');
  w.append(h('div', { class: 'h-label' }, t('app.time')), note(t('app.time.d')));
  const opts = [{ value: 'auto', label: t('app.time.auto') }, ...['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night'].map((p) => ({ value: p, label: t('phase.' + p) }))];
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('app.time') }, opts.map((o) => h('button', { 'aria-pressed': String(a.timeOverride === o.value), onclick: (e) => { commit('user', (u) => { u.appearance.timeOverride = o.value; }, 'appearance'); scene.lightDirty = true; chips.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i].value === o.value))); } }, o.label))); w.append(chips);
  w.append(h('div', { class: 'h-label' }, t('app.text')));
  const r = h('input', { type: 'range', min: 0.85, max: 1.4, step: 0.05, value: a.textScale, 'aria-label': t('app.text') }); r.addEventListener('input', () => { commit('user', (u) => { u.appearance.textScale = +r.value; }, 'appearance'); applyAppearance(); }); w.append(r);
  w.append(switchRow({ title: t('app.contrast'), checked: a.contrast, onChange: (v) => { commit('user', (u) => { u.appearance.contrast = v; }, 'appearance'); applyAppearance(); return true; } }));
  w.append(h('div', { class: 'h-label' }, t('app.motion')), segmented({ label: t('app.motion'), value: a.motion, options: [{ value: 'system', label: t('app.motion.system') }, { value: 'on', label: t('app.motion.on') }, { value: 'off', label: t('app.motion.off') }], onChange: (v) => { commit('user', (u) => { u.appearance.motion = v; }, 'appearance'); applyAppearance(); } }));
  return w;
}
function perfSection() {
  const w = h('div'); const cur = h('p', { class: 'note' }); const d = h('p', { class: 'note' }); const paint = () => { cur.textContent = t('perf.now', { q: t('perf.' + perf.currentName()) }); d.textContent = t('perf.' + S.user.perf.mode + '.d'); }; paint();
  w.append(segmented({ label: t('perf.mode'), value: S.user.perf.mode, options: ['auto', 'low', 'medium', 'high'].map((m) => ({ value: m, label: t('perf.' + m) })), onChange: (v) => { perf.setMode(v); paint(); } }), d, cur); return w;
}
function soundSection() {
  const w = h('div'); const U = S.user.sound;
  if (!S.user.caps.sound) w.append(h('div', { class: 'card', style: { marginBottom: '10px' } }, switchRow({ title: t('snd.on'), desc: t('snd.needCap'), checked: false, onChange: async (v) => { const ok = await switchCap('sound', v); if (ok) { audio.unlock(); setTimeout(() => ctl && ctl.refresh(), 60); } return ok; } })));
  else w.append(switchRow({ title: t('snd.on'), checked: true, onChange: async (v) => { await switchCap('sound', v); audio.applyVolumes(); setTimeout(() => ctl && ctl.refresh(), 60); return true; } }));
  const dis = !S.user.caps.sound;
  const r = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: U.volume, 'aria-label': t('snd.volume'), disabled: dis || null }); r.addEventListener('input', () => { commit('user', (u) => { u.sound.volume = +r.value; u.sound.muted = false; }, 'sound'); audio.applyVolumes(); }); r.addEventListener('change', () => { audio.unlock(); audio.sfx.chime(); });
  w.append(field(t('snd.volume'), r, 'vol'));
  for (const [k, l] of [['ambience', 'snd.ambience'], ['voice', 'snd.voice'], ['music', 'snd.music']]) w.append(switchRow({ title: t(l), checked: U[k], disabled: dis, onChange: (v) => { commit('user', (u) => { u.sound[k] = v; }, 'sound'); audio.applyVolumes(); return true; } }));
  return w;
}
function privacySection() {
  const w = h('div'); const card = (title, body) => h('div', { class: 'card', style: { marginBottom: '10px' } }, h('b', null, title), h('p', { class: 'small muted', style: { margin: '6px 0 0', lineHeight: 1.55 } }, body));
  w.append(card(t('priv.local'), t('priv.local.b')), card(t('priv.sent'), t('priv.sent.b')), note(t('priv.never')));
  w.append(h('div', { class: 'h-label' }, t('priv.perms'))); const list = h('div', { class: 'card' }); w.append(list);
  allStates().then((all) => list.replaceChildren(...CAP_IDS.map((id) => { const st = all[id]; const on = st.enabled && st.effective; return h('div', { class: 'kv' }, h('span', null, capName(id)), badge(on ? 'on' : st.status === 'denied' ? 'warn' : 'off', on ? t('state.enabled') : st.status === 'denied' ? t('state.denied') : st.status === 'unsupported' ? t('state.unsupported') : t('state.disabled'))); })));
  w.append(h('div', { class: 'h-label' }, t('priv.last'))); const req = R.lastAIRequest;
  w.append(req ? h('pre', { class: 'diag' }, JSON.stringify(req.payload, null, 2)) : note(t('priv.last.none')), note(t('priv.noads'))); return w;
}
async function exportData() {
  const user = JSON.parse(JSON.stringify(S.user)); delete user.clientId; if (user.advanced) user.advanced.token = '';
  const moments = (await storage.all('moments')).map((m) => ({ ...m, snap: undefined })); const chat = await storage.all('chat');
  const data = { app: 'MAX', version: VERSION, exportedAt: new Date().toISOString(), max: S.max, room: S.room, user, events: S.events, memories: memory.list(), chat, moments };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'max-data.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(t('data.exported'));
}
function dataSection() {
  const w = h('div'); const use = h('span', null, '…');
  w.append(h('div', { class: 'list' }, rowItem({ ic: 'download', title: t('data.export'), sub: t('data.export.d'), onClick: exportData })));
  w.append(h('div', { class: 'card', style: { marginTop: '12px' } }, h('div', { class: 'kv' }, h('span', null, t('data.storage')), h('span', null, storage.mode === 'idb' ? t('data.storage.idb') : t('data.storage.mem'))), h('div', { class: 'kv' }, h('span', null, t('set.memory')), h('span', null, t('mem.count', { n: memory.count() }))), h('div', { class: 'kv' }, h('span', null, t('data.size')), use)));
  try { navigator.storage.estimate().then((e) => { use.textContent = fmtBytes(e.usage || 0); }); } catch { use.textContent = '—'; }
  if (storage.mode !== 'idb') w.append(note(t('err.storage'))); return w;
}
function advancedSection() {
  const w = h('div'); const A = S.user.advanced;
  const status = h('span'); const paint = () => { status.replaceChildren(badge(R.aiStatus === 'online' ? 'on' : 'off', t('adv.ai.' + (R.aiStatus === 'online' ? 'online' : R.aiStatus === 'local' ? 'local' : 'unknown')))); }; paint();
  w.append(h('div', { class: 'h-label' }, t('adv.ai')), h('div', { class: 'card' }, h('div', { class: 'kv' }, h('span', null, t('adv.ai')), status), h('button', { class: 'btn small block', style: { marginTop: '8px' }, onclick: async () => { await health(); paint(); } }, icon('refresh'), t('adv.check'))));
  w.append(h('div', { class: 'h-label' }, t('adv.device')), capCard('advanced', { compact: true }), note(t('adv.help')));
  const url = h('input', { type: 'url', value: A.bridgeUrl, autocomplete: 'off', spellcheck: 'false', dir: 'ltr' }); const tok = h('input', { type: 'text', value: A.token, autocomplete: 'off', spellcheck: 'false', dir: 'ltr' });
  const res = h('p', { class: 'note', role: 'status' });
  w.append(field(t('adv.url'), url, 'bu'), field(t('adv.token'), tok, 'bt'), h('button', { class: 'btn block', onclick: async () => { commit('user', (u) => { u.advanced.bridgeUrl = url.value.trim(); u.advanced.token = tok.value.trim(); }, 'adv'); const ok = await bridge.test(); res.textContent = ok ? t('adv.ok') : t('adv.fail'); refreshAll(); } }, icon('zap'), t('adv.test')), res);
  w.append(h('div', { class: 'h-label' }, t('adv.actions')));
  const acts = [['vibrate', 'adv.vibrate', { ms: 120 }], ['toast', 'adv.toast', { text: 'MAX' }], ['torch', 'adv.torch', {}]];
  w.append(h('div', { class: 'list' }, acts.map(([id, l, pl]) => rowItem({ ic: id === 'torch' ? 'zap' : id === 'toast' ? 'chat' : 'wave', title: t(l), sub: bridge.ACTIONS[id].danger ? t('adv.danger') : t('adv.safe'),
    onClick: async () => { try { const r = await bridge.run(id, pl, () => confirmDialog({ title: t(l), body: t('adv.confirm.' + id), ok: t('yes') })); if (!r.cancelled) toast(t('adv.done')); } catch { toast(t('adv.unavailable')); } } }))), note(t('adv.fine')));
  w.append(h('div', { class: 'h-label' }, t('adv.diag'))); const pre = h('pre', { class: 'diag' }, '…'); w.append(pre);
  allStates().then(async (all) => { const sw = 'serviceWorker' in navigator ? ((await navigator.serviceWorker.getRegistration()) ? 'registered' : 'none') : 'unsupported'; pre.textContent = [`version ${VERSION}`, `lang ${lang()} · storage ${storage.mode} · sw ${sw} · standalone ${isStandalone()}`, `quality ${perf.currentName()} (${perf.mode()}) · fps ${Math.round(R.fps || 0)} · dpr ${devicePixelRatio}`, `ai ${R.aiStatus} · online ${navigator.onLine}`, ...CAP_IDS.map((id) => `${id}: ${all[id].status} os=${all[id].os}`)].join('\n'); });
  return w;
}
function aboutSection() {
  const w = h('div'); w.append(h('div', { style: { textAlign: 'center', padding: '8px 0 12px' } }, h('img', { src: '/icons/icon-192.png', width: 88, height: 88, alt: '', style: { borderRadius: '22px' } }), h('h3', { style: { margin: '10px 0 2px' } }, 'MAX'), h('div', { class: 'muted small' }, t('about.version', { v: VERSION }))), h('p', { class: 'note', style: { lineHeight: 1.6 } }, t('about.body')));
  if (isStandalone()) w.append(h('div', { class: 'card' }, h('div', { class: 'kv' }, h('span', null, t('hud.install')), badge('on', t('about.installed')))));
  else if (canInstall()) w.append(h('button', { class: 'btn primary block', onclick: async () => { const ok = await promptInstall(); if (ok) ctl && ctl.refresh(); } }, icon('install'), t('hud.install')));
  else w.append(note(isIOS() ? t('install.ios') : t('about.notInstallable')));
  w.append(note(t('priv.noads'))); return w;
}
function resetSection() {
  const w = h('div'); const item = (ic, k, fn) => rowItem({ ic, title: t('reset.' + k), sub: t('reset.' + k + '.d'), danger: true, onClick: async () => { const ok = await confirmDialog({ title: t('reset.' + k), body: t('reset.' + k + (k === 'mem' ? '.d' : '.c')), ok: t('confirm'), danger: true }); if (ok) { await fn(); toast(t('reset.done')); } } });
  w.append(h('div', { class: 'list' }, item('room', 'room', resetRoom), item('heart', 'pers', resetPersonality), item('trash', 'mem', async () => memory.clearAll()), item('reset', 'all', resetAll))); return w;
}
async function resetRoom() { await resetSlice('room'); commit('events', (e) => { e.completed = {}; e.cooldowns = {}; }, 'reset'); build(world.L.H); scene.lightDirty = true; MX.x = 200; }
async function resetPersonality() { const fresh = makeMax(); commit('max', (m) => { m.seed = fresh.seed; m.personality = fresh.personality; m.relationship = { ...fresh.relationship, sessions: m.relationship.sessions }; m.mood = fresh.mood; }, 'reset'); }
async function resetAll() { saveNow(); await storage.wipeEverything(); try { const r = await navigator.serviceWorker?.getRegistrations(); r && r.forEach((x) => x.unregister()); } catch {} try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch {} location.reload(); }

const SECTIONS = {
  max: { t: 'set.max', ic: 'heart', view: maxSection, title: () => t('set.max') }, caps: { t: 'set.caps', ic: 'sliders', view: capsSection, title: () => t('set.caps') },
  setup: { t: 'set.setup', ic: 'spark', view: () => h('div'), title: () => t('set.setup') }, memory: { t: 'set.memory', ic: 'book', view: memorySection, title: () => t('set.memory') },
  notif: { t: 'set.notif', ic: 'bell', view: notifSection, title: () => t('set.notif') }, lang: { t: 'set.lang', ic: 'globe', view: langView, title: () => t('set.lang') },
  appearance: { t: 'set.appearance', ic: 'palette', view: appearanceSection, title: () => t('set.appearance') }, perf: { t: 'set.perf', ic: 'zap', view: perfSection, title: () => t('set.perf') },
  sound: { t: 'set.sound', ic: 'vol', view: soundSection, title: () => t('set.sound') }, privacy: { t: 'set.privacy', ic: 'shield', view: privacySection, title: () => t('set.privacy') },
  data: { t: 'set.data', ic: 'database', view: dataSection, title: () => t('set.data') }, advanced: { t: 'set.advanced', ic: 'terminal', view: advancedSection, title: () => t('set.advanced') },
  about: { t: 'set.about', ic: 'info', view: aboutSection, title: () => t('set.about') }, reset: { t: 'set.reset', ic: 'reset', view: resetSection, title: () => t('set.reset') },
};
const ORDER = ['max', 'caps', 'setup', 'memory', 'notif', 'lang', 'appearance', 'perf', 'sound', 'privacy', 'data', 'advanced', 'about', 'reset'];
