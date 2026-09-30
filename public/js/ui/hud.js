// On-stage HUD: MAX chip, sound/settings, dock (notebook / talk / room), room tray, hints, speech bubble.
import { h } from '../util.js';
import { S, R, commit, listen } from '../core/state.js';
import { t, onLang } from '../i18n/index.js';
import { moodWord } from '../brain/mood.js';
import { MX, sc, emote } from '../brain/maxctl.js';
import { toScreen } from '../render/scene.js';
import { toggleLamp, toggleWindow, toggleRadio, throwBall } from '../brain/interactions.js';
import { lampOn } from '../render/light.js';
import { lookAt, currentHour } from '../brain/time.js';
import { icon } from './icons.js';
import { mountMini } from './miniMax.js';
import { stage } from './components.js';
import * as audio from '../audio.js';

let els = {}; let hintTimer = 0; let trayOpen = false; let mini = null;

export function initHud({ onTalk, onNotebook, onSettings }) {
  const st = stage();
  const cv = h('canvas', { width: 64, height: 64, 'aria-hidden': 'true' });
  els.chip = h('button', { class: 'chip', onclick: () => onNotebook('max') }, cv, h('span', null, h('b', null, 'MAX'), ' ', h('small', { id: 'mood-word' })));
  els.sound = h('button', { class: 'icon-btn', onclick: toggleMute });
  els.settings = h('button', { class: 'icon-btn', onclick: onSettings }, icon('gear'));
  els.top = h('div', { id: 'hud-top' }, h('div', { class: 'stack' }, els.chip), h('div', { class: 'top-actions' }, els.sound, els.settings));
  els.nb = h('button', { class: 'icon-btn', onclick: () => { R.notebookDot = false; els.nbDot.hidden = true; onNotebook(); } }, icon('book'), els.nbDot = h('span', { class: 'dot', hidden: true }));
  els.talk = h('button', { class: 'icon-btn talk', onclick: onTalk }, icon('chat'));
  els.roomBtn = h('button', { class: 'icon-btn', 'aria-expanded': 'false', onclick: () => setTray(!trayOpen) }, icon('room'));
  els.dock = h('div', { class: 'dock' }, els.nb, els.talk, els.roomBtn);
  els.tray = h('div', { class: 'tray', role: 'group' });
  els.bottom = h('div', { id: 'hud-bottom' }, els.dock);
  els.hint = h('div', { id: 'hint', 'aria-live': 'polite' });
  els.bubble = h('div', { id: 'bubble', 'aria-hidden': 'true' });
  els.live = h('div', { class: 'sr', 'aria-live': 'polite', id: 'max-live' });
  els.toasts = document.getElementById('toasts') || h('div', { id: 'toasts' });
  st.append(els.top, els.bottom, els.hint, els.bubble, els.live, els.toasts);
  mini = mountMini(cv, { emotion: 'calm', animate: false });
  listen('max:speech', ({ text, fromChat }) => { if (!fromChat) els.live.textContent = text; });
  listen('ai:status', () => {}); onLang(labels); labels(); paintTray();
  setInterval(() => { const w = document.getElementById('mood-word'); if (w) w.textContent = t('mood.' + moodWord()); els.nbDot.hidden = !R.notebookDot; els.talk.classList.toggle('pulse-ring', !!R.pulseChat); }, 1500);
  listen('caps:changed', paintSound); listen('caps:refreshed', paintSound);
}
function labels() {
  els.chip.setAttribute('aria-label', 'MAX — ' + t('mood.' + moodWord())); els.settings.setAttribute('aria-label', t('hud.settings')); els.nb.setAttribute('aria-label', t('hud.notebook')); els.talk.setAttribute('aria-label', t('hud.talk'));
  els.roomBtn.setAttribute('aria-label', t('hud.room')); paintSound(); paintTray(); const w = document.getElementById('mood-word'); if (w) w.textContent = t('mood.' + moodWord());
}
function toggleMute() { commit('user', (u) => { u.sound.muted = !u.sound.muted; }, 'sound'); audio.applyVolumes(); audio.unlock(); paintSound(); }
export function paintSound() {
  const off = !S.user.caps.sound || S.user.sound.muted; els.sound.replaceChildren(icon(off ? 'mute' : 'vol')); els.sound.setAttribute('aria-label', off ? t('hud.soundOff') : t('hud.soundOn')); els.sound.setAttribute('aria-pressed', String(off));
}
function setTray(open) { trayOpen = open; els.roomBtn.setAttribute('aria-expanded', String(open)); if (open) { paintTray(); els.bottom.prepend(els.tray); } else els.tray.remove(); }
function paintTray() {
  const look = lookAt(currentHour());
  const mk = (ic, key, pressed, fn) => h('button', { class: 'icon-btn', 'aria-label': t('tray.' + key), 'aria-pressed': pressed == null ? null : String(pressed), title: t('tray.' + key), onclick: () => { fn(); setTimeout(paintTray, 60); } }, icon(ic));
  els.tray.replaceChildren(mk('lamp', 'lamp', lampOn(look), toggleLamp), mk('window', 'window', S.room.window.open, toggleWindow), mk('radio', 'radio', S.room.radio.on, toggleRadio), mk('ball', 'ball', null, throwBall));
}
export function toggleTrayExternal() { setTray(false); }
export function getMini() { return mini; }

// ------------------------------------------------------------------ hints (short, one at a time, always dismissible by time)
let hintId = null;
export function showHint(key, id, ms = 8000) {
  if (document.getElementById('chat')) { setTimeout(() => showHint(key, id, ms), 4000); return; } // never sit behind the chat panel
  clearTimeout(hintTimer); hintId = id; const el = h('div', { class: 'hint', role: 'status' }, t(key)); els.hint.replaceChildren(el);
  hintTimer = setTimeout(() => hideHint(id), ms);
}
export function hideHint(id) { if (id && hintId && id !== hintId) return; const el = els.hint.firstChild; if (!el) return; el.classList.add('out'); clearTimeout(hintTimer); setTimeout(() => { if (els.hint.firstChild === el) el.remove(); }, 300); hintId = null; }

// ------------------------------------------------------------------ speech bubble over MAX
let lastText = '';
export function updateBubble() {
  const b = els.bubble; if (!b) return; const sp = MX.speech; const visible = sp && !R.chatOpen && sp.t < sp.dur - 0.0;
  if (!visible) { if (b.classList.contains('show')) b.classList.remove('show'); return; }
  if (sp.text !== lastText) { b.textContent = sp.text; lastText = sp.text; }
  const k = sc(); const p = toScreen(MX.x, (MX.surface === 'floor' ? MX.y : MX.lane) - 82 * k); const r = stage().getBoundingClientRect();
  const w = b.offsetWidth || 120; const hgt = b.offsetHeight || 40; let x = p.x - r.left - w / 2; const minX = 10, maxX = r.width - w - 10; const cx = Math.max(minX, Math.min(maxX, x));
  const y = Math.max(76, p.y - r.top - hgt - 8);
  b.style.setProperty('--tail', Math.max(16, Math.min(w - 16, p.x - r.left - cx)) + 'px'); b.style.transform = `translate(${cx.toFixed(1)}px, ${y.toFixed(1)}px)`;
  b.classList.add('show');
}
export function hideBubbleNow() { els.bubble && els.bubble.classList.remove('show'); }
export const setHudVisible = (v) => { for (const k of ['top', 'bottom']) els[k] && (els[k].style.display = v ? '' : 'none'); };
