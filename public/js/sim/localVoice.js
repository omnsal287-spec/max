// LOCAL SIMULATION LAYER (development fallback / offline behaviour).
// Not the production AI. Used only when the backend is unreachable or has no provider configured.
// It is deliberately simple: intent keywords + MAX's personality/mood/room/memory -> a short line from i18n packs.
import { S, R } from '../core/state.js';
import { say, pack, t, lang } from '../i18n/index.js';
import * as memory from '../brain/memory.js';
import { moodWord } from '../brain/mood.js';
import { lookAt, currentHour } from '../brain/time.js';

const SPACELESS = new Set(['zh']);
function words(msg) { return new Set(msg.toLowerCase().split(/[^\p{L}\p{M}\p{N}'’]+/u).filter(Boolean)); }
function has(msg, w, list) { const l = msg.toLowerCase(); return (list || []).some((p) => (SPACELESS.has(lang()) || p.includes(' ') ? l.includes(p) : w.has(p))); }

export function local(message, ctx) {
  const msg = message.trim(); const w = words(msg); const I = pack()?.intents || {}; const mood = moodWord(); const look = lookAt(currentHour());
  const facts = memory.extractFacts(msg);
  const out = (cat, emotion, vars) => ({ reply: say(cat, vars), emotion, memories: [], facts });
  if (facts.length) { const f = facts[0]; if (f.kind === 'name') return out('chat_name', 'happy', { name: f.value }); if (f.kind === 'like') return out('chat_like', 'curious', { thing: f.value }); return out('chat_dislike', 'neutral', { thing: f.value }); }
  if (has(msg, w, I.rude)) return out('chat_rude', 'annoyed');
  if (has(msg, w, I.love)) return out('chat_love', 'shy');
  if (has(msg, w, I.thanks)) return out('chat_thanks', 'happy');
  if (has(msg, w, I.bye)) return out('chat_bye', 'calm');
  if (has(msg, w, I.joke)) return out('chat_joke', 'happy');
  if (has(msg, w, I.who)) return out('chat_who', 'curious');
  if (has(msg, w, I.how)) return out(mood === 'sleepy' ? 'chat_how_sleepy' : ['grumpy', 'uneasy'].includes(mood) ? 'chat_how_low' : 'chat_how_good', mood === 'sleepy' ? 'sleepy' : 'calm');
  if (has(msg, w, I.weather)) { const word = pack()?.say['w_' + R.weather] || R.weather; return out('chat_weather', 'curious', { weather: word }); }
  if (has(msg, w, I.greet)) return out('chat_greet', 'happy');
  const broken = Object.keys(S.room.objects).filter((k) => S.room.objects[k].broken);
  if (broken.length && Math.random() < 0.25) return out('chat_room_broken', 'confused', { item: t('obj.' + broken[0]) });
  if (S.max.sleep.asleep || mood === 'sleepy') if (Math.random() < 0.35) return out('chat_sleepy', 'sleepy');
  if (/[?？؟]/.test(msg)) return out('chat_question', 'curious');
  if (Math.random() < 0.12) return out(look.night > 0.5 ? 'chat_time_night' : 'chat_time_day', 'calm');
  return out('chat_generic', 'curious');
}
