// Chat with MAX. Native to the room: the room stays visible above, MAX keeps moving, replies appear as MAX speaking.
import { h, uid, pick } from '../util.js';
import { S, R, commit, emit, listen } from '../core/state.js';
import * as storage from '../core/storage.js';
import { t, lang, onLang } from '../i18n/index.js';
import { MX, emote, sayText, sayLine } from '../brain/maxctl.js';
import { impulse } from '../brain/mood.js';
import * as memory from '../brain/memory.js';
import { ask, setHistory } from '../ai/client.js';
import { setInset } from '../render/scene.js';
import { listenOnce, stopListening, capState, refreshAll } from '../device/capabilities.js';
import { icon } from './icons.js';
import { mountMini } from './miniMax.js';
import { stage, toast, confirmDialog } from './components.js';
import { hideBubbleNow, hideHint } from './hud.js';
import * as audio from '../audio.js';

let el = null, log, input, sendBtn, micBtn, sug, head, mini, typingEl, busy = false, session = [], lastAmbient = '', noteShownRate = false;
export const isOpen = () => !!el;

async function loadLog() {
  if (memory.enabled()) { const all = (await storage.all('chat')).sort((a, b) => a.ts - b.ts).slice(-30); session = all; }
  setHistory(session.filter((m) => m.role === 'me' || m.role === 'max').map((m) => ({ role: m.role === 'me' ? 'user' : 'max', text: m.text })));
}
async function persist(m) { if (!memory.enabled() || m.role === 'sys') return; await storage.put('chat', m); const all = await storage.all('chat'); if (all.length > 80) for (const o of all.sort((a, b) => a.ts - b.ts).slice(0, all.length - 80)) await storage.del('chat', o.id); }
function addMsg(role, text, { persistIt = true } = {}) {
  const m = { id: uid(), role, text, ts: Date.now() }; session.push(m); if (session.length > 60) session.shift();
  if (log) { log.append(h('div', { class: 'msg ' + role }, text)); scrollDown(); }
  if (persistIt && role !== 'sys') persist(m);
  if (role !== 'sys') setHistory(session.filter((x) => x.role !== 'sys').map((x) => ({ role: x.role === 'me' ? 'user' : 'max', text: x.text })));
  if (sug) sug.hidden = true; return m;
}
const scrollDown = () => requestAnimationFrame(() => { if (log) log.scrollTop = log.scrollHeight; });

function noteTopics(text) {
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 5 && w.length <= 18); if (!words.length) return;
  commit('max', (m) => { const tp = m.personality.topics; for (const w of new Set(words)) tp[w] = (tp[w] || 0) + 1; const ks = Object.keys(tp); if (ks.length > 30) for (const k of ks.sort((a, b) => tp[a] - tp[b]).slice(0, ks.length - 30)) delete tp[k]; }, 'chat');
}

async function send(raw) {
  const text = (raw ?? input.value).trim(); if (!text || busy) return; busy = true; input.value = ''; sendBtn.disabled = true; R.lastInput = performance.now(); R.userPresent = true; audio.unlock(); audio.sfx.tap && audio.sfx.tap();
  addMsg('me', text); R.session.chats++; MX.lookMode = 'user'; MX.lookHold = 6; if (!S.max.sleep.asleep) emote('curious', 1.2);
  commit('max', (m) => { m.relationship.chats++; m.daily.chats++; m.relationship.bond = Math.min(1, m.relationship.bond + 0.006); m.lastInteraction = Date.now(); }, 'chat'); impulse(0.03, 0.06); noteTopics(text);
  const t0 = performance.now(); const tm = setTimeout(showTyping, 350);
  let res; try { res = await ask(text); } catch { res = { reply: '…', emotion: 'confused', memories: [], source: 'local' }; }
  clearTimeout(tm);
  // a short natural beat so replies don't feel instant
  const beat = Math.min(1500, 450 + res.reply.length * 12) - (performance.now() - t0); if (beat > 0) { showTyping(); await new Promise((r) => setTimeout(r, beat)); }
  hideTyping(); busy = false; if (sendBtn) sendBtn.disabled = false;
  if (S.max.sleep.asleep) { /* the chat woke MAX through emote/wake elsewhere */ }
  if (!el) { /* closed while waiting: MAX just says it */ sayText(res.reply, { emotion: res.emotion }); } else { addMsg('max', res.reply); sayText(res.reply, { emotion: res.emotion, fromChat: true }); }
  // memories: local extraction always works; the AI may add a few more (validated, capped)
  if (memory.enabled()) {
    const saved = []; const facts = res.facts || memory.extractFacts(text); if (facts.length) saved.push(...await memory.rememberFacts(facts));
    for (const m of (res.memories || []).slice(0, 2)) { if (m && typeof m.text === 'string' && m.text.trim().length > 2 && memory.CATS.includes(m.cat) && m.cat !== 'digest') saved.push(await memory.add({ cat: m.cat, text: m.text.trim().slice(0, 160), importance: Math.min(5, Math.max(1, +m.importance || 3)), source: 'ai' })); }
    if (saved.filter(Boolean).length && el) log.append(h('div', { class: 'msg sys' }, t('chat.kept'))), scrollDown();
    if (!S.max.flags.firstChat && S.max.relationship.chats >= 3) { commit('max', (m) => { m.flags.firstChat = true; }, 'chat'); memory.add({ cat: 'relationship', tk: 'memk.first', importance: 4, source: 'auto', dedupeKey: 'firstchat' }); }
  }
  if (res.note === 'rate' && !noteShownRate && el) { noteShownRate = true; log.append(h('div', { class: 'msg sys' }, t('chat.rate'))); scrollDown(); }
  paintHead(); input && input.focus({ preventScroll: true });
}
function showTyping() { if (!log || typingEl) return; typingEl = h('div', { class: 'typing', 'aria-label': '…' }, h('i'), h('i'), h('i')); log.append(typingEl); scrollDown(); }
function hideTyping() { typingEl && typingEl.remove(); typingEl = null; }
function paintHead() { if (!head) return; const local = R.aiStatus === 'local'; head.querySelector('small').textContent = local ? t('chat.local') : t('mood.' + (S.max.emotional && t('mood.' + S.max.emotional) !== 'mood.' + S.max.emotional ? S.max.emotional : 'calm')); }

export async function openChat() {
  if (el) return; await loadLog(); R.chatOpen = true; hideBubbleNow(); hideHint();
  const cv = h('canvas', { width: 68, height: 68, 'aria-hidden': 'true' });
  head = h('div', { class: 'chat-head' }, h('div', { class: 'who' }, cv, h('div', null, h('b', null, 'MAX'), h('small'))),
    h('button', { class: 'icon-btn', 'aria-label': t('chat.clear'), onclick: clear }, icon('trash')), h('button', { class: 'icon-btn', 'aria-label': t('chat.close'), onclick: closeChat }, icon('close')));
  log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': t('hud.talk') });
  sug = h('div', { class: 'chat-sug' }); input = h('input', { type: 'text', maxlength: 600, enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'sentences', 'aria-label': t('chat.placeholder'), placeholder: t('chat.placeholder') });
  sendBtn = h('button', { type: 'submit', class: 'icon-btn send', 'aria-label': t('send') }, icon('send')); micBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('chat.mic'), onclick: mic }, icon('mic'));
  el = h('div', { id: 'chat', role: 'region', 'aria-label': t('hud.talk') }, head, log, sug, !memory.enabled() ? h('div', { class: 'chat-note' }, t('chat.memoryOff')) : null, h('form', { class: 'chat-in', onsubmit: (e) => { e.preventDefault(); send(); } }, input, micBtn, sendBtn));
  stage().append(el); mini = mountMini(cv, { emotion: 'calm', animate: false }); paintHead(); setMic();
  for (const m of session.slice(-14)) log.append(h('div', { class: 'msg ' + m.role }, m.text));
  if (!session.length) { const tips = [1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 3); sug.replaceChildren(...tips.map((i) => h('button', { onclick: () => send(t('chat.s' + i)) }, t('chat.s' + i)))); } else sug.hidden = true;
  scrollDown(); requestAnimationFrame(() => { setInset(el.offsetHeight); }); setTimeout(() => setInset(el.offsetHeight), 350);
  if (!S.max.sleep.asleep) { MX.lookMode = 'user'; MX.lookHold = 5; }
  emit('ui:chatOpened', {}); setTimeout(() => input && input.focus({ preventScroll: true }), 420);
}
export function closeChat() {
  if (!el) return; stopListening(); const c = el; c.classList.add('closing'); R.chatOpen = false; setInset(0); el = null; mini && mini.destroy();
  setTimeout(() => c.remove(), R.reduceMotion ? 0 : 240); log = input = sendBtn = micBtn = sug = head = null;
}
async function clear() {
  const ok = await confirmDialog({ title: t('chat.clear'), body: t('chat.clear.c'), ok: t('delete'), danger: true }); if (!ok) return;
  session = []; await storage.clear('chat'); setHistory([]); if (log) log.replaceChildren(); if (sug) sug.hidden = true;
}
async function setMic() {
  if (!micBtn) return; const st = await capState('voice'); micBtn.hidden = !(S.user.caps.voice && st.supported && st.os !== 'denied');
}
let listening = false;
async function mic() {
  if (listening) { stopListening(); return; } listening = true; micBtn.classList.add('rec'); micBtn.setAttribute('aria-label', t('chat.listening')); input.placeholder = t('chat.listening');
  try { const txt = await listenOnce(lang(), (s) => { if (input) input.value = s; }); if (txt && txt.trim()) { if (input) input.value = txt; send(); } else toast(t('chat.noSpeech')); }
  catch (e) { if (String(e.message).includes('not-allowed') || String(e.message).includes('service-not-allowed')) { await refreshAll(); toast(t('perm.denied', { name: t('cap.voice.name') })); } else if (!String(e.message).includes('aborted') && !String(e.message).includes('no-speech')) toast(t('err.generic')); else toast(t('chat.noSpeech')); }
  listening = false; if (micBtn) { micBtn.classList.remove('rec'); micBtn.setAttribute('aria-label', t('chat.mic')); } if (input) input.placeholder = t('chat.placeholder'); setMic();
}
export function initChat() {
  listen('max:speech', ({ text, fromChat, silent }) => { if (!el || fromChat || silent || text === lastAmbient) return; lastAmbient = text; addMsg('max', text, { persistIt: false }); });
  listen('caps:changed', setMic); listen('caps:refreshed', setMic); listen('ai:status', paintHead);
  onLang(() => { if (!el) return; input.placeholder = t('chat.placeholder'); input.setAttribute('aria-label', t('chat.placeholder')); paintHead(); });
  addEventListener('resize', () => { if (el) setInset(el.offsetHeight); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && el && !R.dialogOpen) closeChat(); });
}
