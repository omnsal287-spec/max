// AI client. Talks ONLY to our backend (/api/chat). No provider keys, no provider names, nothing to configure here.
// If the backend/AI is unreachable, the local voice (sim/localVoice.js) answers so MAX never goes silent.
import { S, R, emit } from '../core/state.js';
import { stage, aiSummary } from '../brain/personality.js';
import { moodWord } from '../brain/mood.js';
import { activityLabel } from '../brain/maxctl.js';
import * as memory from '../brain/memory.js';
import { lookAt, currentHour } from '../brain/time.js';
import { lang } from '../i18n/index.js';
import { deviceHint } from '../device/capabilities.js';
import { local } from '../sim/localVoice.js';
import { world } from '../render/world.js';
import { lampOn } from '../render/light.js';

const base = () => (window.MAX_CONFIG && window.MAX_CONFIG.apiBase) || '';
let noProvider = false, lastReq = 0, hist = [], healthTimer = 0, failStreak = 0, blockedUntil = 0;
export const setHistory = (h) => { hist = h.slice(-8); };

function roomFacts() {
  const f = []; const look = lookAt(currentHour()); const r = S.room;
  const broken = Object.entries(r.objects).filter(([, o]) => o.broken).map(([k]) => k);
  if (broken.length) f.push('broken: ' + broken.join(', '));
  if (lampOn(look)) f.push('the lamp is on'); if (r.window.open) f.push('the window is open'); if (r.radio.on) f.push('the radio is playing');
  const ks = r.trinkets.map((x) => x.type); if (ks.includes('stone')) f.push('a strange glowing stone lives on the floor'); if (ks.includes('sprout')) f.push('a seedling is growing in the plant pot'); if (ks.includes('scribble')) f.push('MAX drew something on the wall');
  if (Math.abs(r.frame.tilt) > 0.1) f.push('the picture frame hangs crooked');
  return f.slice(0, 6);
}
export function buildContext(message) {
  const look = lookAt(currentHour()); const mems = memory.relevant(message, 5).map((m) => ({ cat: m.cat, text: memory.text(m) }));
  const capsOn = ['memory', 'notifications', 'device', 'voice', 'haptics'].filter((k) => S.user.caps[k]);
  return { lang: lang(), personality: aiSummary(), mood: moodWord(), activity: activityLabel(), relationship: ['just met', 'getting to know each other', 'familiar', 'close'][stage()], phase: look.phase, weather: R.weather,
    room: roomFacts(), memoryEnabled: memory.enabled(), memories: memory.enabled() ? mems : [], event: R.currentEvent === 'aurora' ? 'ribbons of light (aurora) are drifting across the window right now' : '', caps: capsOn, device: deviceHint() };
}
async function post(path, body, ms) {
  const c = new AbortController(); const to = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(base() + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: c.signal }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j }; } finally { clearTimeout(to); }
}
function setStatus(s) { if (R.aiStatus !== s) { const prev = R.aiStatus; R.aiStatus = s; emit('ai:status', { status: s, prev }); } }

/** -> {reply, emotion, memories, source:'ai'|'local', note?} */
export async function ask(message) {
  message = message.slice(0, 600); const ctx = buildContext(message); const payload = { clientId: S.user.clientId, message, context: ctx, history: hist.slice(-6) };
  R.lastAIRequest = { at: Date.now(), payload: JSON.parse(JSON.stringify({ ...payload, clientId: '(random anonymous id, used only for rate limiting)' })) };
  const canTry = navigator.onLine && Date.now() > blockedUntil && R.aiStatus !== 'disabled' && !noProvider;
  if (canTry) {
    const wait = 900 - (Date.now() - lastReq); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); lastReq = Date.now();
    try {
      const { ok, status, j } = await post('/api/chat', payload, 15000);
      if (ok && j.reply) { failStreak = 0; setStatus('online'); return { reply: j.reply, emotion: j.emotion || 'neutral', memories: j.memories || [], source: 'ai' }; }
      if (status === 429) { blockedUntil = Date.now() + 25000; const l = local(message, ctx); return { ...l, source: 'local', note: 'rate' }; }
      failStreak++; if (status === 503) blockedUntil = Date.now() + 60000;
    } catch { failStreak++; blockedUntil = Date.now() + Math.min(60000, 8000 * failStreak); }
    setStatus('local'); scheduleHealth();
  } else if (R.aiStatus === 'unknown') setStatus('local');
  const l = local(message, ctx); return { ...l, source: 'local' };
}
export async function health() {
  if (!navigator.onLine) { setStatus('local'); return false; }
  try { const c = new AbortController(); const to = setTimeout(() => c.abort(), 5000); const r = await fetch(base() + '/api/health', { signal: c.signal, cache: 'no-store' }); clearTimeout(to); const j = await r.json(); noProvider = r.ok && !j.ai; if (r.ok && j.ai) { blockedUntil = 0; failStreak = 0; setStatus('online'); return true; } setStatus('local'); return false; } catch { setStatus('local'); return false; }
}
function scheduleHealth() { clearTimeout(healthTimer); healthTimer = setTimeout(async () => { const ok = await health(); if (!ok) scheduleHealth(); }, 30000); }
export function startHealth() { health(); window.addEventListener('online', () => health()); window.addEventListener('offline', () => setStatus('local')); }
